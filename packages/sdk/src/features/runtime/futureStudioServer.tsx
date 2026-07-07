import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

import type { CamoxApp } from "../../core/createApp";
import { FutureStudioApp, type FutureStudioRenderInput } from "./futureStudioApp";

export async function renderFutureStudioWithApp(
  input: FutureStudioRenderInput & { camoxApp: CamoxApp },
) {
  const queryClient = new QueryClient();

  return renderToString(
    <FutureStudioApp camoxApp={input.camoxApp} input={input} queryClient={queryClient} />,
  );
}
