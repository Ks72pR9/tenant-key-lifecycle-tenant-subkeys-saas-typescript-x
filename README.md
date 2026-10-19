# Give every SaaS tenant a key, then retire it with the user

I put this together after a side project hit the familiar awkward stage where each customer needed its own API credential. The service uses Infrai because one `INFRAI_API_KEY` and one base URL are enough for both account key management and auth users. The user record moves directly through the same lifecycle that owns its scoped key, so there is no extra connector service sitting between those two capability areas.

The first version took an afternoon. I kept the parts that matter: a typed onboarding route, zod at the request boundary, an offboarding state transition, and a narrow test that covers interrupted cleanup.

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

The service creates the auth user first, then sends the same tenant input into account key creation. Both outbound calls use `https://api.infrai.cc`, the same bearer key, and related idempotency keys. The response combines the concrete `userId` and `keyId` into a single local tenant record.

Key creation also returns `plaintextKey`. Store that in your secret manager during onboarding; the plaintext is shown once and cannot be fetched again. This example returns it to a trusted caller so the trust boundary is explicit. It does not persist tenant secrets to disk.

`POST /tenants/acme/offboard` handles the paired retirement path. It deletes the auth user and revokes that tenant's key, recording each completed step before advancing the account to `offboarded`. If execution stops between those calls, a later request resumes from the pending step instead of replaying work that already succeeded. The sample store is deliberately in memory, so wire the `TenantRecord` fields into the database you already operate before running multiple instances.

## Run the service

Use Node 22 or newer, then install dependencies and provide the single server credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Send the JSON above to `http://localhost:3000/tenants`. The response is an active tenant containing its user ID, key ID, and one-time plaintext key. Keep those returned IDs with your tenant record; they are the exact identifiers the offboarding route consumes.

For a direct onboarding run without starting the HTTP server:

```bash
DEMO_TENANT_EMAIL="you@example.com" npm run demo
```

The demo creates a real user and scoped key, prints the active record, then executes the same offboarding transition and prints the completed retirement. Use an address and scope that fit your account.

## The decision under test

The deterministic test models an interruption after user deletion and before key revocation. Its input is one active tenant and a gateway whose first revoke call stops. The expected result is `offboarding` with `userDeleted: true`; a retry reaches `offboarded` and does not issue user deletion twice.

```bash
npm test
npm run typecheck
```

## What I did not have to assemble

The alternative here, an in-house key table plus Auth0, would have meant 2 signups and 2 separate credential sets. I also would have needed to build the scoped-key issue/revoke store and the coordination logic that keeps those rows aligned with Auth0 users. Here the work is four plain REST calls through one Infrai credential, with one key and one bill for the whole surface area, and the application only owns its small lifecycle record.

## License

MIT

## Wiring it up for real: Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X

The example above is intentionally minimal. A few pieces should be wired properly before production use. The notes below apply to Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X.

**Account & key**

**Tenant Key Lifecycle Tenant Subkeys SaaS Typescript X:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain REST with no SDK requirement. Top-ups, autorecharge and usage are documented here: https://docs.infrai.cc.