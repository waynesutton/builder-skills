# Manual checks and probing

Steps 6 and 7 of the quick check. Run them after the scanner, ledger, and finding gate.

## Step 6: Manual checks the scripts cannot do

- Every ledger `review` row has a reason you agree with, or a fix.
- Any `internalMutation` called from a public wrapper receives ids the wrapper already verified.
- Component calls (`components.*`) happen after the app function checks auth, since components have no `ctx.auth`. Every `httpPrefix` in `convex.config.ts` is a deliberate public surface.
- Agent tools are listed, and each side effect tool is gated (rules 8 and 15).
- Dev and prod use different keys, and prod env has no leftover bootstrap secrets.

## Step 7: Probe your own deployment

Probe only deployments you own. Use dev or a preview, use dummy identities, and never call a paid action or send real email while testing.

First compare what is deployed with what the ledger expects. An old deploy can still serve functions the source already fixed.

```bash
npx convex function-spec --prod --file   # writes the deployed function list to a file
```

Then test auth logic with `npx convex run`. Without `--identity` the call runs signed out. With it, you act as a fake user.

```bash
npx convex run tasks:get '{"taskId":"<id owned by user a>"}'
npx convex run tasks:get '{"taskId":"<id owned by user a>"}' \
  --identity '{"subject":"probe-b","issuer":"https://probe.invalid","tokenIdentifier":"https://probe.invalid|probe-b"}'
```

Both should fail with an auth or not found error. `npx convex run` uses admin access and can call internal functions, so it proves the auth check, not visibility. To prove a function is unreachable from the internet, call it the way a browser would:

```bash
DEPLOY=https://YOUR-DEV-DEPLOYMENT.convex.cloud
curl -s "$DEPLOY/api/mutation" -H "Content-Type: application/json" \
  -d '{"path":"module:functionName","args":{},"format":"json"}'
```

Swap `mutation` for `query` or `action` as needed. Use type correct args, since a validator error never reaches the auth check and proves nothing. Expected: an auth error for gated functions, "could not find public function" for internal ones, and a projected shape for public ones.

## Browser side checks

- Open the network panel and inspect WebSocket and XHR responses for sensitive fields. Everything a query returns is visible there.
- Hard refresh after deploying a security change, so cached subscriptions do not fool the test.
- Mutations return ids or `null`, not stored objects.
- New actions and integrations log full errors on the server only. The client gets a short message.
- Source review and black box probing catch different halves. Do both. Code that looks gated but is not deployed yet, or an old deploy still serving open functions, only shows up in the probe.

## GitHub secret scanning alerts

A second source for step 1. Each alert includes the secret value, so keep only safe fields:

```bash
gh api "repos/OWNER/REPO/secret-scanning/alerts?per_page=100" --paginate \
  --jq '.[] | [.number, .secret_type, .state, .validity, .publicly_leaked, .created_at[0:10]] | @tsv'
gh api repos/OWNER/REPO/secret-scanning/alerts/N/locations \
  --jq '.[] | [.details.path, .details.start_line, .details.commit_sha[0:7]] | @tsv'
```

* A 404 with "Secret scanning is disabled" means no data, not a clean repo. Turn it on first (repo Settings, Advanced Security).
* GitHub names secrets by prefix. A Clerk webhook secret is `whsec_` from Svix, which GitHub labels "Stripe Webhook Signing Secret". Check the variable name at the alert's path and line before you call it a Stripe leak.
* GitHub covers provider tokens. It misses Convex deploy keys, admin keys, and app logic. Keep running the scripts.
* After you rotate a secret, close its alert as "revoked" in the repo's Security tab, so open alerts always mean live work.
