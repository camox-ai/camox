import * as React from "react";

/**
 * Parse a markdown string with **bold** and *italic* into React nodes.
 * Falls back to rendering the raw string if it's not a string value.
 */
export function markdownToReactNodes(value: unknown): React.ReactNode {
  if (typeof value !== "string") return null;
  if (!value) return null;

  // Match ***bold+italic***, **bold**, or *italic*
  const regex = /(\*{1,3})((?:(?!\1).)+)\1/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  const pushWithLineBreaks = (text: string) => {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) parts.push(<br key={key++} />);
      if (line) parts.push(line);
    });
  };

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      pushWithLineBreaks(value.slice(lastIndex, match.index));
    }

    const stars = match[1].length;
    const content = match[2];

    if (stars === 3) {
      parts.push(
        <strong key={key++}>
          <em>{content}</em>
        </strong>,
      );
    } else if (stars === 2) {
      parts.push(<strong key={key++}>{content}</strong>);
    } else {
      parts.push(<em key={key++}>{content}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    pushWithLineBreaks(value.slice(lastIndex));
  }

  if (parts.length === 0) return value;
  return <>{parts}</>;
}
