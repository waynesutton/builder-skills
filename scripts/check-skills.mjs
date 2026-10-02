#!/usr/bin/env node
// Lint for the skills in this repo. Run with `npm run check`.
// Checks frontmatter shape, name/folder match, line budgets, banned words,
// stale references to the old package name, and that every skill list agrees.

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");

const HARD_LINE_LIMIT = 500; // Anthropic's guidance for SKILL.md
const SOFT_LINE_LIMIT = 300; // our own target
const DESCRIPTION_MAX = 1024;

// Words that read like marketing copy or filler. Case insensitive, whole word.
const BANNED_WORDS = [
  "delve",
  "seamless",
  "seamlessly",
  "leverage",
  "robust",
  "comprehensive",
  "crucial",
  "cutting-edge",
  "game changer",
  "game-changer",
  "revolutionary",
  "supercharge",
  "unlock",
  "empower",
  "harness",
  "elevate",
  "navigate",
  "journey",
  "landscape",
  "tapestry",
  "testament",
  "furthermore",
  "moreover",
  "additionally",
  "utilize",
];

const OLD_NAMES = ["convex-skills", "convexskills", "@waynesutton/convex-skills"];
// The changelog and PRDs are allowed to talk about the old name; they document the rename.
// changelog and PRDs document the rename; task.md holds the npm deprecate step
const OLD_NAME_ALLOWLIST = new Set(["changelog.md", "prds/", "task.md"]);

let errors = 0;
let warnings = 0;
const fail = (msg) => {
  errors += 1;
  console.error(`ERROR  ${msg}`);
};
const warn = (msg) => {
  warnings += 1;
  console.warn(`WARN   ${msg}`);
};

// A double quoted YAML value: drop the quotes and resolve \" and \\.
function unquote(value) {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

function parseFrontmatter(content, file) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${file}: missing frontmatter block`);
    return null;
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) {
      fail(`${file}: bad frontmatter line "${line}"`);
      continue;
    }
    meta[line.slice(0, idx).trim()] = unquote(line.slice(idx + 1).trim());
  }
  return meta;
}

function scanBanned(content, file) {
  const lower = content.toLowerCase();
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`(^|[^a-z-])${word.replace(/[-]/g, "\\-")}([^a-z-]|$)`, "i");
    if (re.test(lower)) warn(`${file}: uses banned word "${word}"`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".claude", ".cursor", ".opencode", ".agents", ".codex"].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(md|json|js|mjs|yaml|yml)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// 1. Skill folders
const skillFolders = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const name of skillFolders) {
  const file = `skills/${name}/SKILL.md`;
  const path = join(skillsDir, name, "SKILL.md");
  if (!existsSync(path)) {
    fail(`${file}: missing`);
    continue;
  }
  const content = readFileSync(path, "utf-8");
  const meta = parseFrontmatter(content, file);
  if (meta) {
    const keys = Object.keys(meta).sort().join(",");
    if (keys !== "description,name") {
      fail(`${file}: frontmatter must be exactly name + description, got [${keys}]`);
    }
    if (meta.name !== name) fail(`${file}: name "${meta.name}" does not match folder`);
    if (!meta.description) fail(`${file}: empty description`);
    if (meta.description && meta.description.length > DESCRIPTION_MAX) {
      fail(`${file}: description over ${DESCRIPTION_MAX} chars`);
    }
    if (meta.description && !/\buse (when|before|after)\b/i.test(meta.description)) {
      warn(`${file}: description has no "Use when" trigger`);
    }
  }
  const lines = content.split("\n").length;
  if (lines > HARD_LINE_LIMIT) fail(`${file}: ${lines} lines, over ${HARD_LINE_LIMIT}`);
  else if (lines > SOFT_LINE_LIMIT) warn(`${file}: ${lines} lines, over soft limit ${SOFT_LINE_LIMIT}`);

  scanBanned(content, file);

  // references/ files that SKILL.md links to must exist
  const refDir = join(skillsDir, name, "references");
  const linked = [...content.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]);
  for (const ref of new Set(linked)) {
    if (!existsSync(join(refDir, ref))) fail(`${file}: links to missing references/${ref}`);
  }
  if (existsSync(refDir)) {
    for (const ref of readdirSync(refDir)) {
      if (ref.endsWith(".md") && !linked.includes(ref)) warn(`${file}: references/${ref} is never linked`);
      if (!ref.endsWith(".md")) continue;
      const refPath = `skills/${name}/references/${ref}`;
      const refContent = readFileSync(join(refDir, ref), "utf-8");
      scanBanned(refContent, refPath);
      // one level deep only: a reference must not point at another reference
      if (/\]\((?:\.\/)?[\w.-]+\.md\)|references\/[\w.-]+\.md/.test(refContent)) {
        fail(`${refPath}: links to another references/ file (keep references one level deep)`);
      }
    }
  }
}

// 2. Skill lists agree
function listFrom(file, regex) {
  const content = readFileSync(join(root, file), "utf-8");
  return [...content.matchAll(regex)].map((m) => m[1]).sort();
}
const cliList = listFrom("bin/cli.js", /^\s+"?([a-z0-9-]+)"?:\s+"/gm);
const indexList = listFrom("index.js", /^\s+"?([a-z0-9-]+)"?:\s+"/gm);
const pluginList = JSON.parse(readFileSync(join(root, ".claude-plugin/plugin.json"), "utf-8"))
  .skills.map((s) => s.replace("./skills/", ""))
  .sort();

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
if (!same(cliList, skillFolders)) fail(`bin/cli.js SKILLS map does not match skills/ folders\n  cli: ${cliList}\n  dir: ${skillFolders}`);
if (!same(indexList, skillFolders)) fail(`index.js SKILLS map does not match skills/ folders`);
if (!same(pluginList, skillFolders)) fail(`.claude-plugin/plugin.json skills does not match skills/ folders`);

// 3. Stale references to the old name
for (const file of walk(root)) {
  const rel = file.slice(root.length + 1);
  if ([...OLD_NAME_ALLOWLIST].some((a) => rel.startsWith(a))) continue;
  if (rel.startsWith("scripts/")) continue;
  const content = readFileSync(file, "utf-8");
  for (const old of OLD_NAMES) {
    if (content.includes(old)) fail(`${rel}: still references "${old}"`);
  }
}

console.log(`\n${skillFolders.length} skills checked. ${errors} errors, ${warnings} warnings.`);
process.exit(errors ? 1 : 0);
