# API documentation

Swagger is generated at `/docs`; the API prefix is `/api/v1`. Customer and staff clients send their own typed `Authorization: Bearer <access-token>` and cannot exchange tokens across guards. Kiosk/display bootstrap and ticket creation use branch-limited device credentials. Refresh authentication uses separate strict HTTP-only cookies for customer and staff sessions. Domain errors use `{ error: { code, message, requestId, details } }`.

Customer account routes are `/customer-auth/register`, `/customer-auth/login`, `/customer-auth/refresh`, `/customer-auth/logout`, and `/customer-auth/me`. Authenticated customer queue routes are `/customers/branches`, `/customers/branches/:branchCode/services`, `/customers/branches/:branchCode/tickets`, `/customers/me/tickets`, `/customers/tickets/:id`, and `/customers/tickets/:id/cancel`. Ticket ownership is enforced by the backend.

Public display events contain only public number, counter, service, call time, and recall status. Lookup codes, tokens, password material, priority reasons, and internal notes are never included.

Ticket creation carries an idempotency UUID in its request body. Every teller ticket mutation (`call-next`, `recall`, `start`, `complete`, `no-show`, and `transfer`) requires an `Idempotency-Key` UUID header. The server serializes matching keys with a PostgreSQL transaction-scoped advisory lock, writes the state change, event, and idempotency record atomically, and returns `idempotentReplay: true` without publishing duplicate real-time events on a replay.
