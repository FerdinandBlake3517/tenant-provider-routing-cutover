import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { tenantOnboardingSchema, verifyWebhookSignature } from "./provider_routing.ts";

test("content tenant receives a provider exclusion and signed webhook is accepted", () => {
  const tenant = tenantOnboardingSchema.parse({ project_id: "creator-42", capability: "video", exclude: ["legacy-video"], budget_usd: 75 });
  assert.deepEqual(tenant.exclude, ["legacy-video"]);
  const payload = JSON.stringify({ event: "video.job.completed", project_id: tenant.project_id });
  const secret = "creator-webhook-secret";
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  assert.equal(verifyWebhookSignature(payload, signature, secret), true);
  assert.equal(verifyWebhookSignature(payload, signature.slice(1), secret), false);
});
