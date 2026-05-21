import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-article">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
