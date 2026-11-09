#!/usr/bin/env node
// sec-check security changelog
// Records one run of the skill against one repo: scanner counts, ledger counts,
// and which open rows appeared or went away since the last run. Writes to a
// runs folder outside the target repo, so open findings never land in git.
//
// Usage:
//   node scripts/changelog.cjs [project_dir] [--mode NAME] [--runs DIR] [--note TEXT] [--no-scan]
//
//   --mode     quick, diff, verify, or audit (default quick)
//   --runs     runs folder (default $SEC_CHECK_RUNS, then ~/sec-check-runs)
//   --note     one line saved with the entry, e.g. "fixed comments auth"
//   --no-scan  skip sec-scan.sh and record ledger counts only
//
// Output: <runs>/<repo>/changelog.md (newest run first), <runs>/<repo>/latest.json,
// and <runs>/index.md with one row per repo. Zero dependencies, Node 18+.

"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
if (flags.has("--help") || flags.has("-h")) {
  process.stdout.write(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 17).join("\n") + "\n");
  process.exit(0);
}
const valued = ["--mode", "--runs", "--note"];
const root = path.resolve(argv.find((a, i) => !a.startsWith("--") && !valued.includes(argv[i - 1])) || ".");
const mode = opt("--mode", "quick");
const note = opt("--note", "");
const runs = path.resolve(opt("--runs", process.env.SEC_CHECK_RUNS || path.join(os.homedir(), "sec-check-runs")));
const repo = path.basename(root);
const dir = path.join(runs, repo);

if (root === runs || root.startsWith(runs + path.sep) || runs.startsWith(root + path.sep)) {
  console.error("The runs folder must be outside the target repo, so open findings never get committed.");
  process.exit(2);
}

const sh = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, ...opts });
  } catch (e) {
    // sec-scan exits non zero with --strict style findings, keep its output
    return e.stdout || "";
  }
};
const git = (...a) => sh("git", ["-C", root, ...a]).trim();

// Repo facts. Credentials are stripped from the remote URL before anything is written
const sha = git("rev-parse", "--short", "HEAD") || "no git";
const branch = git("rev-parse", "--abbrev-ref", "HEAD") || "";
const remote = git("remote", "get-url", "origin").replace(/\/\/[^@/]+@/, "//");

const here = __dirname;
const ledgerRaw = sh(process.execPath, [path.join(here, "surface.cjs"), root, "--json"]);
let ledger = null;
try { ledger = JSON.parse(ledgerRaw); } catch { /* no convex folder */ }

let scan = null;
if (!flags.has("--no-scan")) {
  const out = sh("bash", [path.join(here, "sec-scan.sh"), root, "--no-history"]);
  const m = /CRITICAL (\d+)\s+HIGH (\d+)\s+MEDIUM (\d+)\s+LOW (\d+)/.exec(out);
  if (m) scan = { critical: +m[1], high: +m[2], medium: +m[3], low: +m[4] };
}

// Open rows keyed by fingerprint so runs can be compared
const pub = ledger ? ledger.functions.filter((x) => !["internal", "http"].includes(x.visibility)) : [];
const openNow = Object.fromEntries(pub.filter((x) => x.status === "open").map((x) => [`ledger:${x.file}:${x.name}`, (x.reasons || [])[0] || ""]));

fs.mkdirSync(dir, { recursive: true });
const latestFile = path.join(dir, "latest.json");
const prev = fs.existsSync(latestFile) ? JSON.parse(fs.readFileSync(latestFile, "utf8")) : null;
const prevOpen = prev ? prev.open || {} : {};
const added = Object.keys(openNow).filter((k) => !(k in prevOpen));
const gone = Object.keys(prevOpen).filter((k) => !(k in openNow));

const now = new Date();
const stamp = `${now.toISOString().slice(0, 10)} ${now.toISOString().slice(11, 16)} UTC`;
const s = ledger ? ledger.summary : null;

const entry = [
  `### ${stamp}: ${mode} (${sha}${branch ? ` on ${branch}` : ""})`,
  "",
  note ? `- Note: ${note}` : null,
  scan ? `- Scanner: CRITICAL ${scan.critical}, HIGH ${scan.high}, MEDIUM ${scan.medium}, LOW ${scan.low}` : "- Scanner: not run",
  s ? `- Ledger: public ${s.public}, open ${s.open}, review ${s.review}, ok ${s.ok}${s.authConfig ? "" : ", no auth.config.ts"}` : "- Ledger: no Convex folder",
  prev ? `- Since ${prev.stamp}: ${added.length} new open, ${gone.length} gone` : "- First recorded run",
  ...added.map((k) => `  - new: \`${k}\` ${openNow[k]}`),
  ...gone.map((k) => `  - gone: \`${k}\`. Verify before calling it fixed (SKILL.md, verify a fix)`),
  "- Verdicts: fill in confirmed, rejected, and fixed fingerprints from this run",
  "",
].filter((l) => l !== null).join("\n");

const logFile = path.join(dir, "changelog.md");
const skeleton = [
  `# Security changelog: ${repo}`,
  "",
  `Repo: ${remote || root}`,
  "",
  "Kept outside the repo so open findings never ship in git. When a fix is deployed, add one line under `### Security` in the repo's own changelog.md, with no exploit detail.",
  "",
  "## Open",
  "",
  "| Fingerprint | Severity | Confidence | First seen | Fix |",
  "| --- | --- | --- | --- | --- |",
  "",
  "## Fixed",
  "",
  "| Fingerprint | Fixed | Proof |",
  "| --- | --- | --- |",
  "",
  "## Rejected",
  "",
  "| Fingerprint | Why | Control |",
  "| --- | --- | --- |",
  "",
  "## Runs",
  "",
].join("\n");
let log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : skeleton;
if (!log.includes("## Runs")) log = log.trimEnd() + "\n\n## Runs\n\n";
const at = log.indexOf("## Runs");
const after = log.indexOf("\n", at) + 1;
log = log.slice(0, after) + "\n" + entry + log.slice(after).replace(/^\n+/, "\n");
fs.writeFileSync(logFile, log);

// A run with --no-scan keeps the last scanner counts in the index
const lastScan = scan || (prev && prev.scan) || null;
fs.writeFileSync(latestFile, JSON.stringify({ repo, stamp, mode, sha, remote, scan: lastScan, summary: s, open: openNow }, null, 2) + "\n");

// Index of every tracked repo, rebuilt from each latest.json
const rows = fs.readdirSync(runs, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(runs, d.name, "latest.json")))
  .map((d) => JSON.parse(fs.readFileSync(path.join(runs, d.name, "latest.json"), "utf8")))
  .sort((a, b) => (b.summary ? b.summary.open : 0) - (a.summary ? a.summary.open : 0) || a.repo.localeCompare(b.repo));
const index = [
  "# Security runs",
  "",
  "One row per repo, most open rows first. Each repo's changelog.md has the full history.",
  "",
  "| Repo | Last run | Mode | Open | Review | Critical | High | Changelog |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.repo} | ${r.stamp} | ${r.mode} | ${r.summary ? r.summary.open : "n/a"} | ${r.summary ? r.summary.review : "n/a"} | ${r.scan ? r.scan.critical : "n/a"} | ${r.scan ? r.scan.high : "n/a"} | [changelog](${r.repo}/changelog.md) |`),
  "",
].join("\n");
fs.writeFileSync(path.join(runs, "index.md"), index);

process.stdout.write(`${logFile}\n\n${entry}`);
