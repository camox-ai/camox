import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

/* eslint-enable no-restricted-imports */
import { DataModel } from "./_generated/dataModel";
/* eslint-disable no-restricted-imports */
import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
} from "./_generated/server";

// To be extended from other files via triggers.register
export const triggers = new Triggers<DataModel>();

// create wrappers that replace the built-in `mutation` and `internalMutation`
// the wrappers override `ctx` so that `ctx.db.insert`, `ctx.db.patch`, etc. run registered trigger functions
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
