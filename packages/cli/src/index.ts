import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { command, constant } from "@optique/core/primitives";
import { defineProgram } from "@optique/core/program";
import { run } from "@optique/run";

import { init } from "./commands/init";

const parser = command(
  "init",
  object({
    command: constant("init"),
  }),
);

const program = defineProgram({
  parser,
  metadata: {
    name: "camox",
    brief: message`Scaffold a new Camox project`,
  },
});

run(program, { help: "both" });

await init();
