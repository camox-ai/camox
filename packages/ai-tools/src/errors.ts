import { ORPCError } from "@orpc/server";
import { ZodError } from "zod";

export type ToolError = {
  code: string;
  message: string;
  details?: unknown;
};

/**
 * Normalize tool-handler failures into a stable JSON shape. LLMs read this
 * as a tool result and self-correct over the next 1–2 turns.
 */
export function formatToolError(err: unknown): ToolError {
  if (err instanceof ZodError) {
    return {
      code: "INVALID_INPUT",
      message: "Input did not match the tool's schema.",
      details: err.issues,
    };
  }
  if (err instanceof ORPCError) {
    return {
      code: err.code,
      message: err.message,
      details: err.data ?? undefined,
    };
  }
  if (err instanceof Error) {
    return { code: "INTERNAL_ERROR", message: err.message };
  }
  return { code: "INTERNAL_ERROR", message: String(err) };
}
