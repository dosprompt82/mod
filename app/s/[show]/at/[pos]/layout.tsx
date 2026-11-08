import Link from "next/link";
import { notFound } from "next/navigation";
import { context, posLabel } from "../../../../../lib/data";
import { formatPos } from "../../../../../src/spoiler";

export default async function AtLayout({ children, params }: { children: React.ReactNode; params: Promise<{ show: string; pos: string }> }) {
  const { show, pos } = await params;
  const c = context(show, pos);
  if (!c) notFound();
  const base = `/s/${show}/at/${pos}`;
  const nav = [["Home", ""], ["Catch up", "/catch-up"], ["Who's who", "/people"], ["Map", "/map"], ["Episodes", "/episodes"], ["Ask", "/ask"]] as const;
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm"><span className="font-medium">{c.content.show.title}</span> <span className="muted">· {posLabel(c)}</span></div>
          <Link className="chip no-underline" href={`/s/${show}?pos=${formatPos(c.pos)}`}>Change</Link>
        </div>
        <nav className="mt-2 flex gap-3 overflow-x-auto text-sm" aria-label="Sections">
          {nav.map(([label, path]) => <Link key={label} href={base + path} className="whitespace-nowrap hover:underline">{label}</Link>)}
        </nav>
      </div>
      <div className="py-4">{children}</div>
    </div>
  );
}
