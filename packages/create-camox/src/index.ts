import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as p from "@clack/prompts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function copyDir(src: string, dest: string, replacements: Record<string, string>) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
      continue;
    }

    let content = fs.readFileSync(srcPath, "utf-8");
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replaceAll(key, value);
    }
    fs.writeFileSync(destPath, content);
  }
}

async function main() {
  p.intro("create-camox");

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
    {
      onCancel: () => {
        p.cancel("Cancelled.");
        process.exit(0);
      },
    },
  );

  const targetDir = path.resolve(result.path);

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    p.cancel(`Directory ${targetDir} is not empty.`);
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Scaffolding project...");

  const templateDir = path.resolve(__dirname, "..", "template");
  copyDir(templateDir, targetDir, {
    "{{projectName}}": result.name,
    "{{projectSlug}}": result.slug,
  });

  s.stop("Project scaffolded!");

  p.note([`cd ${result.path}`, "pnpm install", "pnpm dev"].join("\n"), "Next steps");

  p.outro("Happy building!");
}

main().catch(console.error);
