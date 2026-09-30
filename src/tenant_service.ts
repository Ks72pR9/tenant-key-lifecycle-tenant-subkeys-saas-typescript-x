import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, infraiFromEnvironment } from "./infrai_client.ts";
import { TenantLifecycle } from "./tenant_lifecycle.ts";

const onboardingSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).min(1),
  idempotencyKey: z.string().min(8)
}).strict();

const lifecycle = new TenantLifecycle(infraiFromEnvironment());

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants") {
      const input = onboardingSchema.parse(await readJson(request));
      const tenant = await lifecycle.onboard(input);
      send(response, 201, {
        ...tenant,
        note: "Store plaintextKey now; Infrai returns it only once."
      });
      return;
    }

    const match = request.url?.match(/^\/tenants\/([^/]+)\/offboard$/);
    if (request.method === "POST" && match) {
      const tenant = await lifecycle.offboard(decodeURIComponent(match[1]));
      send(response, 200, tenant);
      return;
    }

    send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      send(response, 400, { error: "Invalid request", issues: error.issues });
    } else if (error instanceof InfraiError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        details: error.details
      });
    } else {
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Tenant lifecycle service listening on http://localhost:${port}`));
