/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"), surface: v("surface"), sunken: v("sunken"), line: v("line"), ink: v("ink"), muted: v("muted"), faint: v("faint"),
        accent: v("accent"), "accent-ink": v("accent-ink"), "accent-soft": v("accent-soft"),
        ok: v("ok"), warn: v("warn"), danger: v("danger"), "ok-soft": v("ok-soft"), "warn-soft": v("warn-soft"), "danger-soft": v("danger-soft"),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ['"Source Serif 4 Variable"', '"Source Serif 4"', "Georgia", "Cambria", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: { "2xs": ["0.6875rem", "1rem"] },
      boxShadow: { card: "0 1px 2px rgb(0 0 0 / 0.04)", pop: "0 12px 32px -8px rgb(0 0 0 / 0.18)" },
      maxWidth: { prose: "46rem" },
    },
  },
  plugins: [],
};
