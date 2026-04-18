import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";
import { object } from "@optique/core/constructs";
import { command, constant } from "@optique/core/primitives";
import slugify from "slugify";

import {
  type Organization,
  checkSlugAvailability,
  createOrganization,
  createProject,
  listOrganizations,
  setActiveOrganization,
} from "../lib/api";
import { getOrAuthenticate, readAuthToken } from "../lib/auth";
import { type PackageManager, copyDir, pmCommands } from "../lib/utils";

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

  const orgSlug = slugify(orgName, { lower: true, strict: true });
  const org = await createOrganization(token, orgName, orgSlug);
  p.log.success(`Created organization: ${org.name}`);
  return org.id;
}

export async function init() {
  p.intro(`Camox v${ownPkg.version}`);
  const stored = readAuthToken();
  if (stored) {
    p.log.info(`Welcome back, ${stored.name}!`);
  }
  p.log.info("Let's create your Camox application.");

  // Project name
  const name = await p.text({
    message: "Project display name",
    placeholder: "My Website",
    validate: (value) => {
      if (!value.trim()) return "Project name is required";
    },
  });
  if (p.isCancel(name)) return onCancel();

  // Authenticate with camox.ai
  const auth = await getOrAuthenticate();

  // Organization selection
  const orgId = await selectOrCreateOrganization(auth.token);

  // Project slug (user-defined, validated for availability)
  let projectSlug: string;
  while (true) {
    const slugInput = await p.text({
      message: "Project slug",
      initialValue: slugify(name, { lower: true, strict: true }) || "my-site",
      validate: (value) => {
        if (!value.trim()) return "Slug is required";
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
          return "Slug must be lowercase alphanumeric with hyphens";
        }
      },
    });
    if (p.isCancel(slugInput)) return onCancel();

    const s = p.spinner();
    s.start("Checking slug availability...");
    const { available } = await checkSlugAvailability(auth.token, slugInput);
    if (available) {
      s.stop("Slug is available!");
      projectSlug = slugInput;
      break;
    }
    s.stop(`Slug "${slugInput}" is already taken. Please choose another.`);
  }

  // Project path (pre-filled from slug, validated for emptiness)
  const projectPath = await p.text({
    message: "Project path",
    initialValue: `./${projectSlug}`,
    validate: (value) => {
      if (!value.trim()) return "Path is required";
      const resolved = path.resolve(value);
      if (fs.existsSync(resolved) && fs.readdirSync(resolved).length > 0) {
        return "Directory is not empty";
      }
    },
  });
  if (p.isCancel(projectPath)) return onCancel();

  const resolvedPath = projectPath as string;
  const targetDir = path.resolve(resolvedPath);

  // Create project on API
  const s0 = p.spinner();
  s0.start("Creating project...");
  let project: { slug: string; syncSecret: string };
  try {
    project = await createProject(auth.token, name, projectSlug, orgId);
    s0.stop(`Project created with slug: ${project.slug}`);
  } catch (err) {
    s0.stop("Failed to create project.");
    p.log.error(err instanceof Error ? err.message : "Unknown error");
    process.exit(1);
  }

  // Package manager
  const selected = await p.select({
    message: "Which package manager?",
    options: [
      { value: "pnpm" as const, label: "pnpm (recommended)" },
      { value: "bun" as const, label: "bun" },
      { value: "npm" as const, label: "npm" },
      { value: "yarn" as const, label: "yarn" },
    ],
  });
  if (p.isCancel(selected)) return onCancel();
  const pm: PackageManager = selected;

  // Scaffold
  const s = p.spinner();
  s.start("Scaffolding project...");

  const templateDir = path.resolve(__dirname, "..", "template");
  copyDir(templateDir, targetDir, {
    "{{projectName}}": name,
    "{{projectSlug}}": project.slug,
    "{{camoxVersion}}": ownPkg.version,
  });

  // .env and .gitignore can't live in the template dir:
  // - .gitignore is stripped by npm when publishing
  // - .env is ignored by the .gitignore
  fs.writeFileSync(path.join(targetDir, ".env"), `CAMOX_SYNC_SECRET=${project.syncSecret}\n`);
  fs.writeFileSync(
    path.join(targetDir, ".gitignore"),
    `node_modules
.DS_Store
dist
dist-ssr
*.local
count.txt
.env
.nitro
.tanstack
.output
.vinxi
node_modules

# Auto generated by Camox
src/camox/app.ts
src/routes/_camox.tsx
src/routes/_camox/

# Auto generated by Tanstack Router
src/routeTree.gen.ts
`,
  );

  s.stop("Project scaffolded!");

  function dropIntoProject(): never {
    const shell = process.env.SHELL || "/bin/bash";
    p.log.info(`Dropping you into ${resolvedPath}`);
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

  // Ignore SIGINT in the parent so only the dev server handles Ctrl+C.
  // Without this, pnpm reports ELIFECYCLE when the parent dies from the signal.
  process.on("SIGINT", () => {});

  const child = spawn(cmd, args, {
    cwd: targetDir,
    stdio: "inherit",
  });

  child.on("close", () => {
    dropIntoProject();
  });
}
