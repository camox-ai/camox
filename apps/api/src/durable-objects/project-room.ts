import type { InvalidationMessage } from "@camox/api-contract/query-keys";
import { Server } from "partyserver";

import type { Bindings } from "../types";

export class ProjectRoom extends Server<Bindings> {
  async broadcastInvalidation(message: InvalidationMessage): Promise<void> {
    this.broadcast(JSON.stringify(message));
  }
}
