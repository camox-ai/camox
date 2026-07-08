import { QueryClient } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";

import type { CamoxApp } from "../../core/createApp";
import { PageApp } from "./pageApp";
import type { PageRenderInput } from "./runtime";

export async function renderPageWithApp(input: PageRenderInput & { camoxApp: CamoxApp }) {
  const queryClient = new QueryClient();

  return renderToString(
    <PageApp camoxApp={input.camoxApp} input={input} queryClient={queryClient} />,
  );
}
