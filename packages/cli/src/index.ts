import { or } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { defineProgram } from "@optique/core/program";
import { run } from "@optique/run";

import * as init from "./commands/init";
import * as login from "./commands/login";
import * as logout from "./commands/logout";

const commands = { init, login, logout };

const program = defineProgram({
  parser: or(init.parser, login.parser, logout.parser),
  metadata: {
    name: "camox",
    brief: message`Camox CLI`,
  },
});

const result = run(program, { help: "both" });
await commands[result.command].handler();
