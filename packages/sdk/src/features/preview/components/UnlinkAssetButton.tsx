import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@camox/ui/alert-dialog";
import { Button } from "@camox/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";

import { useApiClient } from "@/lib/api-client";
import { fileQueries } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface UnlinkAssetButtonProps {
  fileId: number | undefined;
  onUnlink: () => void;
  className?: string;
}

const UnlinkAssetButton = ({ fileId, onUnlink, className }: UnlinkAssetButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const apiClient = useApiClient();
  const { data: usageCount } = useQuery({
    ...fileQueries.getUsageCount(apiClient, fileId!),
    enabled: !!fileId,
  });
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fileId || usageCount === undefined || usageCount > 1) {
      onUnlink();
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground hover:text-foreground shrink-0", className)}
            onClick={handleClick}
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Unlink</TooltipContent>
      </Tooltip>
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink file</AlertDialogTitle>
            <AlertDialogDescription>
              This file is not used anywhere else. Would you like to also delete it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => onUnlink()} asChild>
              <Button variant="outline" className="bg-background hover:bg-accent text-foreground">
                Unlink only
              </Button>
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                onUnlink();
                if (fileId) apiClient.files.delete.$post({ json: { id: fileId } });
              }}
              asChild
            >
              <Button>Delete file</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export { UnlinkAssetButton };
