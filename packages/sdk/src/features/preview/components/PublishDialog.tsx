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
import { Label } from "@camox/ui/label";
import { Switch } from "@camox/ui/switch";
import { toast } from "@camox/ui/toaster";
import { useMutation } from "@tanstack/react-query";
import * as React from "react";

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
 * When the page's layout is itself modified (`alsoPublishLayout` prop set),
 * a toggle appears below the primary action, pre-checked. Bundling is the
 * common case — the user is usually editing page + layout together and
 * expects "Publish" to mean "what I see goes live". Power users who edited
 * the layout independently can opt out before confirming.
 */
export function PublishDialog({
  page,
  pageStatus,
  alsoPublishLayout,
  open,
  onOpenChange,
}: {
  page: Pick<Page, "id" | "metaTitle" | "pathSegment" | "fullPath"> | null;
  pageStatus: "draft" | "published" | "modified";
  alsoPublishLayout: { layoutHandle: string; affectedPagesCount: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const publishPage = useMutation(pageMutations.publish());
  const [bundleLayout, setBundleLayout] = React.useState(true);

  // Re-pre-check on every open. The Dialog stays mounted across closes, so a
  // user who unchecked the toggle and confirmed (or cancelled) would
  // otherwise see their previous choice the next time around. Resetting on
  // open also means a future open with no `alsoPublishLayout` is harmless —
  // the toggle isn't rendered then.
  React.useEffect(() => {
    if (open) setBundleLayout(true);
  }, [open]);

  const handlePublish = async () => {
    if (!page) return;
    const displayName = page.metaTitle ?? formatPathSegment(page.pathSegment);
    const shouldBundle = bundleLayout && alsoPublishLayout != null;
    try {
      await publishPage.mutateAsync({
        id: page.id,
        ...(shouldBundle ? { alsoPublishLayout: true } : {}),
      });
      trackClientEvent("page_published", {
        pageId: page.id,
        ...(shouldBundle ? { alsoPublishedLayout: true } : {}),
      });
      toast.success(
        shouldBundle
          ? `Published ${displayName} and layout ${alsoPublishLayout?.layoutHandle}`
          : `Published ${displayName}`,
      );
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
        {alsoPublishLayout && (
          <div className="flex items-start gap-3">
            <Switch
              id="also-publish-layout"
              checked={bundleLayout}
              onCheckedChange={(checked) => setBundleLayout(checked)}
              disabled={publishPage.isPending}
            />
            <Label htmlFor="also-publish-layout" className="flex flex-col items-start gap-1">
              <span>
                Also publish layout{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  {alsoPublishLayout.layoutHandle}
                </code>
              </span>
              <span className="text-muted-foreground text-xs font-normal">
                {(() => {
                  // `affectedPagesCount` counts every page using the layout —
                  // including the one being published. The user already knows
                  // _this_ page is affected; what matters is the blast radius
                  // beyond it.
                  const others = Math.max(0, alsoPublishLayout.affectedPagesCount - 1);
                  if (others === 0) return "Affects no other pages";
                  return `Affects ${others} other ${others === 1 ? "page" : "pages"}`;
                })()}
              </span>
            </Label>
          </div>
        )}
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
