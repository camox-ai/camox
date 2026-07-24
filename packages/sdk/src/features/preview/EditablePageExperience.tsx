import type { QueryClient } from "@tanstack/react-query";

import type { CamoxApp } from "../../core/createApp";
import { CompleteBlockEditingRuntimeProvider } from "../../core/editing/CompleteBlockEditingRuntime";
import { AuthenticatedCamoxProvider } from "../provider/AuthenticatedCamoxProvider";
import type { PageRenderInput } from "../runtime/runtime";
import { CamoxPreview } from "./CamoxPreview";
import { EditablePageContent } from "./EditablePageContent";

export function EditablePageExperience({
  camoxApp: _camoxApp,
  input: _input,
  queryClient: _queryClient,
}: {
  camoxApp: CamoxApp;
  input: PageRenderInput;
  queryClient: QueryClient;
}) {
  return (
    <AuthenticatedCamoxProvider>
      <CompleteBlockEditingRuntimeProvider>
        <CamoxPreview>
          <EditablePageContent />
        </CamoxPreview>
      </CompleteBlockEditingRuntimeProvider>
    </AuthenticatedCamoxProvider>
  );
}
