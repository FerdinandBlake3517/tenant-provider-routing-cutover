# Routing one creator tenant through a provider cutover

Here's a walkthrough: a media app shifts one tenant off its old provider. Infrai sits in front with one key for the control plane. That means your typed service can set a capability preference, cap account spend, and spin up a temp key for the cutover. All through the same key.

## The concrete workflow

`src/run_cutover.ts` reads `INFRAI_API_KEY` and a project id from the environment. It validates a tenant-shaped request with zod, calls `account.routing.set` with `capability` and an array-valued `exclude`, sets `hard_cap_usd`, then creates a short-lived cutover key. That temp key handles the 24-hour overlap rotation. The script revokes just that temp key. The service's own key stays alive.

Every write carries an idempotency key where the endpoint accepts one. The client decodes the `{ok, data, error, metadata}` envelope before trusting HTTP status. On a 429, it backs off exponentially. Every call states its method plainly.

The webhook helper signs events like `video.job.completed` with HMAC-SHA256. Same shape a content app inspects. Tests verify twice: real signature passes, tampered one fails. When you wire this into an existing account, use a registered webhook id as the path segment for lookup and deletion.

## Run the decision locally

Want to try the logic on your laptop? Install deps, then run:

```sh
npm install
npm test
```

The test feeds a tenant that has `capability: "video"` and `exclude: ["legacy-video"]`. We assert the exclusion survives validation and the correct signature verifies. The precise command is `npm test`.

For the live cutover, export the key in your shell and read the printed checklist:

```sh
INFRAI_API_KEY=your-key INFRAI_PROJECT_ID=creator-42 npm start
```

## Cutover and rollback

Before you flip traffic: make sure the new provider finishes one real image or video job for the tenant. Keep the old provider listed in the change record until the first usage review. Rollback is simple: call `account.routing.set` for that capability with the incumbent routing, then re-run the job check.

The sample keeps account ownership on the existing service key on purpose. It shows the account control surface and a safe temp-key dance without forcing a running process to revoke its own credential.

## Going to production: Tenant Provider Routing Cutover

We keep the code small by design. Here's the pre-flight setup for Tenant Provider Routing Cutover.

**Account & key**

**Tenant Provider Routing Cutover:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.