"use client";
import { useState } from "react";

export function Report({ show, contentId, pos }: { show: string; contentId: string; pos: string }) {
  const [state, setState] = useState<"idle" | "open" | "sent">("idle");
  const [note, setNote] = useState("");
  if (state === "sent") return <span className="muted text-xs">Thanks. Hidden until reviewed.</span>;
  if (state === "idle") return <button type="button" className="muted text-xs underline" onClick={() => setState("open")}>Report spoiler</button>;
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      await fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ show, contentId, pos, note }) });
      setState("sent");
    }}>
      <input className="flex-1 rounded border border-stone-300 bg-transparent px-2 py-1 text-xs dark:border-stone-700" placeholder="What did it spoil? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn px-2 py-1 text-xs">Send</button>
    </form>
  );
}
