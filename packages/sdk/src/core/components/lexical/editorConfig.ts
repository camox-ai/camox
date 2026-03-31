import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { ParagraphNode } from "lexical";

import { isLexicalState, plainTextToLexicalState } from "../../lib/lexicalState";
import { InlineParagraphNode } from "./InlineParagraphNode";

export function normalizeLexicalState(value: string | Record<string, unknown>): string {
  if (typeof value === "object") return JSON.stringify(value);
  if (isLexicalState(value)) return value;
  return JSON.stringify(plainTextToLexicalState(value));
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
