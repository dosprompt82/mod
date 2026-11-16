# Roadmap

Prioritised next steps. Nothing below is implemented.

1. **Verify with a live API key** and tune prompts on real email threads and agreements (accuracy, tone, citation hit-rate, cost per request).
2. **Measure and tune cost:** per-workflow effort levels, prompt-cache hit rates, and image tiling thresholds based on real usage.
3. **Streaming partial results into the UI** (today: live progress and cancellation; results appear when validated).
4. **Optional local OCR** (e.g. Tesseract) to verify screenshot quotes without relying on AI transcription.
5. **Semantic retrieval** as an optional, provider-configurable layer on top of FTS5.
6. **True Word footnotes** and richer PDF typography in exports.
7. **Packaged desktop app** (signed macOS/Windows installers) so Python/Node aren't prerequisites.
8. **Run the Windows and macOS launchers** on real machines and fix anything platform-specific.
9. **Accessibility pass** with a screen reader across result states.
10. **Encrypted-at-rest option** for the data directory.
