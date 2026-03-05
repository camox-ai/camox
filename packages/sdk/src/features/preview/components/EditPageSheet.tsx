/* -------------------------------------------------------------------------------------------------
 * EditPageSheet
 * -----------------------------------------------------------------------------------------------*/

import * as Sheet from "@/components/ui/sheet";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { api } from "camox/_generated/api";
import { Doc, Id } from "camox/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { toast } from "sonner";
import { SocialPreview, type SocialPreviewProvider } from "react-og-preview";
import "react-og-preview/styles.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPathSegment } from "@/lib/utils";
import { useSelector } from "@xstate/store/react";
import { previewStore } from "../previewStore";
import { useCamoxApp } from "../../provider/components/CamoxAppContext";
import { DebouncedFieldEditor } from "./DebouncedFieldEditor";
import { PageLocationFieldset } from "./PageLocationFieldset";

const EditPageSheet = () => {
  const editingPage = useSelector(
    previewStore,
    (state) => state.context.editingPage,
  );

  if (!editingPage) return null;

  return <EditPageSheetContent pageToEdit={editingPage} />;
};

const EditPageSheetContent = ({ pageToEdit }: { pageToEdit: Doc<"pages"> }) => {
  const livePage = useQuery(api.pages.getPageById, {
    pageId: pageToEdit._id,
  });
  const page = livePage ?? pageToEdit;
  const isRootPage = page.fullPath === "/";
  const pages = useQuery(api.pages.listPages);
  const project = useQuery(api.projects.getFirstProject);
  const layouts = useQuery(
    api.layouts.listLayouts,
    project ? { projectId: project._id } : "skip",
  );
  const camoxApp = useCamoxApp();
  const updatePage = useMutation(api.pages.updatePage);
  const setPageLayout = useMutation(api.pages.setPageLayout);
  const setAiSeo = useMutation(api.pages.setAiSeo);
  const updatePageMetaTitle = useMutation(api.pages.updatePageMetaTitle);
  const updatePageMetaDescription = useMutation(
    api.pages.updatePageMetaDescription,
  );
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      pathSegment: pageToEdit.pathSegment,
      parentPageId: pageToEdit.parentPageId,
      layoutId: pageToEdit.layoutId ?? ("" as Id<"layouts">),
    },
    onSubmit: async (values) => {
      try {
        const { fullPath } = await updatePage({
          pageId: pageToEdit._id,
          pathSegment: values.value.pathSegment,
          parentPageId: values.value.parentPageId,
        });

        if (values.value.layoutId) {
          await setPageLayout({
            pageId: pageToEdit._id,
            layoutId: values.value.layoutId,
          });
        }

        const displayName =
          page.metaTitle ?? formatPathSegment(values.value.pathSegment);
        toast.success(`Updated ${displayName} page`);
        previewStore.send({ type: "closeEditPageSheet" });
        form.reset();

        navigate({ to: fullPath });
      } catch (error) {
        console.error("Failed to update page:", error);
        toast.error("Could not update page");
      }
    },
  });

  // Reset form when opening with a different page
  const prevPageId = React.useRef(pageToEdit._id);
  React.useEffect(() => {
    if (prevPageId.current === pageToEdit._id) return;
    prevPageId.current = pageToEdit._id;
    form.reset({
      pathSegment: pageToEdit.pathSegment,
      parentPageId: pageToEdit.parentPageId,
      layoutId: pageToEdit.layoutId ?? ("" as Id<"layouts">),
    });
  }, [pageToEdit, form]);

  return (
    <Sheet.Sheet
      open
      onOpenChange={(value) => {
        if (!value) previewStore.send({ type: "closeEditPageSheet" });
      }}
    >
      <Sheet.SheetContent className="min-w-[880px] gap-0 overflow-hidden">
        <Sheet.SheetHeader className="border-b border-border">
          <Sheet.SheetTitle>Edit page</Sheet.SheetTitle>
          <Sheet.SheetDescription>
            Update the page details.
          </Sheet.SheetDescription>
        </Sheet.SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[200px_1fr] gap-x-8 border-b border-border py-6 px-6">
            <div>
              <p className="text-sm font-medium">Page structure</p>
              <p className="text-xs text-muted-foreground mt-1">
                URL path and layout used to render the page.
              </p>
            </div>
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
                className="space-y-4"
              >
                <form.Field name="parentPageId">
                  {(parentField) => (
                    <form.Field name="pathSegment">
                      {(pathField) => (
                        <PageLocationFieldset
                          parentPageId={parentField.state.value}
                          onParentPageIdChange={parentField.handleChange}
                          pathSegment={pathField.state.value}
                          onPathSegmentChange={pathField.handleChange}
                          disabled={isRootPage}
                          pages={pages}
                          excludePageId={pageToEdit._id}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Field>
                {layouts && layouts.length > 0 && (
                  <form.Field name="layoutId">
                    {(field) => (
                      <div className="space-y-2">
                        <Label>Layout</Label>
                        <Select
                          value={field.state.value}
                          onValueChange={(value) =>
                            field.handleChange(value as Id<"layouts">)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a layout" />
                          </SelectTrigger>
                          <SelectContent>
                            {layouts.map((t) => (
                              <SelectItem key={t._id} value={t._id}>
                                {camoxApp.getLayoutById(t.layoutId)
                                  ?.title ?? t.layoutId}
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
          <div className="grid grid-cols-[200px_1fr] gap-x-8 py-6 px-6">
            <div>
              <p className="text-sm font-medium">SEO</p>
              <p className="text-xs text-muted-foreground mt-1">
                How the page appears to search engines and bots.
              </p>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="ai-seo"
                  checked={page.aiSeoEnabled !== false}
                  onCheckedChange={(checked) =>
                    setAiSeo({ pageId: page._id, enabled: checked })
                  }
                />
                <Label htmlFor="ai-seo">AI metadata</Label>
              </div>
              <DebouncedFieldEditor
                label="Page title"
                placeholder="Page title..."
                initialValue={page.metaTitle ?? ""}
                disabled={page.aiSeoEnabled !== false}
                onSave={(value) =>
                  updatePageMetaTitle({ pageId: page._id, metaTitle: value })
                }
              />
              <DebouncedFieldEditor
                label="Page description"
                placeholder="Page description..."
                initialValue={page.metaDescription ?? ""}
                disabled={page.aiSeoEnabled !== false}
                rows={2}
                onSave={(value) =>
                  updatePageMetaDescription({
                    pageId: page._id,
                    metaDescription: value,
                  })
                }
              />
              <SocialPreviewSection page={page} domain={project?.domain} />
            </div>
          </div>
        </div>
      </Sheet.SheetContent>
    </Sheet.Sheet>
  );
};

const SOCIAL_PROVIDERS: { value: SocialPreviewProvider; label: string }[] = [
  { value: "twitter", label: "Twitter" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "bluesky", label: "Bluesky" },
  { value: "mastodon", label: "Mastodon" },
  { value: "whatsapp", label: "WhatsApp" },
];

function useHeadMeta() {
  const [meta, setMeta] = React.useState({
    title: "",
    description: "",
    image: "",
  });

  React.useEffect(() => {
    const read = () =>
      setMeta({
        title: document.title,
        description:
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute("content") ?? "",
        image:
          document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute("content") ?? "",
      });

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, []);

  return meta;
}

const SocialPreviewSection = ({
  page,
  domain,
}: {
  page: Doc<"pages">;
  domain?: string;
}) => {
  const [provider, setProvider] =
    React.useState<SocialPreviewProvider>("twitter");
  const headMeta = useHeadMeta();

  const url = domain ? `${domain}${page.fullPath}` : page.fullPath;

  return (
    <div className="space-y-2 pt-2">
      <Label>Social preview</Label>
      <Select
        value={provider}
        onValueChange={(value) => setProvider(value as SocialPreviewProvider)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOCIAL_PROVIDERS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SocialPreview
        provider={provider}
        url={url}
        title={headMeta.title || null}
        description={headMeta.description || null}
        image={headMeta.image || null}
        disableLink
      />
    </div>
  );
};

export { EditPageSheet };
