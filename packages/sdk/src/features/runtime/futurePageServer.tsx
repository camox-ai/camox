import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

import type { CamoxApp } from "../../core/createApp";
import { FuturePageApp } from "./futurePageApp";
import type { FuturePageRenderInput } from "./futureRuntime";

export async function renderFuturePageWithApp(
  input: FuturePageRenderInput & { camoxApp: CamoxApp },
) {
  const queryClient = new QueryClient();

  return renderToString(
    <FuturePageApp camoxApp={input.camoxApp} input={input} queryClient={queryClient} />,
  );
}
