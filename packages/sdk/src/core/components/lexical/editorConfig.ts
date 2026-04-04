import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ParagraphNode } from "lexical";

import { isLexicalState, markdownToLexicalState } from "../../lib/lexicalState";
import { InlineParagraphNode } from "./InlineParagraphNode";

export function normalizeLexicalState(value: string | Record<string, unknown>): string {
  // Backwards compat: if value is already Lexical JSON (object or JSON string), use directly
  if (typeof value === "object") {
    if (isLexicalState(value)) return JSON.stringify(value);
    return JSON.stringify(markdownToLexicalState(""));
  }
  if (isLexicalState(value)) return value;
  // Value is a markdown string — convert to Lexical JSON
  return JSON.stringify(markdownToLexicalState(value));
}

export function createEditorConfig(
  initialState: string | Record<string, unknown> | undefined,
): InitialConfigType {
  return {
    namespace: "camox",
    editorState: initialState ? normalizeLexicalState(initialState) : undefined,
    onError: (error) => {
      console.error("Lexical error:", error);
    },
    nodes: [
      InlineParagraphNode,
      {
        replace: ParagraphNode,
        with: () => new InlineParagraphNode(),
        withKlass: InlineParagraphNode,
      },
    ],
  };
}
