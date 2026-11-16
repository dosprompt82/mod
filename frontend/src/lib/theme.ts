export type Theme = "light" | "dark" | "system";

export function applyTheme(t: Theme) {
  try { localStorage.setItem("ps-theme", t); } catch { /* storage unavailable */ }
  const dark = t === "dark" || (t === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function currentTheme(): Theme {
  try { return (localStorage.getItem("ps-theme") as Theme) || "system"; } catch { return "system"; }
}

export function watchSystemTheme() {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const handler = () => { if (currentTheme() === "system") applyTheme("system"); };
  mq?.addEventListener?.("change", handler);
  return () => mq?.removeEventListener?.("change", handler);
}
