"""AI provider abstraction. The application talks to `AIProvider.complete`; the Anthropic implementation
streams (so long runs can be cancelled), retries transient failures with bounded exponential backoff, and
maps SDK errors to plain-language messages. `MockProvider` is a deterministic offline stand-in for tests."""
from __future__ import annotations

import logging
import random
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..config import settings

log = logging.getLogger(__name__)

# USD per million tokens (input, output). Used only for estimates; unknown models show no estimate.
PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-1": (10.0, 50.0), "claude-fable-5": (10.0, 50.0),
    "claude-opus-5-5": (4.0, 20.0), "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0), "claude-opus-4-7": (5.0, 25.0), "claude-opus-4-6": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0), "claude-sonnet-5": (2.0, 10.0), "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-5-5": (0.10, 0.50), "claude-haiku-4-5": (1.0, 5.0),
}
# Models that accept the server-side refusal fallback parameter (fallbacks="default").
FALLBACK_MODELS = {"claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    p = PRICES.get(model)
    if not p:
        return None
    return round(input_tokens / 1e6 * p[0] + output_tokens / 1e6 * p[1], 6)


@dataclass
class ImagePart:
    media_type: str
    data_b64: str
    label: str


@dataclass
class AIRequest:
    workflow: str
    system: str
    parts: list[str | ImagePart]
    max_tokens: int = 16000
    effort: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)  # used by the mock provider only


@dataclass
class AIResult:
    text: str
    input_tokens: int
    output_tokens: int
    model: str
    provider: str
    stop_reason: str | None = None


class AIError(Exception):
    """An error safe to show to the user (no secrets, no stack traces)."""

    def __init__(self, user_message: str, code: str = "ai_error"):
        super().__init__(user_message)
        self.user_message = user_message
        self.code = code


class CancelledRun(Exception):
    pass


ProgressFn = Callable[[int], None]


class AIProvider:
    name = "base"
    model = ""

    def complete(self, req: AIRequest, cancel: threading.Event | None = None, progress: ProgressFn | None = None) -> AIResult:
        raise NotImplementedError


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float | None = None, client: Any = None):
        import anthropic

        self.model = model
        self._anthropic = anthropic
        # SDK retries disabled: retries are explicit below so they can respect cancellation.
        self.client = client or anthropic.Anthropic(api_key=api_key, timeout=timeout or settings.ai_timeout_s, max_retries=0)

    def _content(self, req: AIRequest) -> list[dict]:
        blocks: list[dict] = []
        for p in req.parts:
            if isinstance(p, ImagePart):
                blocks.append({"type": "text", "text": f"<screenshot label=\"{p.label}\"> (untrusted image content follows)"})
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": p.media_type, "data": p.data_b64}})
                blocks.append({"type": "text", "text": "</screenshot>"})
            elif p:
                blocks.append({"type": "text", "text": p})
        return blocks

    def complete(self, req: AIRequest, cancel: threading.Event | None = None, progress: ProgressFn | None = None) -> AIResult:
        a = self._anthropic
        transient = tuple(getattr(a, n) for n in ("RateLimitError", "APIConnectionError", "APITimeoutError", "InternalServerError",
                                                  "OverloadedError", "ServiceUnavailableError", "GatewayTimeoutError") if hasattr(a, n))
        content = self._content(req)
        use_fallbacks = self.model in FALLBACK_MODELS
        effort = req.effort
        attempt = 0
        while True:
            if cancel is not None and cancel.is_set():
                raise CancelledRun()
            try:
                return self._call(req, content, use_fallbacks, effort, cancel, progress)
            except CancelledRun:
                raise
            except transient as e:
                attempt += 1
                if attempt > settings.ai_max_retries:
                    log.warning("AI call failed after retries: %s", type(e).__name__)
                    if isinstance(e, getattr(a, "RateLimitError", ())):
                        raise AIError("The AI service is rate-limiting requests. Wait a minute and try again.", "rate_limited") from None
                    raise AIError("The AI service could not be reached or is temporarily unavailable. Try again shortly.", "unavailable") from None
                delay = min(20.0, 1.5 * 2 ** (attempt - 1)) * (0.75 + random.random() / 2)
                if cancel is not None and cancel.wait(delay):
                    raise CancelledRun() from None
                if cancel is None:
                    time.sleep(delay)
            except a.AuthenticationError:
                raise AIError("The Anthropic API key was rejected. Check it in Settings → AI Provider.", "auth") from None
            except a.PermissionDeniedError:
                raise AIError("This API key does not have permission to use the configured model.", "permission") from None
            except a.NotFoundError:
                raise AIError(f"The model '{self.model}' was not found. Check the model identifier in Settings → AI Provider.", "model") from None
            except a.BadRequestError as e:
                msg = str(getattr(e, "message", "") or e).lower()
                if use_fallbacks and ("fallback" in msg or "beta" in msg):
                    use_fallbacks = False
                    continue
                if effort and ("effort" in msg or "output_config" in msg):
                    effort = None
                    continue
                if "too long" in msg or "too large" in msg or "maximum" in msg and "token" in msg:
                    raise AIError("The material is too large for one request. Remove some attachments or ask about a narrower part.", "too_large") from None
                if "image" in msg:
                    raise AIError("The AI service could not process one of the images. Try a smaller or clearer screenshot.", "bad_image") from None
                raise AIError("The AI service rejected the request. Try rephrasing or removing an attachment.", "bad_request") from None
            except a.APIStatusError as e:
                raise AIError(f"The AI service returned an error (HTTP {getattr(e, 'status_code', '?')}). Try again.", "api_error") from None

    def _call(self, req, content, use_fallbacks, effort, cancel, progress) -> AIResult:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": req.max_tokens,
            # The system prompt is stable per workflow, so it is cached.
            "system": [{"type": "text", "text": req.system, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": content}],
        }
        if effort:
            kwargs["output_config"] = {"effort": effort}
        if use_fallbacks:
            mgr = self.client.beta.messages.stream(**kwargs, betas=[FALLBACK_BETA], fallbacks="default")
        else:
            mgr = self.client.messages.stream(**kwargs)
        received = 0
        last_report = 0.0
        with mgr as stream:
            for event in stream:
                if cancel is not None and cancel.is_set():
                    raise CancelledRun()
                delta = getattr(getattr(event, "delta", None), "text", None)
                if delta:
                    received += len(delta)
                    if progress and time.monotonic() - last_report > 0.8:
                        last_report = time.monotonic()
                        progress(received)
            msg = stream.get_final_message()
        if msg.stop_reason == "refusal":
            raise AIError("The model declined to complete this request. Rephrase it or remove content that may have triggered a safety filter.", "refusal")
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        usage = msg.usage
        return AIResult(text=text, input_tokens=(usage.input_tokens or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0)
                        + (getattr(usage, "cache_creation_input_tokens", 0) or 0),
                        output_tokens=usage.output_tokens or 0, model=getattr(msg, "model", self.model) or self.model,
                        provider=self.name, stop_reason=msg.stop_reason)

    def test_connection(self) -> dict:
        try:
            m = self.client.models.retrieve(self.model)
        except self._anthropic.AuthenticationError:
            raise AIError("The Anthropic API key was rejected.", "auth") from None
        except self._anthropic.NotFoundError:
            raise AIError(f"The key works, but the model '{self.model}' was not found.", "model") from None
        except self._anthropic.APIConnectionError:
            raise AIError("Could not reach api.anthropic.com. Check your internet connection or proxy.", "unavailable") from None
        except self._anthropic.APIStatusError as e:
            raise AIError(f"The AI service returned HTTP {getattr(e, 'status_code', '?')}.", "api_error") from None
        return {"model": m.id, "display_name": getattr(m, "display_name", m.id),
                "context_window": getattr(m, "max_input_tokens", None), "max_output_tokens": getattr(m, "max_tokens", None)}


class MockProvider(AIProvider):
    """Deterministic offline provider used by automated tests and explicit offline mode.
    Output is clearly labelled as mock content; it never claims to have read images."""

    name = "mock"

    def __init__(self, model: str = "mock-model"):
        self.model = model

    def complete(self, req: AIRequest, cancel: threading.Event | None = None, progress: ProgressFn | None = None) -> AIResult:
        from . import mock

        delay = float(req.meta.get("mock_delay", 0))
        if delay and cancel is not None and cancel.wait(delay):
            raise CancelledRun()
        if cancel is not None and cancel.is_set():
            raise CancelledRun()
        if req.meta.get("mock_fail"):
            raise AIError("Mock provider failure (test).", "api_error")
        text = mock.respond(req)
        if progress:
            progress(len(text))
        return AIResult(text=text, input_tokens=sum(len(p) for p in req.parts if isinstance(p, str)) // 4,
                        output_tokens=len(text) // 4, model=self.model, provider=self.name, stop_reason="end_turn")


def get_provider(model: str) -> AIProvider:
    from ..services.secrets import get_api_key

    if settings.ai_provider == "mock":
        return MockProvider()
    key = get_api_key()
    if not key:
        raise AIError("No Anthropic API key is configured. Add one in Settings → AI Provider.", "not_configured")
    return AnthropicProvider(api_key=key, model=model)
