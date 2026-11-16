import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Safe Markdown: raw HTML is never rendered; links open in a new tab without referrer. */
export function Markdown({ children, className = "prose-doc" }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
