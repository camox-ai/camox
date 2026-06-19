import * as React from "react";

import {
  getPageIdFromTextLinkTarget,
  isHttpTextLinkTarget,
  isValidTextLinkTarget,
  resolveTextLinkHref,
  shouldOpenTextLinkInNewTab,
} from "./textLinks";

export interface MarkdownLinkRenderProps {
  href: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
}

export interface MarkdownLinkRenderData {
  target: string;
  href: string;
  external: boolean;
  pageId?: string;
}

export interface MarkdownInlineComponents {
  link?: (props: MarkdownLinkRenderProps, data: MarkdownLinkRenderData) => React.ReactNode;
  strong?: (props: { children: React.ReactNode }) => React.ReactNode;
  emphasis?: (props: { children: React.ReactNode }) => React.ReactNode;
}

interface MarkdownToReactNodesOptions {
  pages?: Array<{ id: number; fullPath: string }>;
  fallbackHref?: string;
  components?: MarkdownInlineComponents;
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
        const emphasis = options.components?.emphasis?.({ children: content }) ?? (
          <em>{content}</em>
        );
        parts.push(
          <React.Fragment key={key++}>
            {options.components?.strong?.({ children: emphasis }) ?? <strong>{emphasis}</strong>}
          </React.Fragment>,
        );
      } else if (stars === 2) {
        parts.push(
          <React.Fragment key={key++}>
            {options.components?.strong?.({ children: content }) ?? <strong>{content}</strong>}
          </React.Fragment>,
        );
      } else {
        parts.push(
          <React.Fragment key={key++}>
            {options.components?.emphasis?.({ children: content }) ?? <em>{content}</em>}
          </React.Fragment>,
        );
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
      const linkProps = {
        href,
        target: openInNewTab ? "_blank" : undefined,
        rel: openInNewTab ? "noreferrer" : undefined,
        children: label,
      } satisfies MarkdownLinkRenderProps;
      const linkData = {
        target,
        href,
        external: isHttpTextLinkTarget(target),
        pageId: getPageIdFromTextLinkTarget(target) ?? undefined,
      } satisfies MarkdownLinkRenderData;

      parts.push(
        <React.Fragment key={key++}>
          {options.components?.link?.(linkProps, linkData) ?? (
            <a {...linkProps} style={{ textDecorationLine: "underline" }} />
          )}
        </React.Fragment>,
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
