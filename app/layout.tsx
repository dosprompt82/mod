import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Caught Up: spoiler-free TV companion",
  description: "Catch up on your show without spoilers. Everything is gated to the episode you're on.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
          <main className="flex-1 py-4">{children}</main>
          <footer className="muted border-t border-stone-200 py-6 text-xs dark:border-stone-800">
            <p>Unofficial companion, not affiliated with Netflix or the show&apos;s producers.</p>
            <p className="mt-1"><Link href="/about" className="underline">About, privacy and takedowns</Link></p>
          </footer>
        </div>
      </body>
    </html>
  );
}
