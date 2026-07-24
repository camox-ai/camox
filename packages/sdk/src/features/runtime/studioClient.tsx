import { QueryClient } from "@tanstack/react-query";
import { hydrateRoot } from "react-dom/client";

import type { CamoxApp } from "../../core/createApp";
import { readHydrationData } from "./hydrationData";
import { StudioApp, type StudioRenderInput } from "./studioApp";

export function hydrateStudioWithApp(camoxApp: CamoxApp) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Camox runtime root element was not found.");

  const queryClient = new QueryClient();
  const input = readHydrationData<StudioRenderInput>();
  hydrateRoot(root, <StudioApp camoxApp={camoxApp} input={input} queryClient={queryClient} />);
}
