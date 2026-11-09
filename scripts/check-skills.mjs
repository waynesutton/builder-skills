#!/usr/bin/env node
// Lint for the skills in this repo. Run with `npm run check`.
// skills/manifest.json is the source of truth. This checks that every other
// list agrees with it, that frontmatter parses under strict YAML rules, line
// budgets, links into references/, banned words, and stale package names.

import { readdirSync, readFileSync, existsSync, lstatSync, readlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = join(root, "skills");

const HARD_LINE_LIMIT = 500; // Anthropic's guidance for SKILL.md
const SOFT_LINE_LIMIT = 300; // our own target
const STUB_LINE_LIMIT = 25; // retired redirect stubs stay tiny
const DESCRIPTION_MAX = 1024;

// Words that read like marketing copy or filler. Case insensitive, whole word.
const BANNED_WORDS = [
  "delve", "seamless", "seamlessly", "leverage", "robust", "comprehensive", "crucial",
  "cutting-edge", "game changer", "game-changer", "revolutionary", "supercharge", "unlock",
  "empower", "harness", "elevate", "navigate", "journey", "landscape", "tapestry", "testament",
  "furthermore", "moreover", "additionally", "utilize",
];
// Files that list banned words on purpose.
const BANNED_ALLOWLIST = new Set(["skills/write/references/watchlist.md"]);

const OLD_NAMES = ["convex-skills", "convexskills", "@waynesutton/convex-skills"];
// These document the rename or are the redirect package for the old name.
const OLD_NAME_ALLOWLIST = ["changelog.md", "prds/", "task.md", "MIGRATING.md", "scripts/", "plans/"];

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

const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf-8"));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---------- frontmatter ----------

// A plain (unquoted) YAML scalar breaks on ": " or " #", and cannot start with
// an indicator character. That is the bug behind issue #11: strict parsers
// (the skills CLI, PyYAML) skipped 10 of 17 skills. Quote the value instead.
function checkScalar(raw, file, key) {
  if (raw.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(raw)) fail(`${file}: ${key} has unbalanced double quotes`);
    return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (raw.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(raw)) fail(`${file}: ${key} has unbalanced single quotes`);
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[-?:,[\]{}#&*!|>%@`]/.test(raw)) fail(`${file}: ${key} starts with a YAML indicator. Quote it.`);
  if (raw.includes(": ") || raw.endsWith(":")) fail(`${file}: ${key} contains ": " unquoted. Wrap it in double quotes.`);
  if (raw.includes(" #")) fail(`${file}: ${key} contains " #" unquoted, which YAML reads as a comment. Quote it.`);
  return raw;
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
    const m = line.match(/^([a-z][\w-]*):\s?(.*)$/);
    if (!m) {
      fail(`${file}: bad frontmatter line "${line}" (one key: value per line)`);
      continue;
    }
    meta[m[1]] = checkScalar(m[2].trim(), file, m[1]);
  }
  return meta;
}

function scanBanned(content, file) {
  if (BANNED_ALLOWLIST.has(file)) return;
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`(^|[^a-z-])${word.replace(/[-]/g, "\\-")}([^a-z-]|$)`, "i");
    if (re.test(content)) warn(`${file}: uses banned word "${word}"`);
  }
  if (content.includes("\u2014")) fail(`${file}: contains an em dash`);
}

// Checks one SKILL.md folder. `kind` is "active", "stub", or "template".
function checkSkill(dir, name, rel, kind) {
  const file = `${rel}/SKILL.md`;
  const path = join(dir, "SKILL.md");
  if (!existsSync(path)) {
    fail(`${file}: missing`);
    return;
  }
  const content = readFileSync(path, "utf-8");
  const meta = parseFrontmatter(content, file);
  if (meta) {
    const keys = Object.keys(meta).sort().join(",");
    if (keys !== "description,name") fail(`${file}: frontmatter must be exactly name + description, got [${keys}]`);
    if (meta.name !== name) fail(`${file}: name "${meta.name}" does not match folder`);
    if (!meta.description) fail(`${file}: empty description`);
    if (meta.description?.length > DESCRIPTION_MAX) fail(`${file}: description over ${DESCRIPTION_MAX} chars`);
    if (meta.description && !/\buse (when|before|after|on)\b/i.test(meta.description)) {
      warn(`${file}: description has no "Use when" trigger`);
    }
  }

  const lines = content.split("\n").length;
  if (kind === "stub") {
    if (lines > STUB_LINE_LIMIT) fail(`${file}: retired stub is ${lines} lines, over ${STUB_LINE_LIMIT}`);
    if (existsSync(join(dir, "references"))) fail(`${rel}: retired stub still has references/`);
  } else if (lines > HARD_LINE_LIMIT) fail(`${file}: ${lines} lines, over ${HARD_LINE_LIMIT}`);
  else if (lines > SOFT_LINE_LIMIT) warn(`${file}: ${lines} lines, over soft limit ${SOFT_LINE_LIMIT}`);

  scanBanned(content, file);

  // Every references/ file SKILL.md links to must exist, and every file must be linked.
  const refDir = join(dir, "references");
  const linked = [...content.matchAll(/references\/([\w.-]+\.md)/g)].map((m) => m[1]);
  for (const ref of new Set(linked)) {
    if (!existsSync(join(refDir, ref))) fail(`${file}: links to missing references/${ref}`);
  }
  if (existsSync(refDir)) {
    for (const ref of readdirSync(refDir)) {
      if (!ref.endsWith(".md")) continue;
      if (!linked.includes(ref)) warn(`${file}: references/${ref} is never linked`);
      const refRel = `${rel}/references/${ref}`;
      const refContent = readFileSync(join(refDir, ref), "utf-8");
      scanBanned(refContent, refRel);
      // One level deep: a reference must not point at another reference.
      if (/\]\((?:\.\/)?[\w.-]+\.md[)#]|references\/[\w.-]+\.md/.test(refContent)) {
        fail(`${refRel}: links to another .md file (keep references one level deep)`);
      }
    }
  }

  if (kind !== "template" && !existsSync(join(dir, "agents", "openai.yaml"))) {
    warn(`${rel}: no agents/openai.yaml (Codex icon metadata)`);
  }
}

// ---------- 1. manifest vs skills/ ----------

const manifest = readJson("skills/manifest.json");
const groupIds = new Set(manifest.groups.map((g) => g.id));
const active = manifest.skills.map((s) => s.name);
const stubs = manifest.retired.filter((r) => r.stub).map((r) => r.name);
const gone = manifest.retired.filter((r) => !r.stub).map((r) => r.name);
const folders = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const s of manifest.skills) {
  if (!groupIds.has(s.group)) fail(`manifest: ${s.name} has unknown group "${s.group}"`);
  if (!s.summary) fail(`manifest: ${s.name} has no summary`);
}
for (const r of manifest.retired) {
  if (!r.replacement?.length) fail(`manifest: retired ${r.name} has no replacement`);
  for (const rep of r.replacement) {
    if (active.includes(rep)) continue;
    if (!/^convex(-[a-z-]+)?$/.test(rep)) fail(`manifest: retired ${r.name} points at unknown skill "${rep}"`);
  }
  if (active.includes(r.name)) fail(`manifest: ${r.name} is both active and retired`);
}
if (!same(folders, [...active, ...stubs])) {
  fail(`skills/ folders do not match manifest active + stub skills\n  folders:  ${folders.sort()}\n  manifest: ${[...active, ...stubs].sort()}`);
}
for (const name of gone) if (folders.includes(name)) fail(`skills/${name}: retired without a stub, delete the folder`);

for (const name of active) if (folders.includes(name)) checkSkill(join(skillsDir, name), name, `skills/${name}`, "active");
for (const name of stubs) if (folders.includes(name)) checkSkill(join(skillsDir, name), name, `skills/${name}`, "stub");

// ---------- 2. every other list agrees with the manifest ----------

const pluginSkills = readJson(".claude-plugin/plugin.json").skills.map((s) => s.replace("./skills/", ""));
if (!same(pluginSkills, [...active, ...stubs])) fail(".claude-plugin/plugin.json skills must be active + stub skills");

const codexDir = join(root, ".codex", "skills");
const codexLinks = existsSync(codexDir) ? readdirSync(codexDir) : [];
if (!same(codexLinks, active)) fail(`.codex/skills/ symlinks must match active skills\n  have: ${codexLinks.sort()}`);
for (const l of codexLinks) {
  const p = join(codexDir, l);
  if (!lstatSync(p).isSymbolicLink()) fail(`.codex/skills/${l}: not a symlink`);
  else if (readlinkSync(p) !== `../../skills/${l}`) fail(`.codex/skills/${l}: should point at ../../skills/${l}`);
}

const readme = readFileSync(join(root, "README.md"), "utf-8");
for (const name of active) {
  if (!readme.includes(`(skills/${name}/SKILL.md)`)) fail(`README.md: skill table has no link for ${name}`);
}
for (const r of manifest.retired) {
  if (!readme.includes(`\`${r.name}\``)) fail(`README.md: moved table does not mention ${r.name}`);
}

const skillsSh = readJson("skills.sh.json");
const grouped = skillsSh.groupings.flatMap((g) => g.skills);
for (const name of [...active, ...stubs]) {
  if (!grouped.includes(name)) fail(`skills.sh.json: ${name} is in no group`);
}
for (const name of grouped) {
  if (![...active, ...stubs].includes(name)) fail(`skills.sh.json: ${name} is not a skill folder`);
}

// Versions agree, and the alias package depends on the current major.
const pkg = readJson("package.json");
const pluginVersion = readJson(".claude-plugin/plugin.json").version;
const market = readJson(".claude-plugin/marketplace.json");
for (const [where, v] of [
  ["plugin.json", pluginVersion],
  ["marketplace.json metadata", market.metadata.version],
  ["marketplace.json plugin", market.plugins[0].version],
]) {
  if (v !== pkg.version) fail(`${where} version ${v} does not match package.json ${pkg.version}`);
}
const aliasPath = "packages/builder-skills/package.json";
if (existsSync(join(root, aliasPath))) {
  const alias = readJson(aliasPath);
  const range = alias.dependencies?.["@waynesutton/builder-skills"];
  const major = pkg.version.split(".")[0];
  if (range !== `^${major}.0.0`) fail(`${aliasPath}: depends on ${range}, expected ^${major}.0.0`);
  if (alias.version !== pkg.version) warn(`${aliasPath}: version ${alias.version} differs from ${pkg.version}`);
}

// Templates the CLI init command copies must exist.
const cli = readFileSync(join(root, "bin/cli.js"), "utf-8");
const startersBlock = cli.match(/const STARTERS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
if (!startersBlock) fail("bin/cli.js: STARTERS list not found");
for (const [, src] of startersBlock.matchAll(/\["([^"]+)", "[^"]+"\]/g)) {
  if (!existsSync(join(root, "templates", src))) fail(`bin/cli.js STARTERS: templates/${src} is missing`);
}

// ---------- 3. stale references to the old name ----------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".claude", ".cursor", ".opencode", ".agents", ".codex"].includes(entry.name)) continue;
      walk(full, out);
    } else if (/\.(md|json|js|mjs|cjs|yaml|yml)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

for (const file of walk(root)) {
  const rel = file.slice(root.length + 1);
  if (OLD_NAME_ALLOWLIST.some((a) => rel.startsWith(a))) continue;
  const content = readFileSync(file, "utf-8");
  for (const old of OLD_NAMES) {
    if (content.includes(old)) fail(`${rel}: still references "${old}"`);
  }
}

console.log(`\n${active.length} active skills, ${stubs.length} retired stubs checked. ${errors} errors, ${warnings} warnings.`);
process.exit(errors ? 1 : 0);
