"use client";

import { useMemo } from "react";

/**
 * Lightweight Markdown renderer for Origin journals.
 * Supports: **bold**, *italic*, ~~strike~~, # headings, - lists, > blockquote, `code`, ---
 * No external deps — pure regex + React.
 */

type Props = {
  content: string;
  className?: string;
};

function parseLine(line: string): React.ReactNode {
  // Inline formatting
  const parts: React.ReactNode[] = [];
  let remaining = line;
  let key = 0;

  // Process inline patterns
  const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(~~(.+?)~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(remaining)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(<strong key={key++} className="font-semibold">{match[2]}</strong>);
    } else if (match[3]) {
      // *italic*
      parts.push(<em key={key++} className="italic">{match[4]}</em>);
    } else if (match[5]) {
      // `code`
      parts.push(
        <code key={key++} className="rounded bg-gray-100 px-1 py-0.5 text-[11px] font-mono text-pink-600">
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // ~~strikethrough~~
      parts.push(<del key={key++} className="text-gray-400">{match[8]}</del>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }

  return parts.length > 0 ? parts : line;
}

export default function MarkdownRenderer({ content, className }: Props) {
  const rendered = useMemo(() => {
    if (!content) return null;
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];

    function flushList() {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="ml-4 list-disc space-y-0.5">
            {listItems.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-gray-600">{item}</li>
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        flushList();
        elements.push(<hr key={i} className="my-2 border-gray-200" />);
        continue;
      }

      // Heading
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        const text = parseLine(headingMatch[2]);
        if (level === 1) {
          elements.push(<h3 key={i} className="mt-2 mb-1 text-base font-bold text-gray-800">{text}</h3>);
        } else if (level === 2) {
          elements.push(<h4 key={i} className="mt-1.5 mb-0.5 text-sm font-semibold text-gray-700">{text}</h4>);
        } else {
          elements.push(<h5 key={i} className="mt-1 text-sm font-medium text-gray-600">{text}</h5>);
        }
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        flushList();
        elements.push(
          <blockquote key={i} className="my-1 border-l-2 border-violet-300 pl-3 text-sm italic text-gray-500">
            {parseLine(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Unordered list
      if (/^[-*]\s+/.test(line)) {
        inList = true;
        listItems.push(parseLine(line.replace(/^[-*]\s+/, "")));
        continue;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(line)) {
        // Treat as unordered for simplicity
        inList = true;
        listItems.push(parseLine(line.replace(/^\d+\.\s+/, "")));
        continue;
      }

      // Regular paragraph
      flushList();
      if (line.trim() === "") {
        elements.push(<div key={i} className="h-2" />);
      } else {
        elements.push(
          <p key={i} className="text-sm leading-relaxed text-gray-600">{parseLine(line)}</p>
        );
      }
    }

    flushList();
    return elements;
  }, [content]);

  return <div className={className}>{rendered}</div>;
}
