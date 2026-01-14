"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

const components: Components = {
  // Headings
  h1: ({ children }) => (
    <h1 className="mb-4 mt-6 text-2xl font-bold text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-5 text-xl font-semibold text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-lg font-medium text-foreground first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-3 text-base font-medium text-foreground first:mt-0">{children}</h4>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-muted-foreground last:mb-0">{children}</p>
  ),

  // Lists
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-6 text-muted-foreground">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-6 text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  // Code blocks
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code
          className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-primary"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        className={`block overflow-x-auto rounded-lg bg-secondary p-4 font-mono text-sm text-muted-foreground ${className || ""}`}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-hidden rounded-lg">{children}</pre>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-primary/50 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  ),

  // Tables (GFM)
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-secondary/50">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-secondary/30">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-muted-foreground">{children}</td>
  ),

  // Horizontal rule
  hr: () => <hr className="my-6 border-border" />,

  // Strong & Emphasis
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,

  // Images
  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt || ""}
      className="my-3 max-w-full rounded-lg border border-border"
    />
  ),
};

export function MarkdownView({ content, className = "" }: MarkdownViewProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
