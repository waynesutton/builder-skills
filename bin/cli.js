#!/usr/bin/env node

// builder-skills CLI. Zero dependencies. Run with no arguments in a terminal for
// the picker, or use a command (add, list, update, start, init) from scripts and agents.

import { fileURLToPath } from "url";
import { dirname, join, resolve, relative } from "path";
import {
  readFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  readdirSync,
  symlinkSync,
  cpSync,
  lstatSync,
} from "fs";
import { createInterface } from "readline/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");
const skillsRoot = join(packageRoot, "skills");

const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf-8"));
const MANIFEST = JSON.parse(readFileSync(join(skillsRoot, "manifest.json"), "utf-8"));
const ACTIVE = MANIFEST.skills;
const ACTIVE_NAMES = new Set(ACTIVE.map((s) => s.name));
const RETIRED = new Map(MANIFEST.retired.map((r) => [r.name, r]));

// Install targets. `dir` is relative to the project directory.
const TARGETS = [
  { id: "claude", label: "Claude Code", dir: ".claude/skills" },
  { id: "codex", label: "Codex", dir: ".codex/skills" },
  { id: "cursor", label: "Cursor", dir: ".cursor/skills" },
  { id: "opencode", label: "OpenCode", dir: ".opencode/skills" },
  { id: "agents", label: "Any agent (.agents)", dir: ".agents/skills" },
];

// Project starters copied by `init`. [source in templates/, destination in the project]
const STARTERS = [
  ["AGENTS.md", "AGENTS.md"],
  ["files.md", "files.md"],
  ["changelog.md", "changelog.md"],
  ["task.md", "task.md"],
  ["SECURITY.md", "SECURITY.md"],
  ["prds/lessons.md", "prds/lessons.md"],
  ["prds/what-i-need-from-you.md", "prds/what-i-need-from-you.md"],
];

const SETUP_URL = "https://www.convex.dev/agent-setup.md";

// ---------- output helpers ----------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const bold = (s) => (useColor ? `\x1b[1m${s}\x1b[22m` : s);
const dim = (s) => (useColor ? `\x1b[2m${s}\x1b[22m` : s);

// A target folder shown relative to the project, or absolute when it sits outside.
function label(dir) {
  const rel = relative(flags.dir, dir);
  return rel && !rel.startsWith("..") ? rel : dir;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

// How to get a retired skill's replacement, one line per replacement.
function replacementLines(name) {
  const entry = RETIRED.get(name);
  if (!entry) return [];
  return entry.replacement.map((r) =>
    ACTIVE_NAMES.has(r)
      ? `  ${r} (builder-skills): npx builder-skills add ${r}`
      : `  ${r} (official Convex): npx skills add convex/agent-skills --skill ${r}`,
  );
}

function printRetired(name) {
  console.error(`${name} was retired in builder-skills 3.0. Use instead:`);
  replacementLines(name).forEach((l) => console.error(l));
}

// ---------- help, list, start ----------

function printHelp() {
  console.log(`
${bold("builder-skills")} ${pkg.version}
Workflow, security, and writing skills for builders shipping Convex apps.

USAGE
  npx builder-skills                  pick skills and agents interactively
  npx builder-skills <command> [options]

COMMANDS
  add <skill...>       install skills (alias: install)
  add --all            install every skill (alias: install-all)
  list                 list skills by group (--json for agents)
  show <skill>         print a skill's SKILL.md (alias: get)
  path <skill>         print the path to a skill's SKILL.md
  update [skill...]    refresh installed skills (skips dev unless named or --force)
  start                print a short router an agent can follow
  init                 add AGENTS.md, task.md, changelog.md, files.md, SECURITY.md,
                       prds/ starters. Never overwrites (alias: install-templates)

OPTIONS
  --target <list>      claude, codex, cursor, opencode, agents, or a path.
                       Comma separated for several: --target claude,codex
                       Default: the agent folders found in --dir, else claude
  --dir <path>         project directory (default: current directory)
  --link               symlink instead of copy (use from a git clone; npx cache paths go away)
  --force              overwrite dev on update or add
  --yes, -y            skip prompts and use defaults
  --version, -v        print the version

EXAMPLES
  npx builder-skills add workflow create-prd update-project-docs
  npx builder-skills add --all --target claude,codex
  npx builder-skills add sec-check --target cursor
  npx builder-skills list --json
  npx builder-skills init

Convex APIs come from the official Convex skills. Tell your agent:
  Read ${SETUP_URL} and follow it.
`);
}

function listCommand(asJson) {
  if (asJson) {
    const out = {
      version: pkg.version,
      groups: MANIFEST.groups.map((g) => ({
        ...g,
        skills: ACTIVE.filter((s) => s.group === g.id).map((s) => ({
          name: s.name,
          summary: s.summary,
          editable: Boolean(s.editable),
        })),
      })),
      retired: MANIFEST.retired.map((r) => ({ name: r.name, replacement: r.replacement })),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  console.log("");
  let n = 0;
  for (const g of MANIFEST.groups) {
    console.log(bold(g.title) + "  " + dim(g.description));
    for (const s of ACTIVE.filter((x) => x.group === g.id)) {
      n += 1;
      console.log(`  ${String(n).padStart(2)}  ${s.name.padEnd(22)} ${s.summary}`);
    }
    console.log("");
  }
  console.log(dim(`Retired in 3.0: ${MANIFEST.retired.map((r) => r.name).join(", ")}`));
  console.log(dim("Run 'npx builder-skills add <retired-name>' to see its replacement.\n"));
}

function startCommand(projectDir) {
  const installed = new Set();
  for (const t of TARGETS) {
    const d = join(projectDir, t.dir);
    if (!existsSync(d)) continue;
    for (const name of ACTIVE_NAMES) if (existsSync(join(d, name, "SKILL.md"))) installed.add(name);
  }
  const rows = [
    ["Plan or track multi step work", "workflow"],
    ["Write a PRD before building", "create-prd"],
    ["Sync task.md, changelog.md, files.md after a change", "update-project-docs"],
    ["Any git command that could discard work", "git-safety"],
    ["Scope is drifting past the request", "avoid-feature-creep"],
    ["Blocked on the user, or ending a turn", "what-i-need-from-you"],
    ["A bug, a failed fix, or a vague request", "think-first"],
    ["Writing app code in this house style", "dev"],
    ["Auditing status fields, skipped steps, or double run moves", "state-machines"],
    ["Before deploy, a public repo, or after AI generated code", "sec-check"],
    ["Posts, docs, READMEs, emails, commit messages", "write"],
  ];
  console.log(`builder-skills router (${pkg.version})

Pick the smallest skill that fits the task, load its SKILL.md, and follow it.
`);
  for (const [task, skill] of rows) {
    const mark = installed.size === 0 ? "" : installed.has(skill) ? "  [installed]" : "  [not installed]";
    console.log(`- ${task}: ${skill}${mark}`);
  }
  console.log(`
Convex APIs (functions, schema, auth, crons, migrations, components, agents):
use the official Convex skills and convex/_generated/ai/guidelines.md.
Not set up yet? Read ${SETUP_URL} and follow it.

Missing a skill above? npx builder-skills add <name>`);
}

// ---------- install ----------

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function resolveTargets(projectDir, targetArg) {
  if (targetArg) {
    return targetArg
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const known = TARGETS.find((x) => x.id === t);
        if (known) return join(projectDir, known.dir);
        const p = resolve(projectDir, t);
        return p.endsWith("skills") ? p : join(p, "skills");
      });
  }
  const found = detectTargets(projectDir);
  return (found.length ? found : [TARGETS[0]]).map((t) => join(projectDir, t.dir));
}

// Agent folders that already exist in the project (.claude, .codex, ...).
function detectTargets(projectDir) {
  return TARGETS.filter((t) => existsSync(join(projectDir, t.dir.split("/")[0])));
}

function installSkill(name, targetSkillsDir, { link, force }) {
  const source = join(skillsRoot, name);
  const dest = join(targetSkillsDir, name);
  const entry = ACTIVE.find((s) => s.name === name);
  ensureDir(targetSkillsDir);

  if (entry?.editable && existsSync(dest) && !force) {
    console.log(`  skip    ${name} ${dim("(already there and meant to be edited; --force to replace)")}`);
    return false;
  }
  if (link) {
    if (existsSync(dest)) {
      console.log(`  skip    ${name} ${dim("(already exists)")}`);
      return false;
    }
    symlinkSync(source, dest, "dir");
    console.log(`  linked  ${name}`);
    return true;
  }
  if (existsSync(dest) && lstatSync(dest).isSymbolicLink()) {
    console.log(`  skip    ${name} ${dim("(symlinked, already current)")}`);
    return false;
  }
  const existed = existsSync(dest);
  cpSync(source, dest, { recursive: true, force: true });
  console.log(`  ${existed ? "updated" : "added  "} ${name}`);
  return true;
}

function installMany(names, targetDirs, opts) {
  const bad = [];
  const good = [];
  for (const name of names) {
    if (ACTIVE_NAMES.has(name)) good.push(name);
    else bad.push(name);
  }
  for (const dir of targetDirs) {
    if (good.length === 0) break;
    console.log(`\n${bold(label(dir))}`);
    good.forEach((name) => installSkill(name, dir, opts));
  }
  for (const name of bad) {
    console.log("");
    if (RETIRED.has(name)) printRetired(name);
    else fail(`unknown skill "${name}". Run 'npx builder-skills list'.`);
  }
  if (bad.length) process.exitCode = 1;
  return good.length;
}

function updateCommand(names, targetDirs, opts) {
  const only = new Set(names);
  let refreshed = 0;
  for (const dir of targetDirs) {
    if (!existsSync(dir)) continue;
    const present = readdirSync(dir, { withFileTypes: true }).map((d) => d.name);
    const ours = present.filter((n) => ACTIVE_NAMES.has(n) && (only.size === 0 || only.has(n)));
    const retired = present.filter((n) => RETIRED.has(n));
    if (ours.length === 0 && retired.length === 0) continue;
    console.log(`\n${bold(label(dir))}`);
    for (const name of ours) {
      const entry = ACTIVE.find((s) => s.name === name);
      const force = opts.force || only.has(name);
      if (entry.editable && !force) {
        console.log(`  skip    ${name} ${dim("(edited house style; name it or pass --force)")}`);
        continue;
      }
      if (installSkill(name, dir, { link: false, force })) refreshed += 1;
    }
    for (const name of retired) {
      console.log(`  retired ${name}. Replace it, then delete ${join(label(dir), name)}:`);
      replacementLines(name).forEach((l) => console.log(`  ${l}`));
    }
  }
  if (refreshed === 0) console.log("\nNothing to update. Install skills first: npx builder-skills add --all");
  else console.log(`\nUpdated ${refreshed} skill folder(s).`);
}

function copyIfMissing(src, dest, label) {
  if (!existsSync(src)) return;
  if (existsSync(dest)) {
    console.log(`  skip    ${label} ${dim("(already exists)")}`);
    return;
  }
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`  added   ${label}`);
}

function initCommand(projectDir) {
  const templatesDir = join(packageRoot, "templates");
  console.log(`\n${bold("Project starters")}`);
  for (const [src, dest] of STARTERS) copyIfMissing(join(templatesDir, src), join(projectDir, dest), dest);

  // CLAUDE.md points at AGENTS.md so both tools read one file.
  const claudePath = join(projectDir, "CLAUDE.md");
  if (existsSync(claudePath)) {
    console.log(`  skip    CLAUDE.md ${dim("(already exists)")}`);
  } else {
    try {
      symlinkSync("AGENTS.md", claudePath);
      console.log("  linked  CLAUDE.md -> AGENTS.md");
    } catch {
      copyIfMissing(join(templatesDir, "AGENTS.md"), claudePath, "CLAUDE.md");
    }
  }
}

// ---------- interactive picker ----------

// "1,3,5-7" -> [1,3,5,6,7]. Returns null on bad input.
function parsePicks(input, max) {
  const out = new Set();
  for (const part of input.split(/[\s,]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > max || a > b) return null;
    for (let i = a; i <= b; i += 1) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

async function ask(rl, question, max, fallback) {
  for (;;) {
    const answer = (await rl.question(question)).trim();
    if (answer === "") return fallback;
    if (answer.toLowerCase() === "a" || answer.toLowerCase() === "all") {
      return Array.from({ length: max }, (_, i) => i + 1);
    }
    const picks = parsePicks(answer, max);
    if (picks && picks.length) return picks;
    console.log(dim(`  Type numbers between 1 and ${max}, like 1,3 or 2-5. Enter keeps the default.`));
  }
}

async function interactive(projectDir, opts) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => {
    console.log("\nCancelled. Nothing installed.");
    process.exit(130);
  });

  console.log(`\n${bold("builder-skills")} ${pkg.version}`);
  console.log(dim("Workflow, security, and writing skills for builders shipping Convex apps.\n"));

  listCommandNumbered();
  const skillPicks = await ask(rl, `Skills to add ${dim("[Enter = all, or 1,3,9 or 1-6]")}: `, ACTIVE.length, null);
  const names = skillPicks ? skillPicks.map((i) => ACTIVE[i - 1].name) : ACTIVE.map((s) => s.name);

  const found = detectTargets(projectDir);
  console.log(`\n${bold("Agents")}`);
  TARGETS.forEach((t, i) => {
    const hit = found.includes(t) ? "  (found)" : "";
    console.log(`  ${String(i + 1).padStart(2)}  ${t.label.padEnd(22)} ${dim(t.dir)}${hit}`);
  });
  const defaults = (found.length ? found : [TARGETS[0]]).map((t) => TARGETS.indexOf(t) + 1);
  const defaultLabel = defaults.map((i) => TARGETS[i - 1].label).join(", ");
  const targetPicks = await ask(rl, `Install for ${dim(`[Enter = ${defaultLabel}]`)}: `, TARGETS.length, defaults);
  const targetDirs = targetPicks.map((i) => join(projectDir, TARGETS[i - 1].dir));

  const starters = (await rl.question(
    `\nAdd project starters (AGENTS.md, task.md, changelog.md, files.md, SECURITY.md, prds/)? ${dim("[y/N]")}: `,
  ))
    .trim()
    .toLowerCase();
  rl.close();

  installMany(names, targetDirs, opts);
  if (starters === "y" || starters === "yes") initCommand(projectDir);
  printNextSteps(names);
}

function listCommandNumbered() {
  let n = 0;
  for (const g of MANIFEST.groups) {
    console.log(bold(g.title));
    for (const s of ACTIVE.filter((x) => x.group === g.id)) {
      n += 1;
      console.log(`  ${String(n).padStart(2)}  ${s.name.padEnd(22)} ${dim(s.summary)}`);
    }
  }
  console.log("");
}

function printNextSteps(names) {
  console.log(`
${bold("Next")}
  Convex: tell your agent "Read ${SETUP_URL} and follow it."
  Route:  npx builder-skills start
  Update: npx builder-skills update${names.includes("dev") ? "\n  Edit:   dev is house style. Open dev/SKILL.md and make it yours." : ""}
`);
}

// ---------- argument parsing ----------

const argv = process.argv.slice(2);
const flags = { dir: process.cwd(), target: null, link: false, force: false, yes: false, json: false, all: false };
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--dir") flags.dir = resolve(argv[++i] ?? ".");
  else if (a === "--target") flags.target = argv[++i] ?? null;
  else if (a === "--link") flags.link = true;
  else if (a === "--force") flags.force = true;
  else if (a === "--yes" || a === "-y") flags.yes = true;
  else if (a === "--json") flags.json = true;
  else if (a === "--all") flags.all = true;
  else positional.push(a);
}

const [command, ...rest] = positional;
const opts = { link: flags.link, force: flags.force };

switch (command) {
  case undefined:
    if (flags.all) {
      installMany(listActive(), resolveTargets(flags.dir, flags.target), opts);
    } else if (process.stdin.isTTY && process.stdout.isTTY && !flags.yes) {
      await interactive(flags.dir, opts);
    } else if (flags.yes) {
      installMany(listActive(), resolveTargets(flags.dir, flags.target), opts);
      printNextSteps(listActive());
    } else {
      printHelp();
    }
    break;
  case "add":
  case "install":
    if (flags.all) {
      installMany(listActive(), resolveTargets(flags.dir, flags.target), opts);
      printNextSteps(listActive());
    } else if (rest.length === 0) {
      fail("name at least one skill, or pass --all. Run 'npx builder-skills list'.");
    } else {
      if (installMany(rest, resolveTargets(flags.dir, flags.target), opts)) printNextSteps(rest);
    }
    break;
  case "install-all":
    installMany(listActive(), resolveTargets(flags.dir, flags.target), opts);
    printNextSteps(listActive());
    break;
  case "list":
    listCommand(flags.json);
    break;
  case "show":
  case "get":
  case "path": {
    const name = rest[0];
    if (!name) {
      fail(`name a skill: npx builder-skills ${command} <skill>`);
    } else if (!ACTIVE_NAMES.has(name)) {
      if (RETIRED.has(name)) {
        printRetired(name);
        process.exitCode = 1;
      } else fail(`unknown skill "${name}". Run 'npx builder-skills list'.`);
    } else {
      const file = join(skillsRoot, name, "SKILL.md");
      console.log(command === "path" ? file : readFileSync(file, "utf-8"));
    }
    break;
  }
  case "update":
    updateCommand(
      rest,
      flags.target
        ? resolveTargets(flags.dir, flags.target)
        : TARGETS.map((t) => join(flags.dir, t.dir)),
      opts,
    );
    break;
  case "start":
    startCommand(flags.dir);
    break;
  case "init":
  case "install-templates":
    initCommand(flags.dir);
    console.log(`\nNext: npx builder-skills add workflow update-project-docs git-safety`);
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  case "--version":
  case "-v":
    console.log(pkg.version);
    break;
  default:
    fail(`unknown command "${command}".`);
    printHelp();
}

function listActive() {
  return ACTIVE.map((s) => s.name);
}
