import { QueryClient } from "@tanstack/react-query";
import { hydrateRoot } from "react-dom/client";

import type { CamoxApp } from "../../core/createApp";
import { PageApp } from "./pageApp";
import type { PageRenderInput } from "./runtime";
import { StudioApp, type StudioRenderInput } from "./studioApp";

type HydrationData =
  | (PageRenderInput & { runtimeKind?: "page" })
  | (StudioRenderInput & { runtimeKind: "studio" });

function readHydrationData(): HydrationData {
  const script = document.getElementById("__CAMOX_DATA__");
  if (!script?.textContent) {
    throw new Error("Camox runtime hydration data was not found.");
  }

  return JSON.parse(script.textContent) as HydrationData;
}

export function hydratePageWithApp(camoxApp: CamoxApp) {
  hydrateRuntimeWithApp(camoxApp);
}

export function hydrateRuntimeWithApp(camoxApp: CamoxApp) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Camox runtime root element was not found.");

  const queryClient = new QueryClient();
  const input = readHydrationData();

  if (input.runtimeKind === "studio") {
    hydrateRoot(root, <StudioApp camoxApp={camoxApp} input={input} queryClient={queryClient} />);
    return;
  }

  hydrateRoot(root, <PageApp camoxApp={camoxApp} input={input} queryClient={queryClient} />);
}
