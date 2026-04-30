import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { command, constant, option } from "@optique/core/primitives";
import { integer, string } from "@optique/core/valueparser";

import { dispatch } from "../lib/dispatch";
import { type OutputMode, asCliError, parseJsonFlag, printError } from "../lib/output";

const projectFlag = optional(option("--project", string({ metavar: "SLUG" })));
const jsonFlag = option("--json");

const types = command(
  "types",
  object({
    command: constant("blocks.types" as const),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const create = command(
  "create",
  object({
    command: constant("blocks.create" as const),
    pageId: option("--page-id", integer({ metavar: "ID" })),
    type: option("--type", string({ metavar: "TYPE" })),
    content: option("--content", string({ metavar: "JSON" })),
    settings: optional(option("--settings", string({ metavar: "JSON" }))),
    afterPosition: optional(option("--after-position", string({ metavar: "POS" }))),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const edit = command(
  "edit",
  object({
    command: constant("blocks.edit" as const),
    id: option("--id", integer({ metavar: "ID" })),
    content: optional(option("--content", string({ metavar: "JSON" }))),
    settings: optional(option("--settings", string({ metavar: "JSON" }))),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const move = command(
  "move",
  object({
    command: constant("blocks.move" as const),
    id: option("--id", integer({ metavar: "ID" })),
    afterPosition: optional(option("--after-position", string({ metavar: "POS" }))),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const del = command(
  "delete",
  object({
    command: constant("blocks.delete" as const),
    id: option("--id", integer({ metavar: "ID" })),
    project: projectFlag,
    json: jsonFlag,
  }),
);

export const parser = command("blocks", or(types, create, edit, move, del));

type Args =
  | { command: "blocks.types"; project?: string; json: boolean }
  | {
      command: "blocks.create";
      pageId: number;
      type: string;
      content: string;
      settings?: string;
      afterPosition?: string;
      project?: string;
      json: boolean;
    }
  | {
      command: "blocks.edit";
      id: number;
      content?: string;
      settings?: string;
      project?: string;
      json: boolean;
    }
  | {
      command: "blocks.move";
      id: number;
      afterPosition?: string;
      project?: string;
      json: boolean;
    }
  | { command: "blocks.delete"; id: number; project?: string; json: boolean };

export async function handler(args: Args): Promise<never> {
  const outputMode: OutputMode = args.json ? "json" : "auto";
  const projectFlag = args.project;

  try {
    switch (args.command) {
      case "blocks.types":
        return dispatch({ toolName: "listBlockTypes", args: {}, projectFlag, outputMode });
      case "blocks.create": {
        const content = parseJsonFlag("--content", args.content);
        const settings =
          args.settings !== undefined ? parseJsonFlag("--settings", args.settings) : undefined;
        return dispatch({
          toolName: "createBlock",
          args: {
            pageId: args.pageId,
            type: args.type,
            content,
            settings,
            afterPosition: args.afterPosition,
          },
          projectFlag,
          outputMode,
        });
      }
      case "blocks.edit": {
        const content =
          args.content !== undefined ? parseJsonFlag("--content", args.content) : undefined;
        const settings =
          args.settings !== undefined ? parseJsonFlag("--settings", args.settings) : undefined;
        return dispatch({
          toolName: "editBlock",
          args: { id: args.id, content, settings },
          projectFlag,
          outputMode,
        });
      }
      case "blocks.move":
        return dispatch({
          toolName: "moveBlock",
          args: { id: args.id, afterPosition: args.afterPosition },
          projectFlag,
          outputMode,
        });
      case "blocks.delete":
        return dispatch({
          toolName: "deleteBlock",
          args: { id: args.id },
          projectFlag,
          outputMode,
        });
    }
  } catch (err) {
    printError(asCliError(err));
    process.exit(1);
  }
}
