import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync } from "fs";

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
 * skills/manifest.json: groups, active skills, retired skills. The one list
 * the CLI, this module, and the lint all read.
 */
export const MANIFEST = JSON.parse(readFileSync(join(getSkillsPath(), "manifest.json"), "utf-8"));

export const GROUPS = MANIFEST.groups;

/**
 * One line summaries for every active skill, keyed by name.
 */
export const SKILLS = Object.fromEntries(MANIFEST.skills.map((s) => [s.name, s.summary]));

/**
 * Names of the active skills, in manifest order.
 */
export function listSkills() {
  return MANIFEST.skills.map((s) => s.name);
}

/**
 * Retired skills and what replaced them. Stubs still ship as folders for one
 * release so `npx skills update` delivers the redirect.
 */
export function listRetired() {
  return MANIFEST.retired.map((r) => ({ ...r }));
}

/**
 * Path to a skill's SKILL.md.
 */
export function getSkillPath(skillName) {
  return join(getSkillsPath(), skillName, "SKILL.md");
}

/**
 * Path to a skill's folder (SKILL.md plus references/, scripts/, agents/).
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

// A quoted YAML scalar: drop the quotes and resolve escapes.
function unquote(value) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
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

export default {
  getSkillsPath,
  getTemplatesPath,
  listSkills,
  listRetired,
  getSkill,
  getSkillPath,
  getSkillDir,
  getSkillMeta,
  SKILLS,
  GROUPS,
  MANIFEST,
};
