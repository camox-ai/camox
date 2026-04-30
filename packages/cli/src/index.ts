import { or } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import { defineProgram } from "@optique/core/program";
import { runSync } from "@optique/run";

import * as blocks from "./commands/blocks";
import * as init from "./commands/init";
import * as layouts from "./commands/layouts";
import * as login from "./commands/login";
import * as logout from "./commands/logout";
import * as pages from "./commands/pages";
import * as status from "./commands/status";

// With 6 top-level parsers and many subcommands, optique's variadic `or`
// overload + recursive command inference exceeds what TypeScript can resolve,
// so `runSync` ends up returning `unknown`. We narrow at the call site via a
// hand-written discriminator union — each handler still type-checks its own
// args internally.
type Result =
  | { command: "init" }
  | { command: "login" }
  | { command: "logout" }
  | Parameters<typeof status.handler>[0]
  | Parameters<typeof pages.handler>[0]
  | Parameters<typeof blocks.handler>[0]
  | Parameters<typeof layouts.handler>[0];

const program = defineProgram({
  parser: or(
    init.parser,
    login.parser,
    logout.parser,
    status.parser,
    pages.parser,
    blocks.parser,
    layouts.parser,
  ),
  metadata: {
    name: "camox",
    brief: message`Camox CLI`,
  },
});

const result = runSync(program as never, { help: "both" }) as Result;

switch (result.command) {
  case "init":
    await init.handler();
    break;
  case "login":
    await login.handler();
    break;
  case "logout":
    await logout.handler();
    break;
  case "status":
    await status.handler(result);
    break;
  case "pages.list":
  case "pages.get":
  case "pages.create":
  case "pages.update":
  case "pages.set-layout":
  case "pages.set-meta-title":
  case "pages.set-meta-description":
  case "pages.delete":
    await pages.handler(result);
    break;
  case "blocks.types":
  case "blocks.describe":
  case "blocks.create":
  case "blocks.edit":
  case "blocks.move":
  case "blocks.delete":
    await blocks.handler(result);
    break;
  case "layouts.list":
    await layouts.handler(result);
    break;
}
