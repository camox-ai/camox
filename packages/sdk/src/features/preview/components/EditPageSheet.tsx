/* -------------------------------------------------------------------------------------------------
 * EditPageSheet
 * -----------------------------------------------------------------------------------------------*/

import * as Sheet from "@/components/ui/sheet";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { api } from "camox/_generated/api";
import { Doc } from "camox/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatPathSegment } from "@/lib/utils";
import { useSelector } from "@xstate/store/react";
import { previewStore } from "../previewStore";
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
  const isRootPage = pageToEdit.fullPath === "/";
  const pages = useQuery(api.pages.listPages);
  const updatePage = useMutation(api.pages.updatePage);
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      pathSegment: pageToEdit.pathSegment,
      parentPageId: pageToEdit.parentPageId,
    },
    onSubmit: async (values) => {
      try {
        const { fullPath } = await updatePage({
          pageId: pageToEdit._id,
          pathSegment: values.value.pathSegment,
          parentPageId: values.value.parentPageId,
        });

        const displayName =
          pageToEdit.metaTitle ?? formatPathSegment(values.value.pathSegment);
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
  React.useEffect(() => {
    form.update({
      defaultValues: {
        pathSegment: pageToEdit.pathSegment,
        parentPageId: pageToEdit.parentPageId,
      },
    });
  }, [pageToEdit, form]);

  return (
    <Sheet.Sheet
      open
      onOpenChange={(value) => {
        if (!value) previewStore.send({ type: "closeEditPageSheet" });
      }}
    >
      <Sheet.SheetContent className="min-w-[500px]">
        <Sheet.SheetHeader className="border-b border-border">
          <Sheet.SheetTitle>Edit page</Sheet.SheetTitle>
          <Sheet.SheetDescription>
            Update the page details.
          </Sheet.SheetDescription>
        </Sheet.SheetHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4 py-4 px-4"
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
          <Button
            type="submit"
            disabled={form.state.isSubmitting || form.state.isPristine}
          >
            {form.state.isSubmitting && <Spinner />}
            Save changes
            {form.state.isSubmitting && "..."}
          </Button>
        </form>
      </Sheet.SheetContent>
    </Sheet.Sheet>
  );
};

export { EditPageSheet };
