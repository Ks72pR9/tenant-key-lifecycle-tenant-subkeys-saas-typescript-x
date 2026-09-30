import assert from "node:assert/strict";
import test from "node:test";
import type { NewTenant } from "./infrai_client.ts";
import { TenantLifecycle, type TenantGateway } from "./tenant_lifecycle.ts";

const input: NewTenant = {
  tenantId: "acme",
  email: "owner@acme.test",
  scopes: ["reports:read"],
  idempotencyKey: "signup-acme-001"
};

test("offboarding resumes at key revocation without deleting the user twice", async () => {
  const calls: string[] = [];
  let revokeAttempts = 0;
  const gateway: TenantGateway = {
    async createUser() { return { userId: "user-1" }; },
    async createTenantKey() { return { keyId: "key-1", plaintextKey: "one-time-value" }; },
    async deleteUser(userId) { calls.push(`delete:${userId}`); },
    async revokeKey(keyId) {
      calls.push(`revoke:${keyId}`);
      revokeAttempts += 1;
      if (revokeAttempts === 1) throw new Error("simulated interrupted operation");
    }
  };
  const lifecycle = new TenantLifecycle(gateway);
  await lifecycle.onboard(input);

  await assert.rejects(lifecycle.offboard("acme"));
  assert.deepEqual(lifecycle.get("acme"), {
    tenantId: "acme",
    userId: "user-1",
    keyId: "key-1",
    status: "offboarding",
    userDeleted: true,
    keyRevoked: false
  });

  const completed = await lifecycle.offboard("acme");
  assert.equal(completed.status, "offboarded");
  assert.deepEqual(calls, ["delete:user-1", "revoke:key-1", "revoke:key-1"]);
});
