import { object, or } from "@optique/core/constructs";
import { optional } from "@optique/core/modifiers";
import { command, constant, option } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";

import { dispatch } from "../lib/dispatch";
import type { OutputMode } from "../lib/output";

const projectFlag = optional(option("--project", string({ metavar: "SLUG" })));
const jsonFlag = option("--json");

const list = command(
  "list",
  object({
    command: constant("layouts.list" as const),
    project: projectFlag,
    json: jsonFlag,
  }),
);

export const parser = command("layouts", or(list));

type Args = { command: "layouts.list"; project?: string; json: boolean };

export async function handler(args: Args): Promise<never> {
  const outputMode: OutputMode = args.json ? "json" : "auto";
  const projectFlag = args.project;
  switch (args.command) {
    case "layouts.list":
      return dispatch({ toolName: "listLayouts", args: {}, projectFlag, outputMode });
  }
}
