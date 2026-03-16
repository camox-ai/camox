import { customAction, customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";

/* eslint-enable no-restricted-imports */
import { DataModel } from "./_generated/dataModel";
/* eslint-disable no-restricted-imports */
import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  action as rawAction,
} from "./_generated/server";

// To be extended from other files via triggers.register
export const triggers = new Triggers<DataModel>();

async function ensureAuthenticated(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

// Authenticated mutation with trigger support
export const mutation = customMutation(rawMutation, {
  args: {},
  input: async (ctx) => {
    await ensureAuthenticated(ctx);
    return { ctx: triggers.wrapDB(ctx), args: {} };
  },
});

// Internal mutation: triggers only, no auth
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));

// Authenticated action
export const action = customAction(rawAction, {
  args: {},
  input: async (ctx) => {
    await ensureAuthenticated(ctx);
    return { ctx: {}, args: {} };
  },
});
