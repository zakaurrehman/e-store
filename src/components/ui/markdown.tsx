import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/utils/cn";

/**
 * Renders CMS / product Markdown. Raw HTML is never rendered (react-markdown escapes it), so content
 * editors cannot inject scripts. Internal links use client-side navigation; external links open safely.
 */
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose-zendropship", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) =>
            href.startsWith("/") ? (
              <Link href={href}>{children}</Link>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ),
          img: () => null,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
