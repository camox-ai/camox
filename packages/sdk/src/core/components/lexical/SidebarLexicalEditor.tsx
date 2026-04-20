import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { EditorState } from "lexical";
import * as React from "react";

import { lexicalStateToMarkdown } from "@/core/lib/lexicalState";
import { INPUT_BASE_STYLES, INPUT_FOCUS_STYLES, cn } from "@/lib/utils";

import { createEditorConfig, normalizeLexicalState } from "./editorConfig";

interface SidebarLexicalEditorProps {
  id?: string;
  value: string | Record<string, unknown>;
  onChange: (markdown: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

function ExternalStateSync({
  value,
  isSyncingRef,
}: {
  value: string | Record<string, unknown>;
  isSyncingRef: React.RefObject<boolean>;
}) {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    const root = editor.getRootElement();
    if (root !== null && root === document.activeElement) return;
    try {
      const normalized = normalizeLexicalState(value);
      const newState = editor.parseEditorState(normalized);
      isSyncingRef.current = true;
      editor.setEditorState(newState);
    } catch {
      // ignore parse errors
    }
  }, [editor, value, isSyncingRef]);

  return null;
}

export function SidebarLexicalEditor({
  id,
  value,
  onChange,
  onFocus,
  onBlur,
}: SidebarLexicalEditorProps) {
  const timerRef = React.useRef<number | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const isSyncingRef = React.useRef(false);

  const config = React.useMemo(
    () => createEditorConfig(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = React.useCallback((editorState: EditorState) => {
    // Ignore editor updates triggered by ExternalStateSync to avoid loops
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onChangeRef.current(
        lexicalStateToMarkdown(editorState.toJSON() as unknown as Record<string, unknown>),
      );
    }, 300);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <LexicalComposer initialConfig={config}>
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            id={id}
            className={cn(
              INPUT_BASE_STYLES,
              INPUT_FOCUS_STYLES,
              "flex min-h-[80px] w-full px-3 py-2",
            )}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
      />
      <OnChangePlugin onChange={handleChange} />
      <ExternalStateSync value={value} isSyncingRef={isSyncingRef} />
    </LexicalComposer>
  );
}

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
