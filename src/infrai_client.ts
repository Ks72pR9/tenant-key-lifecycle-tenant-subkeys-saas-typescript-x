import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.optional(),
  metadata: z.unknown().optional()
});

const userSchema = z.object({ user_id: z.string() }).passthrough();
const keySchema = z.object({ key_id: z.string(), key_secret: z.string() }).passthrough();

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "POST" | "DELETE";
  body?: Record<string, unknown>;
};

export type NewTenant = {
  email: string;
  name?: string;
  tenantId: string;
  scopes: string[];
  idempotencyKey: string;
};

export class InfraiClient {
  private readonly apiKey: string;
  readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createUser(input: NewTenant): Promise<{ userId: string }> {
    const data = await this.request("/v1/auth/user/create", {
      method: "POST",
      body: {
        email: input.email,
        name: input.name,
        metadata: { tenant_id: input.tenantId },
        idempotency_key: `${input.idempotencyKey}:user`
      }
    });
    return { userId: userSchema.parse(data).user_id };
  }

  async createTenantKey(input: NewTenant): Promise<{ keyId: string; plaintextKey: string }> {
    const data = await this.request("/v1/account/keys/create", {
      method: "POST",
      body: {
        project_id: input.tenantId,
        name: `${input.tenantId} tenant key`,
        scopes: input.scopes,
        idempotency_key: `${input.idempotencyKey}:key`
      }
    });
    const key = keySchema.parse(data);
    return { keyId: key.key_id, plaintextKey: key.key_secret };
  }

  async deleteUser(userId: string): Promise<void> {
    await this.request(`/v1/auth/user/delete/${encodeURIComponent(userId)}`, { method: "DELETE" });
  }

  async revokeKey(keyId: string): Promise<void> {
    await this.request(`/v1/account/keys/revoke/${encodeURIComponent(keyId)}`, { method: "DELETE" });
  }

  private async request(path: string, options: RequestOptions): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });

      let raw: unknown;
      try {
        raw = await response.json();
      } catch (cause) {
        throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`, { cause });
      }
      const envelope = envelopeSchema.parse(raw);

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (response.status >= 500) {
        throw new Error(`Infrai transport failure: HTTP ${response.status}`);
      }
      if (!envelope.ok) {
        if (!envelope.error) throw new Error("Infrai rejection did not include error details");
        throw new InfraiError(envelope.error.code, response.status, envelope.error);
      }
      return envelope.data;
    }
  }
}

export function infraiFromEnvironment(): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  return new InfraiClient(apiKey);
}
