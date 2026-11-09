#!/usr/bin/env node
// sec-check surface ledger
// Lists every Convex function, HTTP route, component HTTP prefix, and env var
// read, then marks each public entry point as open, review, or ok. The scanner
// checks auth per file; this checks it per function, so one unguarded export
// in an otherwise guarded file still shows up.
//
// Usage:
//   node scripts/surface.cjs [project_dir] [--json] [--all] [--out FILE] [--strict] [--diff REF]
//
//   --json    print the full ledger as JSON (for agents and diffs between runs)
//   --all     include ok functions in the markdown output
//   --out     write the output to FILE instead of stdout
//   --strict  exit 1 when any public function is open
//   --diff    only show functions in files changed since REF (e.g. origin/main),
//             plus uncommitted and untracked files. For PR and pre-commit checks
//
// Zero dependencies, Node 18+. Heuristic: it reads source, not types. Every
// "open" or "review" row is a lead to confirm by reading the code.

"use strict";
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const outIdx = argv.indexOf("--out");
const outFile = outIdx >= 0 ? argv[outIdx + 1] : null;
const diffIdx = argv.indexOf("--diff");
const diffRef = diffIdx >= 0 ? argv[diffIdx + 1] : null;
const root = path.resolve(
  argv.find((a, i) => !a.startsWith("--") && !["--out", "--diff"].includes(argv[i - 1])) || ".",
);
if (flags.has("--help") || flags.has("-h")) {
  process.stdout.write(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 19).join("\n") + "\n");
  process.exit(0);
}

// Files changed since diffRef, relative to root, or null when --diff is not set
let changedFiles = null;
if (diffRef) {
  const { execFileSync } = require("child_process");
  const git = (args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter(Boolean);
  try {
    changedFiles = new Set([
      ...git(["diff", "--name-only", "--relative", `${diffRef}...HEAD`]),
      ...git(["diff", "--name-only", "--relative", "HEAD"]),
      ...git(["ls-files", "--others", "--exclude-standard"]),
    ]);
  } catch (e) {
    console.error(`--diff ${diffRef}: git could not compare (${String(e.message).split("\n")[0]})`);
    process.exit(2);
  }
}

// Convex functions directory, honoring convex.json "functions"
let convexDir = path.join(root, "convex");
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "convex.json"), "utf8"));
  if (cfg.functions) convexDir = path.join(root, cfg.functions);
} catch {}
if (!fs.existsSync(convexDir)) {
  console.error(`No Convex directory at ${path.relative(process.cwd(), convexDir) || convexDir}`);
  process.exit(0);
}

const SKIP_DIRS = new Set(["_generated", "node_modules", "dist", ".git"]);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|js|mts|mjs)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

// Index just past the bracket that closes the one at `open`, skipping strings and comments
function matchClose(src, open) {
  const pairs = { "(": ")", "{": "}", "[": "]" };
  const stack = [pairs[src[open]]];
  let i = open + 1;
  while (i < src.length && stack.length) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top === "`") {
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { stack.pop(); i++; continue; }
      if (c === "$" && src[i + 1] === "{") { stack.push("}"); i += 2; continue; }
      i++; continue;
    }
    if (c === "/" && src[i + 1] === "/") { const n = src.indexOf("\n", i); i = n < 0 ? src.length : n; continue; }
    if (c === "/" && src[i + 1] === "*") { const n = src.indexOf("*/", i + 2); i = n < 0 ? src.length : n + 2; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      i = j + 1; continue;
    }
    if (c === "`") { stack.push("`"); i++; continue; }
    if (pairs[c]) { stack.push(pairs[c]); i++; continue; }
    if (c === top) { stack.pop(); i++; continue; }
    i++;
  }
  return i;
}

// Index just past the string literal that starts at `i`
function skipString(s, i) {
  const q = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== q) j += s[j] === "\\" ? 2 : 1;
  return j + 1;
}

// Top level keys of the object literal that starts at `open`, with the start of each value
function topKeys(src, open) {
  const body = src.slice(open + 1, matchClose(src, open) - 1);
  const keys = [];
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if ("({[".includes(c)) { i = matchClose(body, i); continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(body, i); continue; }
    if (c === "/" && body[i + 1] === "/") { const n = body.indexOf("\n", i); i = n < 0 ? body.length : n; continue; }
    if (c === "/" && body[i + 1] === "*") { const n = body.indexOf("*/", i + 2); i = n < 0 ? body.length : n + 2; continue; }
    const m = /^([A-Za-z_$][\w$]*)\s*:\s*/.exec(body.slice(i));
    if (m && (i === 0 || /[\s,{]/.test(body[i - 1]))) {
      const start = i + m[0].length;
      let j = start;
      while (j < body.length && body[j] !== ",") j = "({[".includes(body[j]) ? matchClose(body, j) : j + 1;
      keys.push({ name: m[1], value: body.slice(start, j).trim() });
      i += m[0].length;
      continue;
    }
    i++;
  }
  return keys;
}

const BASE = {
  query: "public", mutation: "public", action: "public",
  internalQuery: "internal", internalMutation: "internal", internalAction: "internal",
  httpAction: "http",
};
const KIND = (b) => (/Query$|^query$/i.test(b) ? "query" : /Mutation$|^mutation$/i.test(b) ? "mutation" : /Action$|^action$/i.test(b) ? (b === "httpAction" ? "http" : "action") : "unknown");

const ACCESS_CALL = /\b(require|assert|check|ensure|can|has|verify|authorize|authenticate|getCurrent|getAuthed|getSigned|getLogged)[A-Z]\w*\s*\(/g;
const NOT_ACCESS = /RateLimit|Limit$|Exists$|OwnProperty|Length$|Format$|Valid(Url|Email|Json)/;
const AUTH_DIRECT = /\bctx\.auth\b|getAuthUserId\s*\(|getAuthSessionId\s*\(|\bauth\.(getUserId|getSessionId)\s*\(|authComponent\.(getAuthUser|safeGetAuthUser)|betterAuth|getUserIdentity/;
const RL = /rateLimit|RateLimiter|rateLimiter|checkRateLimit|\.limit\(\s*ctx/;
const BOT_CHECK = /turnstile|hcaptcha|recaptcha|siteverify/i;
const PAID = /from ["']openai["']|new OpenAI\(|@anthropic-ai\/sdk|new Anthropic\(|generateText|streamText|generateObject|streamObject|chat\.completions|messages\.create|embedMany|\bembed\(|@mistralai|groq-sdk|@google\/genai|GoogleGenerativeAI|elevenlabs|ElevenLabs|firecrawl|Firecrawl|browserbase|Browserbase|replicate|getServiceToken\(|convexGateway|\.generateText\(|\.streamText\(|api\.openai\.com|api\.anthropic\.com|api\.x\.ai|resend\.emails\.send|new Resend\(|twilio|Authorization["']?\s*:\s*`Bearer|["']x-api-key["']\s*:/;
const GATEWAY = /getServiceToken\(\s*["']ai-gateway|convexGateway/;
const WRITES = /ctx\.db\.(insert|patch|replace|delete)\b|ctx\.storage\.(delete|store)\b|ctx\.scheduler\.|ctx\.runMutation\b/;
const IDENTITY_ARGS = new Set(["userId", "ownerId", "clerkId", "clerkUserId", "authorId", "tokenIdentifier", "isAdmin", "role", "adminId", "creatorId", "createdBy", "viewerId"]);
// Unguessable args count as access control per the Convex best practices, if they never reach other clients
const CAPABILITY_ARGS = /^(sessionId|sessionToken|token|accessToken|secret|inviteCode|inviteToken|shareToken|shareId|hostToken|editToken|adminToken|password)$/;
const OWNERSHIP = /(userId|ownerId|authorId|createdBy|owner|creatorId|_id)\s*(!==|===|!=|==)|(!==|===|!=|==)\s*[\w.?]*(userId|ownerId|authorId|createdBy|_id)\b|requireOwn|assertOwn|checkOwn|canAccess|canEdit|canView|canDelete|ensureOwn/;
const TODO_AUTH = /(TODO|FIXME|HACK|XXX)[^\n]*(auth|admin|permission|secur|access|owner|login)/i;
const DELTA_ARG = /^(delta|amount|qty|quantity|score|points|votes?|increment|incrementBy|by|count|rating|stars|price|credits|balance|weight|bid|stock)$/i;
const PRIVATE_FIELDS = /\b(email|phone|address|revenue|salary|ssn|password|apiKey|stripeCustomerId|ipAddress)\b/;
const MARKER = /sec-check:\s*public/;

const files = walk(convexDir);
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const rel = (f) => path.relative(root, f);
const modulePath = (f) => path.relative(convexDir, f).replace(/\.(ts|js|mts|mjs)$/, "").split(path.sep).join("/");

// Custom builders (customQuery, zCustomMutation, ...) and whether they authenticate
const builders = {};
for (const [f, src] of sources) {
  const re = /(?:export\s+)?const\s+(\w+)\s*=\s*(z?[Cc]ustom(?:Query|Mutation|Action))\s*\(\s*(\w+)?/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index + m[0].indexOf(m[2]));
    const text = src.slice(m.index, matchClose(src, open));
    const base = m[3] || "";
    const auth = !/\bNoOp\b/.test(text) && (AUTH_DIRECT.test(text) || [...text.matchAll(ACCESS_CALL)].some((x) => !NOT_ACCESS.test(x[0])));
    builders[m[1]] = { visibility: BASE[base] || (/^internal/.test(base) ? "internal" : "public"), auth, file: rel(f) };
  }
}

// Body brace of `function f(...)`, skipping a return type like Promise<{ a: T }> or { a: T }
function functionBodyStart(src, paramsOpen) {
  let i = matchClose(src, paramsOpen);
  let angle = 0;
  for (const stop = i + 400; i < stop && i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") angle++;
    else if (ch === ">" && src[i - 1] !== "=") angle--;
    else if (ch === "{" && angle <= 0) {
      const prev = src.slice(0, i).trimEnd().slice(-1);
      if (/[:|&,(]/.test(prev)) i = matchClose(src, i) - 1;
      else return i;
    }
  }
  return -1;
}

// Plain helpers that check auth (getUserId(ctx) calling ctx.auth inside), followed two levels deep
const helperBodies = new Map();
for (const [, src] of sources) {
  const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+function\s+(\w+)\s*\(|function\s+(\w+)\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] || m[2] || m[3];
    const brace = m[3] ? src.indexOf("{", m.index + m[0].length - 1) : functionBodyStart(src, m.index + m[0].length - 1);
    if (brace < 0 || brace - (m.index + m[0].length) > 400) continue;
    helperBodies.set(name, (helperBodies.get(name) || "") + src.slice(brace, matchClose(src, brace)));
  }
}
const authHelpers = new Set();
for (let pass = 0; pass < 3; pass++) {
  for (const [name, body] of helperBodies) {
    if (authHelpers.has(name)) continue;
    const calls = [...body.matchAll(/(?<![.\w$])(\w+)\s*\(/g)].map((x) => x[1]);
    if (AUTH_DIRECT.test(body) || calls.some((c) => authHelpers.has(c))) authHelpers.add(name);
  }
}
const paidHelpers = new Set();
for (let pass = 0; pass < 3; pass++) {
  for (const [name, body] of helperBodies) {
    if (paidHelpers.has(name)) continue;
    const calls = [...body.matchAll(/(?<![.\w$])(\w+)\s*\(/g)].map((x) => x[1]);
    if (PAID.test(body) || calls.some((c) => paidHelpers.has(c))) paidHelpers.add(name);
  }
}
const lookupHelpers = new Set([...helperBodies].filter(([, body]) => /\.eq\(|===|timingSafeEqual/.test(body)).map(([name]) => name));
const callsPaidHelper = (text) => [...text.matchAll(/(?<![.\w$])(\w+)\s*\(/g)].some((x) => paidHelpers.has(x[1]));
const helperCall = (text) => [...new Set([...text.matchAll(/(?<![.\w$])(\w+)\s*\(/g)].map((x) => x[1]).filter((c) => authHelpers.has(c)))];

const fns = [];
for (const [f, src] of sources) {
  const fileMarked = MARKER.test(src);
  const re = /export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, builder] = m;
    const custom = builders[builder];
    const isBuilder = BASE[builder] || custom || /^[a-z]\w*(Query|Mutation|Action)$/.test(builder);
    if (!isBuilder || /^(define|use|create|make|build)[A-Z]/.test(builder)) continue;
    const open = m.index + m[0].length - 1;
    const end = matchClose(src, open);
    const text = src.slice(open, end);
    const before = src.slice(Math.max(0, m.index - 300), m.index).split("\n").slice(-4).join("\n");
    const line = src.slice(0, m.index).split("\n").length;
    const visibility = BASE[builder] || (custom ? custom.visibility : "unknown");
    const kind = KIND(builder);
    const argsAt = text.search(/\bargs\s*:\s*\{/);
    const args = argsAt >= 0 ? topKeys(text, text.indexOf("{", argsAt)) : [];
    const accessCalls = [
      ...[...text.matchAll(ACCESS_CALL)].map((x) => x[0].replace(/\s*\($/, "")).filter((n) => !NOT_ACCESS.test(n)),
      ...helperCall(text),
    ];
    const idArgs = args.filter((a) => /v\.(optional\(\s*v\.)?id\(/.test(a.value)).map((a) => a.name);
    const clientIdWrite = idArgs.some((n) => new RegExp(`ctx\\.db\\.(patch|replace|delete)\\(\\s*(?:["']\\w+["']\\s*,\\s*)?(?:args\\.)?${n}\\b`).test(text));
    // An id arg stored on an inserted row (projectId, roomId) whose parent row is never loaded
    const inserts = [...text.matchAll(/ctx\.db\.insert\(/g)].map((x) => text.slice(x.index, matchClose(text, text.indexOf("(", x.index)) + 1));
    const parentArgs = args
      .filter((a) => /^v\.(optional\(\s*v\.)?id\(\s*["'](?!_storage|users)/.test(a.value))
      .map((a) => a.name);
    const parentWrites = parentArgs.filter((n) =>
      !IDENTITY_ARGS.has(n) &&
      inserts.some((s) => new RegExp(`\\b${n}\\b`).test(s)) &&
      !new RegExp(`\\.get\\(\\s*(?:["']\\w+["']\\s*,\\s*)?(?:args\\.)?${n}\\b|eq\\(\\s*["']_id["']\\s*,\\s*(?:args\\.)?${n}\\b|(?<![.\\w$])\\w+\\s*\\(\\s*ctx\\b[^)]*\\b(?:args\\.)?${n}\\b`).test(text));
    // Number args shaped like a delta or score with no visible bound
    const unboundedNumbers = args
      .filter((a) => DELTA_ARG.test(a.name) && /v\.(optional\(\s*v\.)?(number|float64|int64)\(/.test(a.value))
      .map((a) => a.name)
      .filter((n) => !new RegExp(`(args\\.)?${n}\\s*(<|>|<=|>=)|(<|>|<=|>=)\\s*(args\\.)?${n}\\b|Math\\.(min|max)\\([^)]*\\b${n}\\b|clamp|Number\\.isInteger\\([^)]*${n}`).test(text));
    const refs = [...text.matchAll(/\b(internal|api)\.((?:[\w]+\.)*[\w]+)/g)].map((x) => ({ via: x[1], target: x[2] }));
    const runRefs = [...text.matchAll(/ctx\.run(?:Query|Mutation|Action)\(\s*(internal|api)\.((?:[\w]+\.)*[\w]+)/g)].map((x) => `${x[1]}.${x[2]}`);
    const capability = args.map((a) => a.name).filter((n) => {
      if (!CAPABILITY_ARGS.test(n)) return false;
      if (new RegExp(`\\.eq\\([^)]*(args\\.)?${n}\\b|===\\s*(args\\.)?${n}\\b|(args\\.)?${n}\\s*===|timingSafeEqual|verify`).test(text)) return true;
      // Passed to a helper that looks it up, like activeRecipientForToken(ctx, args.token)
      return [...text.matchAll(new RegExp(`(?<![.\\w$])(\\w+)\\s*\\([^)]*\\b(?:args\\.)?${n}\\b`, "g"))].some((x) => lookupHelpers.has(x[1]));
    });
    fns.push({
      id: `${modulePath(f)}:${name}`,
      ref: `${modulePath(f).split("/").join(".")}.${name}`,
      file: rel(f),
      line,
      name,
      builder,
      visibility,
      kind,
      hasArgs: argsAt >= 0 || /\bargs\s*:/.test(text),
      hasReturns: /\breturns\s*:/.test(text),
      args: args.map((a) => a.name),
      identityArgs: args.map((a) => a.name).filter((n) => IDENTITY_ARGS.has(n)),
      byok: args.some((a) => a.name === "apiKey"),
      access: AUTH_DIRECT.test(text) || accessCalls.length > 0 || Boolean(custom && custom.auth) || capability.length > 0,
      accessVia: [...new Set([
        ...(AUTH_DIRECT.test(text) ? ["ctx.auth"] : []),
        ...accessCalls.slice(0, 3),
        ...(custom && custom.auth ? [`builder ${builder}`] : []),
        ...capability.map((n) => `capability arg ${n}`),
      ])],
      runRefs,
      marked: MARKER.test(text) || MARKER.test(before) || fileMarked,
      rateLimited: RL.test(text),
      botCheck: BOT_CHECK.test(text),
      writes: WRITES.test(text),
      paidDirect: PAID.test(text) || callsPaidHelper(text),
      gateway: GATEWAY.test(text),
      fetches: /\bfetch\s*\(/.test(text),
      clientIdWrite,
      parentWrites,
      unboundedNumbers,
      privateFields: kind === "query" && PRIVATE_FIELDS.test(text),
      ownershipHint: OWNERSHIP.test(text),
      todoAuth: TODO_AUTH.test(text) || TODO_AUTH.test(before),
      collectInQuery: kind === "query" && /\.collect\(\)/.test(text),
      schedulesPublic: /(runAfter|runAt)\([^)]*\bapi\.|ctx\.run(Mutation|Action|Query)\(\s*api\./.test(text),
      refs,
    });
  }
}

// Paid work reached through scheduled or run internal functions counts too
const byRef = new Map(fns.map((x) => [x.ref, x]));
for (const x of fns) x.paid = x.paidDirect;
for (let pass = 0; pass < 6; pass++) {
  let changed = false;
  for (const x of fns) {
    if (x.paid) continue;
    const hit = x.refs.find((r) => byRef.get(r.target) && byRef.get(r.target).paid);
    if (hit) { x.paid = true; x.paidVia = `${hit.via}.${hit.target}`; changed = true; }
  }
  if (!changed) break;
}

// ctx.run* carries the caller's identity, so an auth check inside the called function counts
for (let pass = 0; pass < 4; pass++) {
  let changed = false;
  for (const x of fns) {
    if (x.access) continue;
    const hit = x.runRefs.find((r) => { const t = byRef.get(r.replace(/^(internal|api)\./, "")); return t && t.access; });
    if (hit) { x.access = true; x.accessVia.push(`via ${hit}`); changed = true; }
  }
  if (!changed) break;
}

// Status and reasons for every public entry point
for (const x of fns) {
  const reasons = [];
  if (x.visibility === "internal") { x.status = "internal"; continue; }
  if (x.visibility === "http") { x.status = "http"; continue; }
  if (x.visibility === "unknown") reasons.push(`custom builder ${x.builder} not found in convex/, confirm it checks auth`);
  const guarded = x.access || x.marked;
  const throttled = x.rateLimited || x.botCheck;
  if (!guarded && (x.kind === "mutation" || x.kind === "action")) {
    const what = x.paid ? "spends money with no access check" : "public write with no access check";
    reasons.push(throttled ? `anonymous ${x.paid ? "paid call" : "write"}, ${x.botCheck ? "bot check" : "rate limited"}: confirm intended, then mark // sec-check: public` : what);
  }
  if (!guarded && x.kind === "query") reasons.push("public read with no access check (fine only if the data is public)");
  if (x.gateway && !x.access) reasons.push("AI Gateway reachable without sign in");
  if (x.paid && !x.rateLimited && !x.byok && !(x.paidVia && x.access)) reasons.push(x.paidVia ? `reaches paid work via ${x.paidVia} with no rate limit here` : "paid call with no rate limit");
  if (x.identityArgs.length) reasons.push(`takes caller identity as args (${x.identityArgs.join(", ")}), read it from ctx.auth`);
  if (x.clientIdWrite && !x.ownershipHint) reasons.push("patches or deletes a client supplied id with no visible ownership check");
  if (x.parentWrites.length && x.access) reasons.push(`inserts into parent ${x.parentWrites.join(", ")} without loading it, check the caller owns or belongs to it`);
  if (x.unboundedNumbers.length) reasons.push(`number arg ${x.unboundedNumbers.join(", ")} has no visible bound, a caller can send -1e9`);
  if (x.privateFields && !x.access && !x.marked) reasons.push("public read touches private fields (email, phone, key), confirm they are never returned");
  if (x.todoAuth) reasons.push("TODO or FIXME about auth next to this function");
  if (x.schedulesPublic) reasons.push("schedules or runs an api.* function, target should be internal");
  if (!x.hasArgs) reasons.push("no args validator");
  if (x.kind === "query" && !x.hasReturns && !x.access) reasons.push("public query with no returns validator, may leak whole documents");
  x.reasons = reasons;
  const hard = reasons.some((r) => /no access check|without sign in|caller identity|client supplied id|TODO|not found/.test(r)) && !(x.kind === "query" && guarded);
  const identityOrTodo = reasons.some((r) => /caller identity|TODO|not found|without sign in/.test(r));
  x.status = !guarded && x.kind !== "query" && (!throttled || identityOrTodo)
    ? "open"
    : hard || reasons.some((r) => /rate limit|api\.\*|public read|anonymous|parent|no visible bound/.test(r)) ? "review" : "ok";
  if (x.status === "review" && !hard && x.marked && reasons.every((r) => /public read|returns validator|no args/.test(r))) x.status = "ok";
}

// HTTP routes, Convex Auth routes, and component HTTP prefixes
const routes = [];
const httpFns = new Map(fns.filter((x) => x.visibility === "http").map((x) => [x.name, x]));
const VERIFY = /svix|new Webhook\(|\.verify\(|constructEvent|timingSafeEqual|createHmac|crypto\.subtle\.(verify|importKey)|verifyKey|verifySignature|verifyWebhook|SIGNING_SECRET|WEBHOOK_SECRET|DISCORD_PUBLIC_KEY/;
for (const [f, src] of sources) {
  if (!/httpRouter\s*\(/.test(src)) continue;
  if (/\.addHttpRoutes\(\s*\w+\s*\)/.test(src)) routes.push({ file: rel(f), path: "(auth library routes)", method: "*", handler: "addHttpRoutes", signals: ["library"] });
  const re = /\.route\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("{", m.index);
    const text = src.slice(open, matchClose(src, open));
    const p = (/(path(?:Prefix)?)\s*:\s*["'`]([^"'`]+)/.exec(text) || [])[2] || "?";
    const prefix = /pathPrefix\s*:/.test(text);
    const method = (/method\s*:\s*["'`](\w+)/.exec(text) || [])[1] || "?";
    const h = (/handler\s*:\s*([\w.]+)/.exec(text) || [])[1] || "inline";
    const target = httpFns.get(h.split(".").pop());
    const targetSrc = target ? sources.get(path.join(root, target.file)) : "";
    const handlerText = target
      ? (() => { const o = targetSrc.indexOf("(", targetSrc.indexOf(`const ${target.name}`)); return targetSrc.slice(o, matchClose(targetSrc, o)); })()
      : text;
    const body = text + targetSrc;
    const signals = [];
    if (VERIFY.test(handlerText)) signals.push("verifies signature");
    if (AUTH_DIRECT.test(handlerText) || /Authorization|Bearer/.test(handlerText)) signals.push("checks auth header");
    if (/ctx\.storage\.get\(/.test(handlerText)) signals.push("serves storage blobs");
    if (/Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/.test(body)) signals.push("CORS *");
    if (/runMutation\(\s*api\.|runAction\(\s*api\./.test(handlerText)) signals.push("calls api.*");
    const hook = /webhook|hook|stripe|clerk|svix|resend|polar|github|slack|discord|interactions|twilio|agentmail|attio|callback/i.test(p);
    routes.push({ file: rel(f), path: prefix ? `${p}*` : p, method, handler: h, signals, status: hook && !signals.includes("verifies signature") ? "review" : "ok" });
  }
}
const configFile = ["convex.config.ts", "convex.config.js"].map((n) => path.join(convexDir, n)).find((p) => fs.existsSync(p));
const configSrc = configFile ? fs.readFileSync(configFile, "utf8") : "";
for (const m of configSrc.matchAll(/app\.use\(\s*(\w+)[^)]*?httpPrefix\s*:\s*["'`]([^"'`]+)/gs)) {
  routes.push({ file: rel(configFile), path: `${m[2]}*`, method: "*", handler: `component ${m[1]}`, signals: ["component routes"], status: "ok" });
}

// Env vars read in code vs declared in convex.config.ts
const declared = new Set();
const envBlock = /defineApp\s*\(\s*\{[\s\S]*?\benv\s*:\s*\{/.exec(configSrc);
if (envBlock) {
  const open = envBlock.index + envBlock[0].length - 1;
  for (const k of topKeys(configSrc, open)) declared.add(k.name);
}
const envReads = {};
for (const [f, src] of sources) {
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)|\benv\.([A-Z0-9_]+)\b/g)) {
    const n = m[1] || m[2];
    (envReads[n] = envReads[n] || new Set()).add(rel(f));
  }
}
const SYSTEM_ENV = new Set(["CONVEX_CLOUD_URL", "CONVEX_SITE_URL", "NODE_ENV"]);
const env = Object.keys(envReads).sort().map((n) => ({ name: n, declared: declared.has(n) || SYSTEM_ENV.has(n), files: [...envReads[n]] }));

const pub = fns
  .filter((x) => !["internal", "http"].includes(x.visibility))
  .filter((x) => !changedFiles || changedFiles.has(x.file));
if (changedFiles) routes.splice(0, routes.length, ...routes.filter((r) => changedFiles.has(r.file)));
const summary = {
  project: path.basename(root),
  convexDir: rel(convexDir) || ".",
  diff: diffRef ? { ref: diffRef, changedFiles: changedFiles.size } : null,
  generatedAt: new Date().toISOString(),
  functions: fns.length,
  public: pub.length,
  internal: fns.filter((x) => x.visibility === "internal").length,
  open: pub.filter((x) => x.status === "open").length,
  review: pub.filter((x) => x.status === "review").length,
  ok: pub.filter((x) => x.status === "ok").length,
  httpRoutes: routes.length,
  undeclaredEnv: env.filter((e) => !e.declared).length,
  // ctx.auth returns null on every call without a provider config, so ownership checks cannot work yet
  authConfig: ["auth.config.ts", "auth.config.js"].some((n) => fs.existsSync(path.join(convexDir, n))),
};

let out;
if (flags.has("--json")) {
  out = JSON.stringify({ summary, functions: fns.map(({ refs, ...rest }) => rest), routes, env }, null, 2) + "\n";
} else {
  const L = [];
  const row = (x) => `| ${x.status} | \`${x.id}\` | ${x.kind} | ${x.file}:${x.line} | ${x.accessVia.join(", ") || (x.marked ? "marked public" : "none")} | ${(x.reasons || []).join("; ")} |`;
  L.push(`# Surface ledger: ${summary.project}`, "");
  if (diffRef) L.push(`Diff mode: only files changed since \`${diffRef}\` (${changedFiles.size} files). Follow changed functions into their callers before calling a change safe.`, "");
  L.push(`${summary.public} public functions (${summary.open} open, ${summary.review} review, ${summary.ok} ok), ${summary.internal} internal, ${summary.httpRoutes} HTTP routes, ${summary.undeclaredEnv} env vars read but not declared in convex.config.ts.`, "");
  L.push("Every open or review row is a lead, not a finding. Confirm it by reading the function, then record it with the finding gate in SKILL.md.", "");
  if (!summary.authConfig) L.push("No `auth.config.ts` in the Convex folder, so `ctx.auth.getUserIdentity()` returns null on every call. Do not add `ctx.auth` checks yet: make admin functions internal first, add an auth provider, then add ownership checks. Apps on custom sessions or capability tokens can ignore this.", "");
  const show = pub.filter((x) => x.status === "open" || x.status === "review" || flags.has("--all"));
  const order = { open: 0, review: 1, ok: 2 };
  if (show.length) {
    L.push("## Public functions", "", "| Status | Function | Kind | Where | Access check | Why |", "| --- | --- | --- | --- | --- | --- |");
    show.sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id)).forEach((x) => L.push(row(x)));
    L.push("");
  }
  if (routes.length) {
    L.push("## HTTP surface", "", "| Status | Method | Path | Handler | Signals |", "| --- | --- | --- | --- | --- |");
    routes.forEach((r) => L.push(`| ${r.status || "ok"} | ${r.method} | \`${r.path}\` | ${r.handler} | ${r.signals.join(", ")} |`));
    L.push("");
  }
  const undeclared = env.filter((e) => !e.declared);
  if (undeclared.length) {
    L.push("## Env vars not declared in convex.config.ts", "", undeclared.map((e) => `\`${e.name}\``).join(", "), "", "Declare them in `defineApp({ env })` so a missing secret fails the deploy, and read them from `env` in `_generated/server`.", "");
  }
  if (!flags.has("--all") && summary.ok) L.push(`${summary.ok} ok functions hidden. Rerun with --all to list them.`, "");
  out = L.join("\n");
}

if (outFile) fs.writeFileSync(outFile, out);
else process.stdout.write(out);
process.exitCode = flags.has("--strict") && summary.open > 0 ? 1 : 0;
