import fs from "node:fs";
import path from "node:path";

export function createAgentSkillLinks(targetDir: string) {
  const agentsSkillsDir = path.join(targetDir, ".agents", "skills");
  const claudeSkillsDir = path.join(targetDir, ".claude", "skills");
  fs.mkdirSync(agentsSkillsDir, { recursive: true });
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  fs.symlinkSync("../../node_modules/camox/skills/camox", path.join(agentsSkillsDir, "camox"));
  fs.symlinkSync("../../.agents/skills/camox", path.join(claudeSkillsDir, "camox"));
}
