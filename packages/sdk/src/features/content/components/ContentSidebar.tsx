import { ImageIcon } from "lucide-react";

export const ContentSidebar = () => {
  return (
    <div className="flex w-[220px] flex-col border-r-2 p-2">
      <button
        type="button"
        className="bg-accent text-accent-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium"
      >
        <ImageIcon className="h-4 w-4" />
        Assets
      </button>
    </div>
  );
};
