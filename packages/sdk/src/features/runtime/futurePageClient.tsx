import { QueryClient } from "@tanstack/react-query";
import { hydrateRoot } from "react-dom/client";

import type { CamoxApp } from "../../core/createApp";
import { FuturePageApp } from "./futurePageApp";
import type { FuturePageRenderInput } from "./futureRuntime";
import { FutureStudioApp, type FutureStudioRenderInput } from "./futureStudioApp";

type FutureHydrationData =
  | (FuturePageRenderInput & { runtimeKind?: "page" })
  | (FutureStudioRenderInput & { runtimeKind: "studio" });

function readFutureHydrationData(): FutureHydrationData {
  const script = document.getElementById("__CAMOX_FUTURE_DATA__");
  if (!script?.textContent) {
    throw new Error("Camox future runtime hydration data was not found.");
  }

  return JSON.parse(script.textContent) as FutureHydrationData;
}

export function hydrateFuturePageWithApp(camoxApp: CamoxApp) {
  hydrateFutureRuntimeWithApp(camoxApp);
}

export function hydrateFutureRuntimeWithApp(camoxApp: CamoxApp) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Camox future runtime root element was not found.");

  const queryClient = new QueryClient();
  const input = readFutureHydrationData();

  if (input.runtimeKind === "studio") {
    hydrateRoot(
      root,
      <FutureStudioApp camoxApp={camoxApp} input={input} queryClient={queryClient} />,
    );
    return;
  }

  hydrateRoot(root, <FuturePageApp camoxApp={camoxApp} input={input} queryClient={queryClient} />);
}
