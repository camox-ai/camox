import { Server } from "partyserver";

import type { Bindings } from "../types";

export type InvalidationEvent = {
  type: "invalidate";
  entity: "page" | "block" | "repeatableItem" | "file" | "layout";
  action: "created" | "updated" | "deleted";
  entityId?: number;
  pageId?: number;
  pagePath?: string;
  parentId?: number;
};

export class ProjectRoom extends Server<Bindings> {
  async onRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const event: InvalidationEvent = await request.json();
    this.broadcast(JSON.stringify(event));
    return new Response("OK", { status: 200 });
  }
}
