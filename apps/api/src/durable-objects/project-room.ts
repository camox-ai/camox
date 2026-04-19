import type { InvalidationMessage } from "@camox/api-contract/query-keys";
import { Server } from "partyserver";

import type { Bindings } from "../types";

export class ProjectRoom extends Server<Bindings> {
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const message: InvalidationMessage = await request.json();
    this.broadcast(JSON.stringify(message));
    return new Response("OK", { status: 200 });
  }
}
