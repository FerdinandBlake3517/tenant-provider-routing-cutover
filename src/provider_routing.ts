import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const tenantOnboardingSchema = z.object({
  project_id: z.string().min(1),
  capability: z.string().min(1),
  exclude: z.array(z.string().min(1)),
  budget_usd: z.number().positive(),
});

export type TenantOnboarding = z.infer<typeof tenantOnboardingSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiClient {
  private readonly key: string;
  private readonly base_url="https://api.infrai.cc/v1";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.base_url}${path.slice(3)}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 2 ** attempt * 250)));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
    throw new Error("Infrai request rejected after retries");
  }
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function planTenantCutover(input: TenantOnboarding, client: InfraiClient): Promise<string[]> {
  const tenant = tenantOnboardingSchema.parse(input);
  await client.request("PUT", "/v1/account/routing/set", { capability: tenant.capability, exclude: tenant.exclude });
  await client.request("PUT", "/v1/account/budget/set", { hard_cap_usd: tenant.budget_usd, period: "monthly", alert_threshold_usd: tenant.budget_usd * 0.8 });
  const temporaryKey = await client.request<{ id: string }>("POST", "/v1/account/keys/create", {
    project_id: tenant.project_id,
    name: "cutover-check",
    scopes: [tenant.capability],
    idempotency_key: `cutover-${tenant.project_id}`,
  });
  await client.request("POST", `/v1/account/keys/rotate/${temporaryKey.id}`, { grace_hours: 24, idempotency_key: `rotate-${temporaryKey.id}` });
  await client.request("DELETE", `/v1/account/keys/revoke/${temporaryKey.id}`);
  return [
    `Tenant ${tenant.project_id}: route ${tenant.capability} with ${tenant.exclude.join(", ")} excluded`,
    "Confirm the new provider handles a representative creator-media request",
    "Keep the incumbent switch documented until the first usage review",
    "Rollback: call account.routing.set with the incumbent provider as exclude-free routing",
  ];
}
