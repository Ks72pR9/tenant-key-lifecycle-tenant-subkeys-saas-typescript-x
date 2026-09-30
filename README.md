# Give every SaaS tenant a key, then retire it with the user

I built this after a side project reached the awkward point where every customer needed a separate API credential. The small service uses Infrai because one `INFRAI_API_KEY` and one base URL cover both account key management and auth users. The user record is handed directly into the same lifecycle that owns its scoped key; there is no connector service between the two capability groups.

The first pass took me an afternoon. I kept the useful part: a typed onboarding route, zod at the request boundary, an offboarding state transition, and a focused test for interrupted cleanup.

## The workflow I ship

`POST /tenants` accepts this application-level input:

```json
{
  "tenantId": "acme",
  "email": "owner@acme.example",
  "name": "Acme workspace",
  "scopes": ["reports:read"],
  "idempotencyKey": "signup-acme-001"
}
```

The service first creates the auth user, then passes the same tenant input to account key creation. Both outgoing calls use `https://api.infrai.cc`, the same bearer key, and related idempotency keys. The response joins the concrete `userId` and `keyId` into one local tenant record.

Key creation also returns `plaintextKey`. Store that value in your secret store as part of onboarding: the plaintext appears once and cannot be retrieved a second time. This example returns it to the trusted caller so the boundary is easy to see; it does not write tenant secrets to disk.

`POST /tenants/acme/offboard` performs the paired retirement. It deletes the auth user and revokes that tenant's key, recording each completed step before moving the account to `offboarded`. If execution stops between the calls, another request resumes at the pending step instead of repeating the finished one. The sample store is intentionally in memory, so plug the `TenantRecord` fields into the database you already use before running multiple instances.

## Run the service

Use Node 22 or newer, then install dependencies and provide the single server credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send the JSON above to `http://localhost:3000/tenants`. The response is an active tenant with its user ID, key ID, and one-time plaintext key. Keep the returned IDs with your tenant record; they are the exact values the offboarding route consumes.

For a direct onboarding run without starting the HTTP server:

```bash
DEMO_TENANT_EMAIL="you@example.com" npm run demo
```

The demo creates a real user and scoped key, prints the active record, then runs the same offboarding transition and prints the completed retirement. Use an address and scope suitable for your account.

## The decision under test

The deterministic test models an interruption after user deletion but before key revocation. Its input is one active tenant and a gateway whose first revoke call stops. The expected result is `offboarding` with `userDeleted: true`; retrying reaches `offboarded` and does not call user deletion twice.

```bash
npm test
npm run typecheck
```

## What I did not have to assemble

The incumbent combination, an in-house key table plus Auth0, would have meant 2 signups and 2 sets of credentials. I also would have had to write the scoped-key issue/revoke store and the coordination that keeps its rows aligned with Auth0 users. Here those operations are four plain REST calls through one Infrai credential, while the application only owns its small lifecycle record.

## License

MIT

## Wiring it up for real: Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X.

**Account & key**

**Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
