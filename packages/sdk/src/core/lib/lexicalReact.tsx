import * as React from "react";

import {
  isValidTextLinkTarget,
  resolveTextLinkHref,
  shouldOpenTextLinkInNewTab,
} from "./textLinks";

interface MarkdownToReactNodesOptions {
  pages?: Array<{ id: number; fullPath: string }>;
  fallbackHref?: string;
}

/**
 * Parse a markdown string with **bold**, *italic*, and text links into React nodes.
 * Falls back to rendering the raw string if it's not a string value.
 */
export function markdownToReactNodes(
  value: unknown,
  options: MarkdownToReactNodesOptions = {},
): React.ReactNode {
  if (typeof value !== "string") return null;
  if (!value) return null;

  const parts: React.ReactNode[] = [];
  let key = 0;
  const fallbackHref = options.fallbackHref ?? "#";

  const pushWithLineBreaks = (text: string) => {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) parts.push(<br key={key++} />);
      if (line) parts.push(line);
    });
  };

  const pushFormatted = (text: string) => {
    // Match ***bold+italic***, **bold**, or *italic*
    const regex = /(\*{1,3})((?:(?!\1).)+)\1/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        pushWithLineBreaks(text.slice(lastIndex, match.index));
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

    if (lastIndex < text.length) {
      pushWithLineBreaks(text.slice(lastIndex));
    }
  };

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastLinkIndex = 0;
  let linkMatch;

  while ((linkMatch = linkRegex.exec(value)) !== null) {
    if (linkMatch.index > lastLinkIndex) {
      pushFormatted(value.slice(lastLinkIndex, linkMatch.index));
    }

    const [, label, target] = linkMatch;
    const href = isValidTextLinkTarget(target)
      ? resolveTextLinkHref(target, options.pages, fallbackHref)
      : null;

    if (href) {
      const openInNewTab = shouldOpenTextLinkInNewTab(target);
      parts.push(
        <a
          key={key++}
          href={href}
          style={{ textDecorationLine: "underline" }}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noreferrer" : undefined}
        >
          {label}
        </a>,
      );
    } else {
      pushFormatted(label);
    }

    lastLinkIndex = linkMatch.index + linkMatch[0].length;
  }

  if (lastLinkIndex < value.length) {
    pushFormatted(value.slice(lastLinkIndex));
  }

  if (parts.length === 0) return value;
  return <>{parts}</>;
}
