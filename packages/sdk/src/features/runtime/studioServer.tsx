import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

import type { CamoxApp } from "../../core/createApp";
import { StudioApp, type StudioRenderInput } from "./studioApp";

export async function renderStudioWithApp(input: StudioRenderInput & { camoxApp: CamoxApp }) {
  const queryClient = new QueryClient();

  return renderToString(
    <StudioApp camoxApp={input.camoxApp} input={input} queryClient={queryClient} />,
  );
}
