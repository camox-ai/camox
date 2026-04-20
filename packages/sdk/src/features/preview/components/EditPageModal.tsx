/* -------------------------------------------------------------------------------------------------
 * EditPageModal
 * -----------------------------------------------------------------------------------------------*/

import { Alert, AlertDescription, AlertTitle } from "@camox/ui/alert";
import { Button } from "@camox/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@camox/ui/dialog";
import { Label } from "@camox/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@camox/ui/select";
import { Spinner } from "@camox/ui/spinner";
import { Switch } from "@camox/ui/switch";
import { toast } from "@camox/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@camox/ui/tooltip";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSelector } from "@xstate/store/react";
import { Globe, Info } from "lucide-react";
import * as React from "react";

import { trackClientEvent } from "@/lib/analytics-client";
import { useProjectSlug } from "@/lib/auth";
import type { Page } from "@/lib/queries";
import {
  blockQueries,
  layoutQueries,
  pageMutations,
  pageQueries,
  projectQueries,
} from "@/lib/queries";
import { formatPathSegment } from "@/lib/utils";

import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { previewStore } from "../previewStore";
import { DebouncedFieldEditor } from "./DebouncedFieldEditor";
import { PageLocationFieldset } from "./PageLocationFieldset";
import { ShikiMarkdown } from "./ShikiMarkdown";

const EditPageModal = () => {
  const editingPageId = useSelector(previewStore, (state) => state.context.editingPageId);

  return <EditPageModalContent pageId={editingPageId} />;
};

const EditPageModalContent = ({ pageId }: { pageId: number | null }) => {
  const projectSlug = useProjectSlug();
  const updatePage = useMutation(pageMutations.update());
  const setLayout = useMutation(pageMutations.setLayout());
  const setAiSeo = useMutation(pageMutations.setAiSeo());
  const setMetaTitle = useMutation(pageMutations.setMetaTitle());
  const setMetaDescription = useMutation(pageMutations.setMetaDescription());
  const { data: page } = useQuery({ ...pageQueries.getById(pageId!), enabled: pageId != null });
  const { data: project } = useQuery(projectQueries.getBySlug(projectSlug));
  const { data: pages } = useQuery({
    ...pageQueries.list(project?.id ?? 0),
    enabled: !!project,
  });
  const { data: layouts } = useQuery({
    ...layoutQueries.list(project?.id ?? 0),
    enabled: !!project,
  });
  const camoxApp = useCamoxApp();
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      pathSegment: page?.pathSegment ?? "",
      parentPageId: page?.parentPageId ?? undefined,
      layoutId: page?.layoutId ?? 0,
    },
    onSubmit: async (values) => {
      if (!page) return;
      try {
        const { fullPath } = await updatePage.mutateAsync({
          id: page.id,
          pathSegment: values.value.pathSegment,
          parentPageId: values.value.parentPageId,
        });

        if (values.value.layoutId) {
          await setLayout.mutateAsync({ id: page.id, layoutId: values.value.layoutId });
        }

        trackClientEvent("page_updated", {
          projectId: page.projectId,
          changes: {
            path: values.value.pathSegment !== page.pathSegment,
            layout: values.value.layoutId !== page.layoutId,
            parent: values.value.parentPageId !== page.parentPageId,
          },
        });
        const displayName = page.metaTitle ?? formatPathSegment(values.value.pathSegment);
        toast.success(`Updated ${displayName} page`);
        previewStore.send({ type: "closeEditPageModal" });
        form.reset();

        navigate({ to: fullPath });
      } catch (error) {
        console.error("Failed to update page:", error);
        toast.error("Could not update page");
      }
    },
  });

  // Reset form when opening with a different page
  const prevPageId = React.useRef(pageId);
  React.useEffect(() => {
    if (prevPageId.current === pageId || !page) return;
    prevPageId.current = pageId;
    form.reset({
      pathSegment: page.pathSegment,
      parentPageId: page.parentPageId ?? undefined,
      layoutId: page.layoutId ?? 0,
    });
  }, [pageId, page, form]);

  const isOpen = pageId != null && !!page;
  const isRootPage = page?.fullPath === "/";
  const pageLayoutRecord = layouts?.find((l) => l.id === page?.layoutId);
  const layoutDef = pageLayoutRecord
    ? camoxApp.getLayoutById(pageLayoutRecord.layoutId)
    : undefined;
  const metaTitle =
    layoutDef && page
      ? layoutDef._internal.buildMetaTitle({
          pageMetaTitle: page.metaTitle ?? "",
          projectName: project?.name ?? "",
          pageFullPath: page.fullPath,
        })
      : (page?.metaTitle ?? "");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(value) => {
        if (!value) previewStore.send({ type: "closeEditPageModal" });
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-border border-b p-4">
          <DialogTitle>Edit page</DialogTitle>
          <DialogDescription>Update the page details.</DialogDescription>
        </DialogHeader>
        {page && (
          <div className="flex-1 overflow-y-auto">
            <div className="border-border grid grid-cols-[200px_1fr] gap-x-16 border-b px-4 py-4">
              <div>
                <p className="text-sm font-medium">Page structure</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  URL path and layout used to render the page
                </p>
              </div>
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    form.handleSubmit();
                  }}
                  className="-mx-1 space-y-4 px-1"
                >
                  {isRootPage ? (
                    <Alert>
                      <Info className="size-4" />
                      <AlertTitle>Homepage</AlertTitle>
                      <AlertDescription>
                        You can't change the path of the home page.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <form.Field name="parentPageId">
                      {(parentField) => (
                        <form.Field name="pathSegment">
                          {(pathField) => (
                            <PageLocationFieldset
                              parentPageId={parentField.state.value}
                              onParentPageIdChange={parentField.handleChange}
                              pathSegment={pathField.state.value}
                              onPathSegmentChange={pathField.handleChange}
                              pages={pages}
                              excludePageId={page.id}
                            />
                          )}
                        </form.Field>
                      )}
                    </form.Field>
                  )}
                  {layouts && layouts.length > 0 && (
                    <form.Field name="layoutId">
                      {(field) => (
                        <div className="space-y-2">
                          <Label>Layout</Label>
                          <Select
                            value={field.state.value ? String(field.state.value) : ""}
                            onValueChange={(value) => field.handleChange(Number(value))}
                            items={layouts.map((t) => ({
                              value: String(t.id),
                              label:
                                camoxApp.getLayoutById(t.layoutId)?._internal.title ?? t.layoutId,
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a layout" />
                            </SelectTrigger>
                            <SelectContent>
                              {layouts.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>
                                  {camoxApp.getLayoutById(t.layoutId)?._internal.title ??
                                    t.layoutId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </form.Field>
                  )}
                  <form.Subscribe
                    selector={(s) => ({
                      isSubmitting: s.isSubmitting,
                      isPristine: s.isPristine,
                    })}
                  >
                    {({ isSubmitting, isPristine }) => (
                      <Button type="submit" disabled={isSubmitting || isPristine}>
                        {isSubmitting && <Spinner />}
                        Save changes
                        {isSubmitting && "..."}
                      </Button>
                    )}
                  </form.Subscribe>
                </form>
              </div>
            </div>
            <div className="grid grid-cols-[200px_1fr] gap-x-16 px-4 py-4">
              <div>
                <p className="text-sm font-medium">SEO data</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  How the page appears when shared across the web
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ai-seo"
                    checked={page.aiSeoEnabled !== false}
                    onCheckedChange={(checked) =>
                      setAiSeo.mutate({ id: page.id, enabled: checked })
                    }
                  />
                  <Label htmlFor="ai-seo">AI metadata</Label>
                </div>
                <DebouncedFieldEditor
                  label="Page title"
                  placeholder="Page title..."
                  initialValue={page.metaTitle ?? ""}
                  disabled={page.aiSeoEnabled !== false}
                  onSave={(value) => setMetaTitle.mutate({ id: page.id, metaTitle: value })}
                />
                <DebouncedFieldEditor
                  label="Page description"
                  placeholder="Page description..."
                  initialValue={page.metaDescription ?? ""}
                  disabled={page.aiSeoEnabled !== false}
                  rows={2}
                  onSave={(value) =>
                    setMetaDescription.mutate({ id: page.id, metaDescription: value })
                  }
                />
                <SearchEnginePreview
                  page={page}
                  metaTitle={metaTitle}
                  metaDescription={page.metaDescription ?? ""}
                />
                <SocialPreviewSection
                  page={page}
                  metaTitle={metaTitle}
                  metaDescription={page.metaDescription ?? ""}
                  layoutId={pageLayoutRecord?.layoutId}
                  projectName={project?.name}
                />
              </div>
            </div>
            <div className="border-border grid grid-cols-[200px_1fr] gap-x-16 border-t px-4 py-4">
              <div>
                <p className="text-sm font-medium">Markdown content</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  How your content will be served to AI agents
                </p>
              </div>
              <div>
                <PageMarkdownPreview
                  pageId={page.id}
                  metaTitle={metaTitle}
                  metaDescription={page.metaDescription ?? ""}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

const SearchEnginePreview = ({
  page,
  metaTitle,
  metaDescription,
}: {
  page: Page;
  metaTitle: string;
  metaDescription: string;
}) => {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${page.fullPath}`;

  return (
    <div className="space-y-1 pt-2">
      <div className="flex items-center gap-1.5">
        <Label>Search engine preview</Label>
        <Tooltip>
          <TooltipTrigger delay={50} render={<Info className="text-muted-foreground size-3.5" />} />

          <TooltipContent>
            Titles are cropped after 60 characters and descriptions after 155, like on Google Search
            results.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="border-border space-y-0.5 rounded-lg border p-3">
        <p className="text-muted-foreground truncate text-xs">{url}</p>
        <p className="text-base font-medium text-blue-600 dark:text-blue-400">
          {truncateText(metaTitle || "Untitled", 60)}
        </p>
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {truncateText(metaDescription || "No description", 155)}
        </p>
      </div>
    </div>
  );
};

const SocialPreviewSection = ({
  page,
  metaTitle,
  metaDescription,
  layoutId,
  projectName,
}: {
  page: Page;
  metaTitle: string;
  metaDescription: string;
  layoutId?: string;
  projectName?: string;
}) => {
  const pageMetaTitle = page.metaTitle ?? page.pathSegment;
  const ogImageParams = new URLSearchParams({
    ...(layoutId && { layoutId }),
    title: pageMetaTitle,
    ...(page.metaDescription && { description: page.metaDescription }),
    ...(projectName && { projectName }),
  });
  const ogImage = `/og?${ogImageParams.toString()}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${page.fullPath}`;

  return (
    <div className="space-y-2 pt-2">
      <Label>Social preview</Label>
      <div className="border-border max-w-xl overflow-hidden rounded-lg border">
        {ogImage ? (
          <img
            src={ogImage}
            alt=""
            className="w-full object-cover"
            style={{ aspectRatio: "1200 / 630" }}
          />
        ) : (
          <div className="bg-muted w-full" style={{ aspectRatio: "1200 / 630" }} />
        )}
        <div className="space-y-1.5 border-t px-3 py-2.5">
          <p className="text-foreground truncate text-sm font-semibold">
            {metaTitle || "Untitled"}
          </p>
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {metaDescription || "No description"}
          </p>
          <div className="pt-1.5">
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Globe className="size-3 shrink-0" />
              <span className="truncate">{url}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageMarkdownPreview = ({
  pageId,
  metaTitle,
  metaDescription,
}: {
  pageId: number;
  metaTitle: string;
  metaDescription: string;
}) => {
  const { data: markdown } = useQuery(blockQueries.getPageMarkdown(pageId));
  if (markdown === undefined) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
        <Spinner className="size-3.5" />
        Loading...
      </div>
    );
  }

  const frontmatterLines = ["---", `title: "${metaTitle}"`, `description: "${metaDescription}"`];
  frontmatterLines.push("---");

  const fullMarkdown = frontmatterLines.join("\n") + "\n\n" + (markdown ?? "");

  return <ShikiMarkdown code={fullMarkdown} />;
};

export { EditPageModal };
