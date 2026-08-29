# Known limitations at this checkpoint

- The private hosted showcase uses a D1 persistence adapter and two-second authoritative snapshot polling because the Sites runtime cannot connect to PostgreSQL over raw TCP or host the Socket.IO process. The local/Docker architecture remains PostgreSQL, NestJS, and Socket.IO.
- The hosted showcase demonstrates ticket issuance/private-proof cancellation, priority-aware Call Next, recall, start, complete, no-show/requeue, transfer, public display, role-protected staff sessions, manager KPIs, and an event trail. Device provisioning, configuration CRUD, report exports, and the full audit interface remain available only in the local monorepo implementation.
- The clean GitHub workflow now verifies PostgreSQL migrations, seed execution, API integration, Playwright acceptance, and repeated Call Next concurrency. Browser-level Socket.IO reconnect/display behavior is still covered by implementation contracts rather than a dedicated Playwright event test.
- Ticket creation and all teller ticket actions are idempotent; customer cancellation safely returns the same terminal ticket. Counter-session open, pause, resume, and close rely on locked state checks but do not yet replay stored responses.
- Customer registration does not yet send email-verification or password-recovery messages; those flows require a selected transactional email provider.
- Manager cancellation of a called ticket and device-management screens/endpoints remain to be completed.
- Service/counter/staff manager pages support list/create and the critical backend update rules; richer inline edit, deactivation, unlock, and reset-password dialogs remain UI work.
- The staff build separates React, charts, and icons into cacheable chunks. Route-level lazy loading remains an optional production optimization.
- Amharic strings exist as a localization foundation; the complete translated interface is a future enhancement.
- Printer output uses the browser print path; thermal-printer driver integration is intentionally outside MVP scope.
- Both Android debug APKs compile in GitHub Actions and are available as private workflow artifacts, but they have not been installed on a physical device and are not release-signed.
- Both iOS targets compile in the macOS simulator workflow, but no signed IPA, device installation, or App Store package was produced.
- The complete academic final acceptance script, observational kiosk usability session, printer exercise, and backup/restore rehearsal remain manual operational acceptance work.
- The private showcase URL is owner-only and its one-click staff roles require the hosting platform's authenticated-owner header. Android/iOS WebViews may require the owner to authenticate in an external browser before the connected preview loads. Public rollout requires an approved production domain/API deployment; mobile apps must never embed a preview bypass token or enable the owner-only showcase shortcut.
