import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { command, constant, option } from "@optique/core/primitives";
import { integer, string } from "@optique/core/valueparser";

import { dispatch } from "../lib/dispatch";
import type { OutputMode } from "../lib/output";

const projectFlag = optional(option("--project", string({ metavar: "SLUG" })));
const jsonFlag = option("--json");

const list = command(
  "list",
  object({
    command: constant("pages.list" as const),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const get = command(
  "get",
  object({
    command: constant("pages.get" as const),
    id: option("--id", integer({ metavar: "ID" })),
    project: projectFlag,
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
    json: jsonFlag,
  }),
);

const setMetaTitle = command(
  "set-meta-title",
  object({
    command: constant("pages.set-meta-title" as const),
    id: option("--id", integer({ metavar: "ID" })),
    metaTitle: option("--meta-title", string({ metavar: "TITLE" })),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const setMetaDescription = command(
  "set-meta-description",
  object({
    command: constant("pages.set-meta-description" as const),
    id: option("--id", integer({ metavar: "ID" })),
    metaDescription: option("--meta-description", string({ metavar: "TEXT" })),
    project: projectFlag,
    json: jsonFlag,
  }),
);

const del = command(
  "delete",
  object({
    command: constant("pages.delete" as const),
    id: option("--id", integer({ metavar: "ID" })),
    project: projectFlag,
    json: jsonFlag,
  }),
);

export const parser = command(
  "pages",
  or(list, get, create, update, setLayout, setMetaTitle, setMetaDescription, del),
);

type Args =
  | { command: "pages.list"; project?: string; json: boolean }
  | { command: "pages.get"; id: number; project?: string; json: boolean }
  | {
      command: "pages.create";
      pathSegment: string;
      layoutId: number;
      parentPageId?: number;
      contentDescription?: string;
      project?: string;
      json: boolean;
    }
  | {
      command: "pages.update";
      id: number;
      pathSegment?: string;
      parentPageId?: number;
      project?: string;
      json: boolean;
    }
  | {
      command: "pages.set-layout";
      id: number;
      layoutId: number;
      project?: string;
      json: boolean;
    }
  | {
      command: "pages.set-meta-title";
      id: number;
      metaTitle: string;
      project?: string;
      json: boolean;
    }
  | {
      command: "pages.set-meta-description";
      id: number;
      metaDescription: string;
      project?: string;
      json: boolean;
    }
  | { command: "pages.delete"; id: number; project?: string; json: boolean };

export async function handler(args: Args): Promise<never> {
  const outputMode: OutputMode = args.json ? "json" : "auto";
  const projectFlag = args.project;

  switch (args.command) {
    case "pages.list":
      return dispatch({ toolName: "listPages", args: {}, projectFlag, outputMode });
    case "pages.get":
      return dispatch({ toolName: "getPage", args: { id: args.id }, projectFlag, outputMode });
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
        outputMode,
      });
    case "pages.set-layout":
      return dispatch({
        toolName: "setPageLayout",
        args: { id: args.id, layoutId: args.layoutId },
        projectFlag,
        outputMode,
      });
    case "pages.set-meta-title":
      return dispatch({
        toolName: "setPageMetaTitle",
        args: { id: args.id, metaTitle: args.metaTitle },
        projectFlag,
        outputMode,
      });
    case "pages.set-meta-description":
      return dispatch({
        toolName: "setPageMetaDescription",
        args: { id: args.id, metaDescription: args.metaDescription },
        projectFlag,
        outputMode,
      });
    case "pages.delete":
      return dispatch({ toolName: "deletePage", args: { id: args.id }, projectFlag, outputMode });
  }
}
