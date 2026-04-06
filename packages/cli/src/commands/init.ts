import { execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";

import { getOrAuthenticate } from "../lib/auth.js";
import {
  type PackageManager,
  copyDir,
  detectPackageManager,
  isInsideGitRepo,
  pmCommands,
  slugify,
} from "../lib/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));

function onCancel() {
  p.cancel("Cancelled.");
  process.exit(0);
}

export async function init() {
  p.intro("camox init");

  const result = await p.group(
    {
      name: () =>
        p.text({
          message: "Project display name",
          placeholder: "My Website",
          validate: (value) => {
            if (!value.trim()) return "Project name is required";
          },
        }),
      slug: ({ results }) =>
        p.text({
          message: "Project slug",
          initialValue: slugify(results.name ?? ""),
          validate: (value) => {
            if (!value.trim()) return "Slug is required";
            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && !/^[a-z0-9]$/.test(value)) {
              return "Slug must be lowercase alphanumeric with hyphens";
            }
          },
        }),
      path: ({ results }) =>
        p.text({
          message: "Project path",
          initialValue: `./${results.slug ?? "my-site"}`,
          validate: (value) => {
            if (!value.trim()) return "Path is required";
          },
        }),
    },
    { onCancel },
  );

  const targetDir = path.resolve(result.path as string);

  // Authenticate with camox.ai
  try {
    await getOrAuthenticate();
  } catch {
    p.log.warn("Continuing without authentication.");
  }

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    p.cancel(`Directory ${targetDir} is not empty.`);
    process.exit(1);
  }

  // Git init prompt (skip if already inside a git repo)
  const alreadyInRepo = isInsideGitRepo();
  let initGit = false;
  if (!alreadyInRepo) {
    const answer = await p.confirm({
      message: "Initialize a git repository?",
      initialValue: true,
    });
    if (p.isCancel(answer)) return onCancel();
    initGit = answer;
  }

  // Package manager
  const detected = detectPackageManager();
  let pm: PackageManager;

  if (detected) {
    pm = detected;
    p.log.info(`Detected package manager: ${detected}`);
  } else {
    const selected = await p.select({
      message: "Which package manager?",
      options: [
        { value: "pnpm" as const, label: "pnpm" },
        { value: "bun" as const, label: "bun" },
        { value: "npm" as const, label: "npm" },
        { value: "yarn" as const, label: "yarn" },
      ],
    });
    if (p.isCancel(selected)) return onCancel();
    pm = selected;
  }

  // Scaffold
  const s = p.spinner();
  s.start("Scaffolding project...");

  const templateDir = path.resolve(__dirname, "..", "template");
  copyDir(templateDir, targetDir, {
    "{{projectName}}": result.name as string,
    "{{projectSlug}}": result.slug as string,
    "{{camoxVersion}}": ownPkg.version,
  });

  s.stop("Project scaffolded!");

  function dropIntoProject(): never {
    const shell = process.env.SHELL || "/bin/bash";
    p.log.info(`Dropping you into ${result.path}`);
    spawnSync(shell, [], { cwd: targetDir, stdio: "inherit" });
    process.exit(0);
  }

  // Git init
  if (initGit) {
    try {
      execSync("git init", { cwd: targetDir, stdio: "ignore" });
      p.log.success("Initialized git repository.");
    } catch {
      p.log.warn("Could not initialize git repository.");
    }
  }

  // Install dependencies
  const { install: installCmd, dev: devCmd } = pmCommands[pm];
  const [installBin, ...installArgs] = installCmd.split(" ");
  const s2 = p.spinner();
  s2.start(`Running ${installCmd}...`);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(installBin, installArgs, {
        cwd: targetDir,
        stdio: "ignore",
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Exit code ${code}`));
      });
      child.on("error", reject);
    });
    s2.stop("Dependencies installed!");
  } catch {
    s2.stop("Install failed.");
    p.log.error(`Failed to install dependencies. Run "${installCmd}" manually.`);
    dropIntoProject();
  }

  // Initial commit
  if (initGit) {
    try {
      execSync("git add -A", { cwd: targetDir, stdio: "ignore" });
      execSync('git commit -m "Initial commit from camox init"', {
        cwd: targetDir,
        stdio: "ignore",
      });
      p.log.success("Created initial commit.");
    } catch {
      p.log.warn("Could not create initial commit.");
    }
  }

  // Start dev server
  p.outro(`Starting dev server...`);

  const [cmd, ...args] = devCmd.split(" ");
  const child = spawn(cmd, args, {
    cwd: targetDir,
    stdio: "inherit",
  });

  child.on("close", () => {
    dropIntoProject();
  });
}
