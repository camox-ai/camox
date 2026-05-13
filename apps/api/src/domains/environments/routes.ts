import { authed } from "../../orpc";
import * as service from "./service";

// Protected procedures

const checkCompatibility = authed
  .input(service.checkCompatibilityInput)
  .handler(({ context, input }) => service.checkCompatibility(context, input));

const replicate = authed
  .input(service.replicateEnvironmentInput)
  .handler(({ context, input }) => service.replicateEnvironment(context, input));

export const environmentProcedures = {
  checkCompatibility,
  replicate,
};
