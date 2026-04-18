import { useSelector } from "@xstate/store/react";
import * as React from "react";

import type { Block } from "../../../core/createBlock";
import { NormalizedDataProvider } from "../../../lib/normalized-data";
import { previewStore } from "../previewStore";

interface PeekedBlockProps {
  onExitComplete?: () => void;
}

export const PeekedBlock = ({ onExitComplete }: PeekedBlockProps) => {
  const peekedBlock = useSelector(previewStore, (state) => state.context.peekedBlock);
  const skipExitAnimation = useSelector(
    previewStore,
    (state) => state.context.skipPeekedBlockExitAnimation,
  );

  const peekedBlockRef = React.useRef<HTMLDivElement>(null);
  const [displayedBlock, setDisplayedBlock] = React.useState<Block | null>(null);
  const [isExpanded, setIsExpanded] = React.useState(false);

  // When peekedBlock changes to non-null → latch it; when null → start collapse (or skip)
  React.useEffect(() => {
    if (peekedBlock) {
      setDisplayedBlock(peekedBlock);
      return;
    }

    if (skipExitAnimation) {
      setIsExpanded(false);
      setDisplayedBlock(null);
      onExitComplete?.();
      previewStore.send({ type: "clearSkipPeekedBlockExitAnimation" });
      return;
    }

    setIsExpanded(false);
  }, [peekedBlock, skipExitAnimation, onExitComplete]);

  // When displayedBlock becomes non-null → expand on next frame
  React.useEffect(() => {
    if (!displayedBlock) return;
    const id = requestAnimationFrame(() => setIsExpanded(true));
    return () => cancelAnimationFrame(id);
  }, [displayedBlock]);

  // Scroll into view when displayedBlock changes
  React.useEffect(() => {
    if (displayedBlock && peekedBlockRef.current) {
      peekedBlockRef.current.scrollIntoView({
        behavior: "instant",
        block: "start",
      });
    }
  }, [displayedBlock]);

  const handleTransitionEnd = React.useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.propertyName !== "grid-template-rows" || e.target !== e.currentTarget) {
        return;
      }
      if (isExpanded) {
        // Scroll into view after expand animation completes (initial peek)
        peekedBlockRef.current?.scrollIntoView({
          behavior: "instant",
          block: "start",
        });
        return;
      }

      // Clear on collapse
      setDisplayedBlock(null);
      onExitComplete?.();
    },
    [isExpanded, onExitComplete],
  );

  const peekBundle = React.useMemo(() => {
    if (!displayedBlock) return null;
    return displayedBlock.getPeekBundle();
  }, [displayedBlock]);

  if (!displayedBlock || !peekBundle) {
    return null;
  }

  return (
    <div
      ref={peekedBlockRef}
      style={{
        scrollMargin: "5rem",
        display: "grid",
        gridTemplateRows: isExpanded ? "1fr" : "0fr",
        transition: "grid-template-rows 300ms ease-out",
        background: "var(--background)",
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div style={{ overflow: "hidden" }}>
        <NormalizedDataProvider
          files={peekBundle.files}
          repeatableItems={peekBundle.repeatableItems}
        >
          <displayedBlock.Component
            blockData={{
              _id: 0,
              type: displayedBlock.id,
              content: peekBundle.block.content as Record<string, unknown>,
              settings: peekBundle.block.settings as Record<string, unknown> | undefined,
              position: "",
            }}
            mode="peek"
          />
        </NormalizedDataProvider>
      </div>
    </div>
  );
};
