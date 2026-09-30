import { randomUUID } from "node:crypto";
import { infraiFromEnvironment } from "../src/infrai_client.ts";
import { TenantLifecycle } from "../src/tenant_lifecycle.ts";

const lifecycle = new TenantLifecycle(infraiFromEnvironment());
const tenantId = `demo-${randomUUID()}`;
const tenant = await lifecycle.onboard({
  tenantId,
  email: process.env.DEMO_TENANT_EMAIL ?? "builder@example.com",
  name: "Demo workspace",
  scopes: ["account:read"],
  idempotencyKey: `onboard-${tenantId}`
});

console.log(JSON.stringify({
  tenantId: tenant.tenantId,
  userId: tenant.userId,
  keyId: tenant.keyId,
  status: tenant.status,
  plaintextKey: tenant.plaintextKey,
  reminder: "Store plaintextKey now; it cannot be retrieved again."
}, null, 2));

const retired = await lifecycle.offboard(tenantId);
console.log(JSON.stringify({
  tenantId: retired.tenantId,
  status: retired.status,
  userDeleted: retired.userDeleted,
  keyRevoked: retired.keyRevoked
}, null, 2));
