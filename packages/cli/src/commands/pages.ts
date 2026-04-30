import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { command, constant, option } from "@optique/core/primitives";
import { integer, string } from "@optique/core/valueparser";

import { dispatch } from "../lib/dispatch";
import { type OutputMode, printError } from "../lib/output";

const projectFlag = optional(option("--project", string({ metavar: "SLUG" })));
const jsonFlag = option("--json");
const productionFlag = option("--production");

const list = command(
  "list",
  object({
    command: constant("pages.list" as const),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

const get = command(
  "get",
  object({
    command: constant("pages.get" as const),
    id: optional(option("--id", integer({ metavar: "ID" }))),
    path: optional(option("--path", string({ metavar: "PATH" }))),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

const create = command(
  "create",
  object({
    command: constant("pages.create" as const),
    pathSegment: option("--path-segment", string({ metavar: "SEGMENT" })),
    layoutId: option("--layout-id", integer({ metavar: "ID" })),
    parentPageId: optional(option("--parent-page-id", integer({ metavar: "ID" }))),
    contentDescription: optional(option("--content-description", string({ metavar: "TEXT" }))),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

const update = command(
  "update",
  object({
    command: constant("pages.update" as const),
    id: option("--id", integer({ metavar: "ID" })),
    pathSegment: optional(option("--path-segment", string({ metavar: "SEGMENT" }))),
    parentPageId: optional(option("--parent-page-id", integer({ metavar: "ID" }))),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

const setLayout = command(
  "set-layout",
  object({
    command: constant("pages.set-layout" as const),
    id: option("--id", integer({ metavar: "ID" })),
    layoutId: option("--layout-id", integer({ metavar: "ID" })),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

const del = command(
  "delete",
  object({
    command: constant("pages.delete" as const),
    id: option("--id", integer({ metavar: "ID" })),
    project: projectFlag,
    production: productionFlag,
    json: jsonFlag,
  }),
);

export const parser = command("pages", or(list, get, create, update, setLayout, del));

type CommonFlags = { project?: string; production: boolean; json: boolean };

type Args =
  | ({ command: "pages.list" } & CommonFlags)
  | ({ command: "pages.get"; id?: number; path?: string } & CommonFlags)
  | ({
      command: "pages.create";
      pathSegment: string;
      layoutId: number;
      parentPageId?: number;
      contentDescription?: string;
    } & CommonFlags)
  | ({
      command: "pages.update";
      id: number;
      pathSegment?: string;
      parentPageId?: number;
    } & CommonFlags)
  | ({ command: "pages.set-layout"; id: number; layoutId: number } & CommonFlags)
  | ({ command: "pages.delete"; id: number } & CommonFlags);

export async function handler(args: Args): Promise<never> {
  const outputMode: OutputMode = args.json ? "json" : "auto";
  const projectFlag = args.project;
  const production = args.production;

  switch (args.command) {
    case "pages.list":
      return dispatch({ toolName: "listPages", args: {}, projectFlag, production, outputMode });
    case "pages.get": {
      if ((args.id == null) === (args.path == null)) {
        printError({
          code: "INVALID_ARGS",
          message: "Pass exactly one of --id or --path.",
        });
        process.exit(2);
      }
      const toolArgs = args.id != null ? { id: args.id } : { path: args.path };
      return dispatch({
        toolName: "getPage",
        args: toolArgs,
        projectFlag,
        production,
        outputMode,
      });
    }
    case "pages.create":
      return dispatch({
        toolName: "createPage",
        args: {
          pathSegment: args.pathSegment,
          layoutId: args.layoutId,
          parentPageId: args.parentPageId,
          contentDescription: args.contentDescription,
        },
        projectFlag,
        production,
        outputMode,
      });
    case "pages.update":
      return dispatch({
        toolName: "updatePage",
        args: {
          id: args.id,
          pathSegment: args.pathSegment,
          parentPageId: args.parentPageId,
        },
        projectFlag,
        production,
        outputMode,
      });
    case "pages.set-layout":
      return dispatch({
        toolName: "setPageLayout",
        args: { id: args.id, layoutId: args.layoutId },
        projectFlag,
        production,
        outputMode,
      });
    case "pages.delete":
      return dispatch({
        toolName: "deletePage",
        args: { id: args.id },
        projectFlag,
        production,
        outputMode,
      });
  }
}
