import { QueryClient } from "@tanstack/react-query";
import { hydrateRoot } from "react-dom/client";

import type { CamoxApp } from "../../core/createApp";
import { FuturePageApp } from "./futurePageApp";
import type { FuturePageRenderInput } from "./futureRuntime";

type FuturePageHydrationData = FuturePageRenderInput;

function readFuturePageHydrationData(): FuturePageHydrationData {
  const script = document.getElementById("__CAMOX_FUTURE_DATA__");
  if (!script?.textContent) {
    throw new Error("Camox future runtime hydration data was not found.");
  }

  return JSON.parse(script.textContent) as FuturePageHydrationData;
}

export function hydrateFuturePageWithApp(camoxApp: CamoxApp) {
  const root = document.getElementById("root");
  if (!root) throw new Error("Camox future runtime root element was not found.");

  const queryClient = new QueryClient();
  const input = readFuturePageHydrationData();

  hydrateRoot(root, <FuturePageApp camoxApp={camoxApp} input={input} queryClient={queryClient} />);
}
