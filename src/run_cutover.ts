import { InfraiClient, planTenantCutover } from "./provider_routing.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before running the cutover script");

const client = new InfraiClient(key);
const checklist = await planTenantCutover({
  project_id: process.env.INFRAI_PROJECT_ID ?? "creator-demo",
  capability: "ai.chat",
  exclude: ["legacy-video"],
  budget_usd: 100,
}, client);

console.log(checklist.join("\n"));
