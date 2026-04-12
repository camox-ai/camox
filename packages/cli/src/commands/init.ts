import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";
import { object } from "@optique/core/constructs";
import { command, constant } from "@optique/core/primitives";

import {
  type Organization,
  createOrganization,
  createProject,
  listOrganizations,
  setActiveOrganization,
} from "../lib/api";
import { getOrAuthenticate } from "../lib/auth";
import {
  type PackageManager,
  copyDir,
  detectPackageManager,
  pmCommands,
  slugify,
} from "../lib/utils";

export const parser = command(
  "init",
  object({
    command: constant("init"),
  }),
);

export const handler = init;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ownPkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));

function onCancel() {
  p.cancel("Cancelled.");
  process.exit(0);
}

const CREATE_NEW_ORG = "__create_new__" as const;

async function selectOrCreateOrganization(token: string): Promise<string> {
  const orgs = await listOrganizations(token);

  if (orgs.length === 0) {
    // No orgs — prompt to create one
    p.log.info("You don't have any organizations yet. Let's create one.");
    return promptCreateOrganization(token);
  }

  // Has orgs — let user pick or create new
  const selected = await p.select({
    message: "Select an organization for your new project",
    options: [
      ...orgs.map((org: Organization) => ({ value: org.id, label: `${org.name} (${org.slug})` })),
      { value: CREATE_NEW_ORG, label: "Create a new organization" },
    ],
  });
  if (p.isCancel(selected)) return onCancel() as never;

  if (selected === CREATE_NEW_ORG) {
    return promptCreateOrganization(token);
  }

  // Set active org and return id
  const org = orgs.find((o: Organization) => o.id === selected)!;
  await setActiveOrganization(token, org.id);
  return org.id;
}

async function promptCreateOrganization(token: string): Promise<string> {
  const orgName = await p.text({
    message: "Organization name",
    placeholder: "My Company",
    validate: (value) => {
      if (!value.trim()) return "Organization name is required";
    },
  });
  if (p.isCancel(orgName)) return onCancel() as never;

  const orgSlug = slugify(orgName);
  const org = await createOrganization(token, orgName, orgSlug);
  p.log.success(`Created organization: ${org.name}`);
  return org.id;
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
      path: ({ results }) =>
        p.text({
          message: "Project path",
          initialValue: `./${slugify(results.name ?? "") || "my-site"}`,
          validate: (value) => {
            if (!value.trim()) return "Path is required";
          },
        }),
    },
    { onCancel },
  );

  const targetDir = path.resolve(result.path as string);

  // Authenticate with camox.ai
  const auth = await getOrAuthenticate();

  // Organization selection
  const orgId = await selectOrCreateOrganization(auth.token);

  // Create project on API
  const s0 = p.spinner();
  s0.start("Creating project...");
  let project: { slug: string; syncSecret: string };
  try {
    project = await createProject(auth.token, result.name as string, orgId);
    s0.stop(`Project created with slug: ${project.slug}`);
  } catch (err) {
    s0.stop("Failed to create project.");
    p.log.error(err instanceof Error ? err.message : "Unknown error");
    process.exit(1);
  }

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    p.cancel(`Directory ${targetDir} is not empty.`);
    process.exit(1);
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
    "{{projectSlug}}": project.slug,
    "{{syncSecret}}": project.syncSecret,
    "{{camoxVersion}}": ownPkg.version,
  });

  s.stop("Project scaffolded!");

  function dropIntoProject(): never {
    const shell = process.env.SHELL || "/bin/bash";
    p.log.info(`Dropping you into ${result.path}`);
    spawnSync(shell, [], { cwd: targetDir, stdio: "inherit" });
    process.exit(0);
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
