import * as React from "react";

interface AddBlockControlBarProps {
  position: "top" | "bottom";
  hidden: boolean;
  onClick: () => void;
  onMouseLeave: () => void;
}

export const AddBlockControlBar = ({
  position,
  hidden,
  onClick,
  onMouseLeave,
}: AddBlockControlBarProps) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div
      className="camox-add-block"
      data-camox-position={position}
      data-camox-hidden={hidden || undefined}
      onMouseLeave={onMouseLeave}
    >
      <div
        className="camox-add-block-hitarea"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <button
          className="camox-add-block-button"
          data-camox-expanded={isExpanded || undefined}
          onClick={onClick}
        >
          <span style={{ lineHeight: 1 }}>+</span>
          {isExpanded && <span>Add block</span>}
        </button>
      </div>
    </div>
  );
};
