import Link from "next/link";
import { SHOWS } from "../lib/data";

export default function Home() {
  return (
    <div className="space-y-6 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Caught Up</h1>
      <p className="muted">Tell us where you are in a show. We only ever show what you&apos;ve already seen.</p>
      <ul className="space-y-3">
        {Object.values(SHOWS).map(({ show }) => (
          <li key={show.slug}>
            <Link href={`/s/${show.slug}`} className="card block hover:border-stone-400">
              <span className="text-lg font-medium">{show.title}</span>
              <span className="muted block text-sm">{show.network} · {show.seasons.length} seasons</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
