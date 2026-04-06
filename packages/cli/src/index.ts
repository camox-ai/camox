import * as p from "@clack/prompts";

const command = process.argv[2];

async function main() {
  switch (command) {
    case "init": {
      const { init } = await import("./commands/init.js");
      await init();
      break;
    }
    default: {
      p.intro("camox");
      p.log.info("Available commands:");
      p.log.message("  camox init    Scaffold a new Camox project");
      p.outro("Run `camox <command> --help` for more info.");
      break;
    }
  }
}

main().catch(console.error);
