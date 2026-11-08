"use client";
import { useState } from "react";

type Turn = { q: string; a: string };
export function Ask({ show, pos }: { show: string; pos: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setQ("");
    setTurns((t) => [...t, { q: question, a: "…" }]);
    const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ show, pos, question }) });
    const a = res.ok ? await res.text() : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.";
    setTurns((t) => [...t.slice(0, -1), { q: question, a }]);
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      {turns.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {["What just happened?", "Who is everyone at the embassy?", "Why is everyone so tense right now?"].map((s) => (
            <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}
      <ul className="space-y-3" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className="card space-y-2 text-sm"><p className="font-medium">{t.q}</p><p className="leading-6 whitespace-pre-wrap">{t.a}</p></li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask about anything you've watched" aria-label="Your question"
          className="flex-1 rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700" />
        <button className="btn" disabled={busy}>Ask</button>
      </form>
      <p className="muted text-xs">Answers use only what&apos;s revealed up to your position. Questions are logged for 30 days for spoiler audits.</p>
    </div>
  );
}
