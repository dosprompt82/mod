export const metadata = { title: "About · Caught Up" };
export default function About() {
  return (
    <article className="prose space-y-4 py-6 text-sm leading-6">
      <h1 className="text-2xl font-semibold">About Caught Up</h1>
      <p>Caught Up is an unofficial, spoiler-free companion. Every recap, fact and relationship has a reveal point, and the server only sends content at or before the episode you choose.</p>
      <h2 className="text-lg font-semibold">Where the facts come from</h2>
      <p>Facts are written in our own words from public episode-by-episode summaries, then cross-checked against official network articles where possible. An automated spoiler audit must pass before anything is published. If something spoils you, tap <em>Report spoiler</em>: the item is hidden immediately until it is reviewed.</p>
      <h2 className="text-lg font-semibold">Privacy</h2>
      <p>No account is needed. We store an anonymous ID in a cookie to remember your position. Questions you ask the assistant are logged for 30 days to audit for spoilers, then deleted.</p>
      <h2 className="text-lg font-semibold">Rights and takedowns</h2>
      <p>We publish original commentary only: no video, stills, scripts or subtitles. Show and character names are used only to describe what a page is about. To request removal, email takedown@caughtup.example. We act within 48 hours.</p>
    </article>
  );
}
