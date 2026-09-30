import type { NewTenant } from "./infrai_client.ts";

export type TenantRecord = {
  tenantId: string;
  userId: string;
  keyId: string;
  status: "active" | "offboarding" | "offboarded";
  userDeleted: boolean;
  keyRevoked: boolean;
};

export type ProvisionedTenant = TenantRecord & {
  plaintextKey: string;
};

export interface TenantGateway {
  createUser(input: NewTenant): Promise<{ userId: string }>;
  createTenantKey(input: NewTenant): Promise<{ keyId: string; plaintextKey: string }>;
  deleteUser(userId: string): Promise<void>;
  revokeKey(keyId: string): Promise<void>;
}

export class TenantLifecycle {
  private readonly tenants = new Map<string, TenantRecord>();
  private readonly gateway: TenantGateway;

  constructor(gateway: TenantGateway) {
    this.gateway = gateway;
  }

  async onboard(input: NewTenant): Promise<ProvisionedTenant> {
    if (this.tenants.has(input.tenantId)) throw new Error("Tenant already exists");
    const user = await this.gateway.createUser(input);
    const key = await this.gateway.createTenantKey(input);
    const record: TenantRecord = {
      tenantId: input.tenantId,
      userId: user.userId,
      keyId: key.keyId,
      status: "active",
      userDeleted: false,
      keyRevoked: false
    };
    this.tenants.set(input.tenantId, record);
    return { ...record, plaintextKey: key.plaintextKey };
  }

  async offboard(tenantId: string): Promise<TenantRecord> {
    const record = this.tenants.get(tenantId);
    if (!record) throw new Error("Tenant not found");
    if (record.status === "offboarded") return { ...record };

    record.status = "offboarding";
    if (!record.userDeleted) {
      await this.gateway.deleteUser(record.userId);
      record.userDeleted = true;
    }
    if (!record.keyRevoked) {
      await this.gateway.revokeKey(record.keyId);
      record.keyRevoked = true;
    }
    record.status = "offboarded";
    return { ...record };
  }

  get(tenantId: string): TenantRecord | undefined {
    const record = this.tenants.get(tenantId);
    return record ? { ...record } : undefined;
  }
}
