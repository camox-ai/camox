import { pub } from "../../orpc";
import * as service from "./service";

// Public procedures

const list = pub
  .input(service.listLayoutsInput)
  .handler(({ context, input }) => service.listLayouts(context, input));

const sync = pub
  .input(service.syncLayoutsInput)
  .handler(({ context, input }) => service.syncLayouts(context, input));

export const layoutProcedures = { list, sync };
