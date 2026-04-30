import { authed } from "../../orpc";
import * as service from "./service";

const callTool = authed
  .input(service.callToolInput)
  .handler(({ context, input }) => service.callTool(context, input));

const listTools = authed
  .input(service.listToolsInput)
  .handler(({ context, input }) => service.listTools(context, input));

export const agentProcedures = {
  callTool,
  listTools,
};
