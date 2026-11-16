// Applies the saved theme before first paint (no flash). Kept as a file so the CSP can forbid inline scripts.
(function () {
  try {
    var t = localStorage.getItem("ps-theme") || "system";
    var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
