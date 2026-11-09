#!/usr/bin/env bash
# sec-check scanner
# Static security scan for Convex + React/Vite/Next/Expo projects.
# Finds the mistakes already shipped across past repos: leaked secrets in git
# history, secrets with client prefixes, public Convex functions with no auth,
# paid AI calls with no rate limit, unsigned webhooks, public seed/setup
# functions, unsafe HTML rendering, and open uploads. Then runs surface.cjs for a
# per function check, and checks auth TODOs, auth config, lint, CI, and lockfiles.
#
# Usage:
#   bash scripts/sec-scan.sh [project_dir] [--no-history] [--strict]
#
#   --no-history  skip git history scans (faster on huge repos)
#   --strict      exit 1 on HIGH findings too (default: only CRITICAL)
#
# Exit codes: 0 clean or only MEDIUM/LOW, 1 blocking findings, 2 bad usage.
# Bash 3.2 compatible (default macOS shell). Optional: gitleaks, jq.

set -u

ROOT="."
NO_HISTORY=0
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --no-history) NO_HISTORY=1 ;;
    --strict) STRICT=1 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    -*) echo "Unknown flag: $arg" >&2; exit 2 ;;
    *) ROOT="$arg" ;;
  esac
done

SCRIPT_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
cd "$ROOT" 2>/dev/null || { echo "Cannot open $ROOT" >&2; exit 2; }

CRIT=0; HIGH=0; MED=0; LOW=0

# Print one finding and count it
report() {
  sev="$1"; shift
  case "$sev" in
    CRITICAL) CRIT=$((CRIT + 1)) ;;
    HIGH) HIGH=$((HIGH + 1)) ;;
    MEDIUM) MED=$((MED + 1)) ;;
    LOW) LOW=$((LOW + 1)) ;;
  esac
  printf '[%s] %s\n' "$sev" "$*"
}

section() { printf '\n== %s\n' "$*"; }

# Code search that skips build output, deps, generated code, and agent tooling folders
EXCLUDES="--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_generated --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=.output --exclude-dir=.vercel --exclude-dir=.netlify --exclude-dir=coverage --exclude-dir=.turbo --exclude-dir=.expo --exclude-dir=.agents --exclude-dir=.claude --exclude-dir=.cursor --exclude-dir=.codex"
CODE_INC="--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs --include=*.cjs"

# shellcheck disable=SC2086
g()  { grep -rEnI $EXCLUDES "$@" 2>/dev/null; }
# shellcheck disable=SC2086
gl() { grep -rElI $EXCLUDES "$@" 2>/dev/null; }

IS_GIT=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IS_GIT=1

# Convex functions directory, honoring convex.json "functions"
CONVEX_DIR="convex"
if [ -f convex.json ]; then
  custom=$(grep -oE '"functions"[[:space:]]*:[[:space:]]*"[^"]+"' convex.json | sed -E 's/.*"([^"]+)"$/\1/')
  [ -n "$custom" ] && CONVEX_DIR="${custom%/}"
fi

echo "sec-check scan: $(pwd)"

# ---------------------------------------------------------------------------
section "1. Secrets in git history"
# ---------------------------------------------------------------------------
SECRET_RE='sk-proj-[A-Za-z0-9_-]{20}|sk-ant-[A-Za-z0-9_-]{20}|sk_live_[A-Za-z0-9]{10}|rk_live_[A-Za-z0-9]{10}|whsec_[A-Za-z0-9]{10}|re_[A-Za-z0-9]{8}_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{30}|gsk_[A-Za-z0-9]{30}|xai-[A-Za-z0-9]{30}|ghp_[A-Za-z0-9]{30}|github_pat_[A-Za-z0-9_]{30}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9]{6,}-[A-Za-z0-9-]{10}|(prod|preview|dev|project):[a-z0-9-]+\|eyJ|-----BEGIN [A-Z ]*PRIVATE KEY-----'

if [ "$IS_GIT" = 0 ]; then
  report LOW "Not a git repo, history scan skipped"
elif [ "$NO_HISTORY" = 1 ]; then
  report LOW "History scan skipped (--no-history)"
else
  if command -v gitleaks >/dev/null 2>&1; then
    tmp=$(mktemp -t secscan.XXXXXX)
    gitleaks git . --no-banner --redact --report-format json --report-path "$tmp" >/dev/null 2>&1
    gl_exit=$?
    if [ "$gl_exit" = 1 ] && [ -s "$tmp" ]; then
      if command -v jq >/dev/null 2>&1; then
        jq -r '.[] | "\(.RuleID) \(.File):\(.StartLine) commit \(.Commit[0:7])"' "$tmp" | sort -u | while IFS= read -r line; do
          echo "    $line"
        done
        n=$(jq length "$tmp")
      else
        n=$(grep -c '"RuleID"' "$tmp")
      fi
      report CRITICAL "gitleaks found $n possible secrets in history (list above). Rotate first, then purge history. Doc placeholders are false positives"
    elif [ "$gl_exit" = 0 ]; then
      echo "    gitleaks: no leaks found"
    else
      report MEDIUM "gitleaks failed to run (exit $gl_exit). Rerun outside any sandbox"
    fi
    rm -f "$tmp"
  else
    echo "    gitleaks not installed (brew install gitleaks) so only the prefix scan runs"
  fi

  # Prefix scan always runs: gitleaks has no rule for Convex deploy keys
  hits=$(git log --all -p 2>/dev/null | grep -oE "$SECRET_RE" | sed -E 's/^((prod|preview|dev|project):).*/\1<deploy key>/' | cut -c1-20 | sort | uniq -c)
  if [ -n "$hits" ]; then
    echo "$hits" | sed 's/^/    /'
    git log --all -E -G"$SECRET_RE" --format='    commit %h %ad %s' --date=short 2>/dev/null | head -20
    report CRITICAL "Known key prefixes in git history (counts and commits above). Rotate each key, then purge history"
  fi

  # Env files ever committed
  envs=$(git log --all --name-only --format= 2>/dev/null | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)?$' | grep -viE 'example|sample|template|defaults' | sort -u)
  for f in $envs; do
    vars=$(git log --all -p -- "$f" 2>/dev/null | grep -E '^\+[A-Z0-9_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|DEPLOY)[A-Z0-9_]*=.{8,}' | sed -E 's/^\+([A-Z0-9_]+)=.*/\1/' | grep -vE 'PUBLISHABLE|CLIENT_ID|ANON_KEY|SITE_KEY|^CONVEX_DEPLOYMENT$|_URL$' | sort -u | tr '\n' ' ')
    if [ -n "$vars" ]; then
      report CRITICAL "$f was committed with secret values: $vars(rotate each, then purge $f from history)"
    else
      report MEDIUM "$f was committed (no secret values detected). Untrack it and ship .env.example"
    fi
  done

  tracked=$(git ls-files 2>/dev/null | grep -E '(^|/)\.env(\.[A-Za-z0-9_-]+)?$' | grep -viE 'example|sample|template|defaults')
  for f in $tracked; do
    report HIGH "$f is tracked right now. Run: git rm --cached $f"
  done
fi

# ---------------------------------------------------------------------------
section "2. Secrets in the working tree"
# ---------------------------------------------------------------------------
# shellcheck disable=SC2086
live=$(g -o "$SECRET_RE" . --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.json --include=*.toml --include=*.yml --include=*.yaml --include=*.md --include=*.mdx --exclude=package-lock.json | cut -d: -f1,2 | sort -u)
for hit in $live; do
  report CRITICAL "Secret pattern in $hit"
done

# Real deploy keys carry a long token after the pipe; docs use short placeholders like prod:your-deployment|xxx
deploy=$(g 'CONVEX_DEPLOY_KEY[[:space:]]*[=:][[:space:]]*["'"'"' ]*(prod|preview|dev|project):[^|]*\|[A-Za-z0-9=_+/-]{40,}' . --include=*.toml --include=*.json --include=*.yml --include=*.yaml --include=*.ts --include=*.js --include=*.md | grep -viE 'your|example|happy-animal|x{6,}|<' | cut -d: -f1,2)
for hit in $deploy; do
  report CRITICAL "Convex deploy key value in config at $hit. Set it only in the host dashboard"
done

if [ -f .gitignore ]; then
  if ! grep -qE '^[[:space:]]*/?\.env|^\*\.env|\.env\*|\.env\.local' .gitignore; then
    report MEDIUM ".gitignore does not ignore .env files"
  fi
else
  report MEDIUM "No .gitignore. Add one that ignores .env*, keeps .env.example"
fi

# ---------------------------------------------------------------------------
section "3. Secrets exposed to the browser bundle"
# ---------------------------------------------------------------------------
CLIENT_SECRET_RE='(VITE|NEXT_PUBLIC|EXPO_PUBLIC|PUBLIC|REACT_APP)_[A-Z0-9_]*(SECRET|PRIVATE|API_KEY|APIKEY|TOKEN|PASSWORD|OPENAI|ANTHROPIC|CLAUDE|GROQ|MISTRAL|GEMINI|XAI|GROK|SERVICE_ROLE|DEPLOY_KEY|WEBHOOK|RESEND|STRIPE_SECRET)[A-Z0-9_]*'
SAFE_PUBLIC='PUBLISHABLE|ANON_KEY|CLIENT_ID|SITE_KEY|POSTHOG|SENTRY_DSN|MAPBOX_TOKEN|WEB3FORMS'

# shellcheck disable=SC2086
code_hits=$(g -o "$CLIENT_SECRET_RE" . $CODE_INC --include=.env* | grep -vE "$SAFE_PUBLIC" | awk -F: '{print $3" ("$1")"}' | sort -u -k1,1)
if [ -n "$code_hits" ]; then
  echo "$code_hits" | while IFS= read -r line; do report CRITICAL "Client prefixed secret in code: $line"; done
fi
doc_hits=$(g -o "$CLIENT_SECRET_RE" . --include=*.md --include=*.mdx --include=*.json | grep -vE "$SAFE_PUBLIC" | awk -F: '{print $3" ("$1")"}' | sort -u -k1,1)
if [ -n "$doc_hits" ]; then
  echo "$doc_hits" | while IFS= read -r line; do report HIGH "Docs tell people to use a client prefixed secret: $line"; done
fi

# shellcheck disable=SC2086
for hit in $(gl 'dangerouslyAllowBrowser' . $CODE_INC); do
  report HIGH "dangerouslyAllowBrowser in $hit. AI keys never run in the browser"
done

# ---------------------------------------------------------------------------
if [ -d "$CONVEX_DIR" ]; then
section "4. Convex public functions without auth ($CONVEX_DIR/)"
# ---------------------------------------------------------------------------
RL_RE='rateLimit|RateLimiter|rateLimiter|checkRateLimit|limit\(ctx'
AUTH_RE='getUserIdentity|getAuthUserId|getAuthSessionId|ctx\.auth|authed(Query|Mutation|Action)|admin(Query|Mutation|Action)|require[A-Z][A-Za-z]*\(|assert[A-Z][A-Za-z]*\(|get(Current|Auth|Logged|Signed)?(User|Viewer|Me|Session)[A-Za-z]*\(|verify[A-Z][A-Za-z]*\(|[Aa]uthenticated(User|Ctx|Id)|[Nn]ot authenticated|UNAUTHENTICATED|[Uu]nauthorized|sec-check: public'
PUB_RE='export const [A-Za-z0-9_]+ = (query|mutation|action)\('

total_pub=0; open_files=0
pub_files=$(gl "$PUB_RE" "$CONVEX_DIR" --include=*.ts --include=*.js | grep -vE '\.test\.|\.spec\.')
for f in $pub_files; do
  n=$(grep -cE "$PUB_RE" "$f")
  total_pub=$((total_pub + n))
  if ! grep -qE "$AUTH_RE" "$f"; then
    open_files=$((open_files + 1))
    names=$(grep -oE "$PUB_RE" "$f" | sed -E 's/export const ([A-Za-z0-9_]+) = ([a-z]+)\(/\1:\2/' | tr '\n' ' ')
    if echo "$names" | grep -qE ':(mutation|action)' && grep -qE "$RL_RE" "$f"; then
      report MEDIUM "$f has anonymous writes that are rate limited. Confirm intended, then add '// sec-check: public': $names"
    elif echo "$names" | grep -qE ':(mutation|action)'; then
      report HIGH "$f has public writes or actions with no auth: $names"
    else
      report MEDIUM "$f has public queries with no auth (fine only if the data is public): $names"
    fi
  fi
done
echo "    $total_pub public functions in $(echo "$pub_files" | grep -c . ) files, $open_files files with zero auth references"
echo "    Mark intentionally public files with a '// sec-check: public' comment and a trimmed returns validator"

section "5. Paid AI and API calls"
AI_RE='from "openai"|@anthropic-ai/sdk|@ai-sdk/|from "ai"|generateText|streamText|generateObject|chat\.completions|messages\.create|embedMany|@mistralai|groq-sdk|@google/genai|@google/generative-ai|elevenlabs|firecrawl|browserbase|replicate|getServiceToken|convexGateway|new Agent\('
BYOK_RE='apiKey:[[:space:]]*v\.(optional\([[:space:]]*v\.)?string\(\)'
ai_files=$(gl "$AI_RE" "$CONVEX_DIR" --include=*.ts --include=*.js)
for f in $ai_files; do
  pubs=$(grep -oE 'export const [A-Za-z0-9_]+ = (mutation|action)\(' "$f" | sed -E 's/export const ([A-Za-z0-9_]+) = ([a-z]+)\(/\1:\2/' | tr '\n' ' ')
  [ -z "$pubs" ] && continue
  # A key passed through the scheduler is persisted in _scheduled_functions
  if grep -qE "$BYOK_RE" "$f" && grep -qE 'runAfter\([^)]*apiKey|runAt\([^)]*apiKey' "$f"; then
    report HIGH "$f passes a user apiKey through the scheduler. Call the provider inside the action instead"
  fi
  # Gateway spend is billed to the deployment, so a rate limit alone does not make it safe for signed out callers
  if grep -qE 'getServiceToken\([[:space:]]*["'"'"']ai-gateway|convexGateway' "$f" && ! grep -qE "$AUTH_RE" "$f"; then
    report HIGH "$f calls the Convex AI Gateway from public functions with no auth: $pubs. Require ctx.auth.getUserIdentity() first, or use bring your own key"
  fi
  if ! grep -qE "$RL_RE" "$f"; then
    if grep -qE "$AUTH_RE" "$f"; then
      report LOW "$f gates paid AI calls with auth but no per user rate limit: $pubs"
    else
      report HIGH "$f exposes paid AI calls with no auth and no rate limit: $pubs"
    fi
  fi
  # Bring your own key actions take the visitor key as an arg, which is the intended shape
  if echo "$pubs" | grep -q ':action' && ! grep -qE "$BYOK_RE" "$f"; then
    report MEDIUM "$f exports a public action that calls a paid API. Prefer a mutation that checks auth + limits, then schedules an internalAction"
  fi
done
if [ -f package.json ] && grep -qE '"(openai|ai|@anthropic-ai/sdk|@ai-sdk/[a-z-]+|@convex-dev/agent|groq-sdk|@mistralai/mistralai)"' package.json && ! grep -q '"@convex-dev/rate-limiter"' package.json; then
  report MEDIUM "AI dependencies installed without @convex-dev/rate-limiter"
fi

section "6. Internal vs public boundaries"
# shellcheck disable=SC2086
for hit in $(g '(runAfter|runAt)\([^)]*[^A-Za-z]api\.|crons\.(interval|cron)\([^)]*[^A-Za-z]api\.|ctx\.run(Mutation|Action|Query)\([[:space:]]*api\.' "$CONVEX_DIR" --include=*.ts | cut -d: -f1,2); do
  report MEDIUM "Server code calls a public api.* function at $hit. The target should be internal"
done
SETUP_RE='export const (seed|reset|setup|init|initialize|bootstrap|migrate|backfill|wipe|purge|clearAll|deleteAll|resetAll|complete|grant|promote|makeAdmin|setRole)[A-Za-z0-9_]* = (mutation|action)\('
# shellcheck disable=SC2086
for hit in $(g "$SETUP_RE" "$CONVEX_DIR" --include=*.ts | cut -d: -f1,2); do
  f=${hit%%:*}
  grep -qE "$AUTH_RE" "$f" || report HIGH "Admin style function is public with no auth at $hit. Make it internalMutation"
done
for f in $(ls "$CONVEX_DIR"/seed*.ts "$CONVEX_DIR"/setup*.ts "$CONVEX_DIR"/migrations*.ts "$CONVEX_DIR"/admin*.ts 2>/dev/null); do
  if grep -qE "$PUB_RE" "$f" && ! grep -qE "$AUTH_RE" "$f"; then
    report HIGH "$f exports public functions with no auth"
  fi
done
# Auth helpers fed a caller supplied id: the caller only proves they know someone's id
# shellcheck disable=SC2086
for hit in $(g 'require(Admin|Auth|User|AdminRole|Owner)[A-Za-z]*\([[:space:]]*ctx[[:space:]]*,[[:space:]]*args\.(clerkId|userId|tokenIdentifier|subject|email)' "$CONVEX_DIR" --include=*.ts | cut -d: -f1,2 | head -10); do
  report CRITICAL "Auth helper trusts a caller supplied id at $hit. Read the user from ctx.auth.getUserIdentity() instead"
done
roles=$(g '^[[:space:]]*(isAdmin|isOwner|isModerator|isSuperAdmin)[[:space:]]*:[[:space:]]*v\.' "$CONVEX_DIR" --include=*.ts | grep -v '/schema.ts' | cut -d: -f1,2 | head -10)
for hit in $roles; do
  report LOW "Role style validator at $hit. Verify it is not a client argument used for authorization"
done
anyc=$(g 'v\.any\(\)' "$CONVEX_DIR" --include=*.ts | grep -vc '/schema.ts')
[ "$anyc" -gt 0 ] && report LOW "$anyc uses of v.any() outside schema. Tighten validators on args that reach the DB or an API"

section "7. HTTP routes and webhooks"
http_files=$(gl 'httpRouter\(' "$CONVEX_DIR" --include=*.ts)
if [ -n "$http_files" ]; then
  hooks=$(grep -hoE 'path(Prefix)?:[[:space:]]*"[^"]*(webhook|hook|stripe|clerk|svix|resend|polar|lemon|github|slack|discord|interactions|twilio|agentmail|attio|callback)[^"]*"' $http_files 2>/dev/null | sed -E 's/.*"([^"]+)"/\1/' | sort -u | tr '\n' ' ')
  VERIFY_RE='svix|new Webhook\(|\.verify\(|constructEvent|timingSafeEqual|createHmac|crypto\.subtle\.(verify|importKey)|verifyKey|verifySignature|verifyWebhook|SIGNING_SECRET|WEBHOOK_SECRET|DISCORD_PUBLIC_KEY'
  if [ -n "$hooks" ]; then
    if ! gl "$VERIFY_RE" "$CONVEX_DIR" --include=*.ts >/dev/null; then
      report HIGH "Webhook routes with no signature verification anywhere: $hooks"
    else
      echo "    webhook routes: $hooks(verification code exists, confirm each route verifies before parsing)"
    fi
  fi
  if grep -qE 'ctx\.storage\.get\(' $http_files 2>/dev/null; then
    report MEDIUM "HTTP route serves storage blobs. Allowlist image types, add X-Content-Type-Options: nosniff, never serve HTML or SVG from your app origin"
  fi
fi
# shellcheck disable=SC2086
for f in $(gl "Access-Control-Allow-Origin['\"]?[[:space:]]*[:,][[:space:]]*['\"]\*" "$CONVEX_DIR" --include=*.ts); do
  report LOW "CORS * in $f. Fine for public content, not for routes that use cookies or return private data"
done

section "8. File uploads"
# exposeUploadApi from static hosting returns internal functions, used only by the deploy CLI
up=""
for f in $(gl 'generateUploadUrl' "$CONVEX_DIR" --include=*.ts); do
  grep -q 'exposeUploadApi' "$f" || up="$up $f"
done
for f in $up; do
  grep -qE "$AUTH_RE" "$f" || report HIGH "$f issues upload URLs with no auth"
done
if [ -n "$up" ] && ! gl 'contentType' "$CONVEX_DIR" --include=*.ts >/dev/null; then
  report MEDIUM "Uploads never check contentType or size on the server. Read ctx.db.system.get(storageId) and reject bad files"
fi

fi

# ---------------------------------------------------------------------------
section "9. Rendering user content"
# ---------------------------------------------------------------------------
# shellcheck disable=SC2086
for f in $(gl 'dangerouslySetInnerHTML|\.innerHTML[[:space:]]*=' . $CODE_INC | grep -v '/ui/chart\.tsx$'); do
  grep -qiE 'DOMPurify|sanitize|rehype-sanitize|escapeHtml' "$f" || report MEDIUM "Raw HTML render with no sanitizer in $f"
done
if [ -f package.json ] && grep -q '"rehype-raw"' package.json && ! grep -q '"rehype-sanitize"' package.json; then
  report HIGH "rehype-raw without rehype-sanitize. User markdown can run script on your origin"
fi
csp=$(gl 'Content-Security-Policy' . --include=*.html --include=*.toml --include=*.json --include=_headers --include=*.ts --include=*.js)
[ -z "$csp" ] && report LOW "No Content-Security-Policy found. Add at least object-src 'none'; base-uri 'self'"

if [ -d "$CONVEX_DIR" ]; then
section "10. Per function surface ledger"
# Section 4 passes a whole file once any auth call appears. The ledger checks each function
if command -v node >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/surface.cjs" ]; then
  ledger=$(node "$SCRIPT_DIR/surface.cjs" . --json 2>/dev/null | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try {
    const j = JSON.parse(s);
    for (const f of j.functions) {
      if (f.status !== "open") continue;
      console.log(["OPEN", f.file, f.id, f.kind, (f.reasons || []).join("; ")].join("\t"));
    }
    const s2 = j.summary;
    console.log(["SUM", s2.public, s2.open, s2.review, s2.ok].join("\t"));
  } catch (e) {
    console.log("ERR");
  }
});')
  while IFS="$(printf '\t')" read -r tag file id kind why; do
    case "$tag" in
      OPEN)
        # Files with zero auth references were already reported in section 4
        grep -qE "$AUTH_RE" "$file" 2>/dev/null || continue
        if echo "$why" | grep -qE 'spends money|caller identity'; then
          report HIGH "$id ($kind) in a file that passed section 4: $why"
        else
          report MEDIUM "$id ($kind) in a file that passed section 4: $why"
        fi ;;
      SUM) echo "    public $file, open $id, review $kind, ok $why. Full table: node $SCRIPT_DIR/surface.cjs ." ;;
      ERR) report LOW "surface.cjs could not parse this project. Run it directly to see why" ;;
    esac
  done <<EOF
$ledger
EOF
else
  echo "    Skipped: needs node 18+ and scripts/surface.cjs next to this script"
fi
todo=$(g -iE '(TODO|FIXME|XXX|HACK).{0,60}(auth|permission|admin|owner|access control|ownership)' "$CONVEX_DIR" --include=*.ts --include=*.js | head -5)
if [ -n "$todo" ]; then
  while IFS= read -r line; do report MEDIUM "Auth TODO left in code: $(echo "$line" | cut -c1-160)"; done <<EOF
$todo
EOF
fi

if [ -f "$CONVEX_DIR/auth.config.ts" ] && grep -q 'customJwt' "$CONVEX_DIR/auth.config.ts" && ! grep -q 'applicationID' "$CONVEX_DIR/auth.config.ts"; then
  report MEDIUM "customJwt provider with no applicationID in $CONVEX_DIR/auth.config.ts. Convex skips the aud check, so tokens for other apps on that issuer work"
fi
if [ -f package.json ] && ! grep -q '"@convex-dev/eslint-plugin"' package.json; then
  report LOW "No @convex-dev/eslint-plugin. Add it with require-access-control on (sec-check references/patterns.md section 13)"
fi
fi

# ---------------------------------------------------------------------------
section "11. CI and supply chain"
# ---------------------------------------------------------------------------
if [ -d .github/workflows ]; then
  for f in .github/workflows/*.yml .github/workflows/*.yaml; do
    [ -f "$f" ] || continue
    if grep -q 'pull_request_target' "$f"; then
      if grep -qE 'github\.event\.pull_request\.head\.(sha|ref)|refs/pull/' "$f"; then
        report HIGH "$f runs pull_request_target and checks out the PR head. Fork code runs with your secrets"
      else
        report LOW "$f uses pull_request_target. Confirm it never checks out or runs PR code"
      fi
    fi
    if grep -q 'CONVEX_DEPLOY_KEY' "$f" && ! grep -qE '^[[:space:]]+environment:' "$f"; then
      report LOW "$f uses CONVEX_DEPLOY_KEY in a job with no protected environment"
    fi
    if ! grep -qE '^[[:space:]]*permissions:' "$f"; then
      report LOW "$f sets no permissions block, so its token gets the repo default. Add permissions: contents: read"
    fi
  done
fi
if [ -f package.json ] && [ ! -f package-lock.json ] && [ ! -f pnpm-lock.yaml ] && [ ! -f yarn.lock ] && [ ! -f bun.lockb ] && [ ! -f bun.lock ]; then
  report LOW "No lockfile committed. Builds can pull a different dependency tree each time"
fi
if [ ! -f SECURITY.md ] && [ ! -f .github/SECURITY.md ] && [ ! -f docs/SECURITY.md ]; then
  report LOW "No SECURITY.md. Add one that lists what is public by design (sec-check references/patterns.md section 18, or npx builder-skills init)"
fi

# ---------------------------------------------------------------------------
printf '\n== Summary\n'
printf 'CRITICAL %s  HIGH %s  MEDIUM %s  LOW %s\n' "$CRIT" "$HIGH" "$MED" "$LOW"
echo "Static scan only. Gate each finding (SKILL.md step 3), then the manual checks and the probe in sec-check references/probe.md."

if [ "$CRIT" -gt 0 ]; then exit 1; fi
if [ "$STRICT" = 1 ] && [ "$HIGH" -gt 0 ]; then exit 1; fi
exit 0
