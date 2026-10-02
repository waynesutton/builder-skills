import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, readdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Path to the skills directory.
 */
export function getSkillsPath() {
  return join(__dirname, "skills");
}

/**
 * Path to the templates directory.
 */
export function getTemplatesPath() {
  return join(__dirname, "templates");
}

/**
 * Names of every skill folder that ships in the package.
 */
export function listSkills() {
  return readdirSync(getSkillsPath(), { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

/**
 * Path to a skill's SKILL.md.
 */
export function getSkillPath(skillName) {
  return join(getSkillsPath(), skillName, "SKILL.md");
}

/**
 * Path to a skill's folder (SKILL.md plus references/ and agents/).
 */
export function getSkillDir(skillName) {
  return join(getSkillsPath(), skillName);
}

/**
 * Raw SKILL.md content for a skill.
 */
export function getSkill(skillName) {
  const skillPath = getSkillPath(skillName);
  if (!existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillName}`);
  }
  return readFileSync(skillPath, "utf-8");
}

// A double quoted YAML value: drop the quotes and resolve \" and \\.
function unquote(value) {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

/**
 * Parse the name and description out of a SKILL.md frontmatter block.
 */
export function getSkillMeta(skillName) {
  const content = getSkill(skillName);
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { name: skillName, description: "" };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = unquote(line.slice(idx + 1).trim());
  }
  return { name: meta.name ?? skillName, description: meta.description ?? "" };
}

/**
 * One line summaries. Keep in sync with bin/cli.js and .claude-plugin/plugin.json.
 */
export const SKILLS = {
  convex: "Router for Convex work when no specific skill fits",
  "convex-best-practices": "Production patterns and the ESLint plugin rules",
  "convex-functions": "Queries, mutations, actions, internal functions",
  "convex-schema-validator": "Schema design, validators, indexes",
  "convex-realtime": "Reactive queries, optimistic updates, presence",
  "convex-http-actions": "HTTP endpoints, webhooks, CORS, auth headers",
  "convex-file-storage": "Upload, serve, and delete files",
  "convex-cron-jobs": "Cron jobs and scheduled functions",
  "convex-migrations": "Schema evolution and data backfills",
  "convex-agents": "AI agents with the Convex agent component",
  "convex-component-authoring": "Author and publish Convex components",
  "convex-security-check": "Ten minute security checklist",
  "convex-security-audit": "Deep security review before launch",
  "avoid-feature-creep": "Keep scope tight, ship what was asked",
  "project-workflow": "PRD first, task.md tracking, lessons loop",
  "project-docs": "Sync task.md, changelog.md, files.md from git evidence",
  "git-safety": "Block destructive git commands, diff before discard",
};

export default {
  getSkillsPath,
  getTemplatesPath,
  listSkills,
  getSkill,
  getSkillPath,
  getSkillDir,
  getSkillMeta,
  SKILLS,
};
