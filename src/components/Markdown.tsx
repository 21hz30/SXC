"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-chat text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          code: ({ children, ...props }) => {
            const inline = !(props as { className?: string }).className;
            return inline ? (
              <code className="bg-black/10 rounded px-1 py-0.5 text-[0.85em] font-mono">{children}</code>
            ) : (
              <code className="block bg-black/10 rounded px-2 py-1 text-[0.85em] font-mono overflow-x-auto">{children}</code>
            );
          },
          pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
          h1: ({ children }) => <h3 className="font-semibold mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold mt-3 mb-1">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold mt-3 mb-1">{children}</h3>,
          a: ({ children, href }) => <a href={href} className="underline" target="_blank" rel="noreferrer">{children}</a>,
          hr: () => <hr className="border-border my-2" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
