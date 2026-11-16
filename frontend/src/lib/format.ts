export const WORKFLOW_LABELS: Record<string, string> = {
  email: "Email reply", document: "Document analysis", reasoning: "Expert analysis", review: "Critical review", memo: "Memo",
  writing: "Writing", rewrite: "Revision", knowledge: "Knowledge answer", strategy: "Strategic review", revise_analysis: "Revised analysis",
  writing_profile: "Writing profile",
};

export const PROVENANCE_LABELS: Record<string, string> = {
  user_fact: "Your fact", user_approved: "Approved by you", source_document: "Source document", ai_draft: "AI draft", ai_interpretation: "AI interpretation",
};

export const CATEGORY_LABELS: Record<string, string> = {
  reference: "Reference", previous_analysis: "Previous analysis", decision: "Decision", writing_example: "Writing example", project: "Project", preference: "Preference",
};

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

export function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Turn FTS snippet markers into safe React-renderable parts. */
export function highlightParts(snippet: string): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  const re = /\[\[(.*?)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snippet))) {
    if (m.index > last) out.push({ text: snippet.slice(last, m.index), hit: false });
    out.push({ text: m[1], hit: true });
    last = m.index + m[0].length;
  }
  if (last < snippet.length) out.push({ text: snippet.slice(last), hit: false });
  return out;
}
