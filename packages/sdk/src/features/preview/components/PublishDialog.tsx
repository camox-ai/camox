import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@camox/ui/alert-dialog";
import { toast } from "@camox/ui/toaster";
import { useMutation } from "@tanstack/react-query";

import type { Page } from "@/lib/queries";
import { pageMutations } from "@/lib/queries";
import { trackClientEvent } from "@/lib/telemetry-client";
import { formatPathSegment } from "@/lib/utils";

/**
 * Confirmation dialog for `pages.publish`. Shows the path that will go live
 * (= the current draft path; same as today's public URL unless the user
 * changed it while drafting), and a primary Publish button.
 *
 * Description copy branches on the page's current status: a `'draft'` page
 * has never been public so we frame it as "will go live"; a `'modified'`
 * page is already public and we're promoting the latest edits.
 *
 * The "Also publish layout _<handle>_ (affects N pages)" checkbox is wired
 * in Phase 4 — until then the dialog is publish-only.
 */
export function PublishDialog({
  page,
  pageStatus,
  open,
  onOpenChange,
}: {
  page: Pick<Page, "id" | "metaTitle" | "pathSegment" | "fullPath"> | null;
  pageStatus: "draft" | "published" | "modified";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const publishPage = useMutation(pageMutations.publish());

  const handlePublish = async () => {
    if (!page) return;
    const displayName = page.metaTitle ?? formatPathSegment(page.pathSegment);
    try {
      await publishPage.mutateAsync({ id: page.id });
      trackClientEvent("page_published", { pageId: page.id });
      toast.success(`Published ${displayName}`);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to publish page:", error);
      toast.error(`Could not publish ${displayName}`);
    }
  };

  const pathCode = (
    <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">{page?.fullPath ?? ""}</code>
  );

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pageStatus === "modified" ? "Publish changes" : "Publish page"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pageStatus === "modified" ? (
              <>Visitors at {pathCode} will start seeing your latest changes.</>
            ) : (
              <>This page will go live at {pathCode}. Visitors will see the current draft.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline" size="default" disabled={publishPage.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={handlePublish} disabled={publishPage.isPending}>
            {publishPage.isPending ? "Publishing…" : "Publish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
