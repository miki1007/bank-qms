# Architecture overview

Transport controllers validate input and delegate to application/domain services. `TicketWorkflowService` locks, validates, mutates, and records every ticket transition. Prisma is the persistence adapter. PostgreSQL constraints backstop application invariants. Real-time messages publish after commit and instruct clients to update or refetch authoritative snapshots.

The monorepo separates `api`, `customer-web`, `kiosk-web`, `display-web`, and `staff-web`, plus shared types, validation, UI, configuration, and localization packages. `apps/android` and `apps/ios` package the customer and staff experiences as independent installable applications. Manager and teller screens have separate protected routes; API guards enforce role and branch scope independently of navigation visibility.

The primary deployment surfaces are Bank QMS Customer (Android/iOS), Bank QMS Staff (Android/iOS), Manager Dashboard (web), and Public Display (web). The customer kiosk is a secondary branch fallback rather than a dependency of the mobile customer journey. All surfaces share the backend and authoritative queue state.

Customer and staff identities are separate security domains. Both use short-lived access tokens held in memory and rotating refresh tokens in strict HTTP-only cookies, but their JWT `kind`, guards, tables, session records, and authorized routes cannot be interchanged. Customer ticket ownership is enforced by `tickets.customer_id`; kiosk tickets remain anonymous and require private lookup proof.

The owner-only hosted Site is a portability adapter, not a second production architecture. Its D1 tables retain their original `qms_demo_*` names solely to preserve applied migration compatibility. User-facing routes and symbols use `showcase`; the deployable target is always NestJS, PostgreSQL, and Socket.IO.
