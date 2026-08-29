# Bank Queue Management System (QMS)

## Complete Software Requirements and Implementation Specification

**Project:** Queue Management System of a Bank  
**Course:** Object-Oriented Software Development (CS663)  
**Institution:** World Link College — Department of Computer Science, Master's Program  
**Project team:** Group 2 — Mikiyas Bayle, Alazar Andualem, Nebiyeliul Asmamaw  
**Instructor:** Dr. Sintayehu  
**Source proposal:** `QMS_Project_Proposal.pptx`, July 2026  
**Document purpose:** Developer-ready product specification, architecture guide, implementation backlog, and acceptance-test reference  
**Status:** Implementation baseline / MVP specification

---

## 1. How to Use This Document

This file is the single implementation reference for building the Bank Queue Management System. It expands the project proposal into requirements that developers, designers, testers, and AI coding assistants can execute.

Use it in this order:

1. Read Sections 2–8 to understand the business problem, scope, actors, and rules.
2. Use Sections 9–14 to design the screens, state transitions, workflows, and reports.
3. Use Sections 15–22 to implement the architecture, database, APIs, real-time events, security, and algorithms.
4. Use Sections 23–28 for testing, deployment, maintenance, and the four-week delivery plan.
5. Do not mark the project complete until the Definition of Done in Section 29 is satisfied.

Where this document adds detail that was not explicitly present in the proposal, the detail is marked as an **implementation decision**. These decisions preserve the original proposal's scope and can be changed later without changing the core business model.

---

## 2. Product Summary

The Bank Queue Management System replaces physical, unstructured lines inside a bank branch with virtual, service-specific queues.

A customer uses a kiosk to select a service and receive a numbered ticket. The ticket shows the selected service, queue position, and estimated waiting time. A teller signs in at a counter and calls the next eligible customer from the counter's assigned service queue. A public display immediately shows the called ticket and counter. The teller then starts service, completes it, transfers the customer, or records a no-show. A branch manager configures services and counters, manages staff access, monitors live operations, and generates reports.

The system must deliver four connected experiences:

- **Customer kiosk:** create, print, view, and cancel tickets.
- **Public display:** show called tickets and counters in real time.
- **Teller console:** call and serve customers from an assigned counter.
- **Manager dashboard:** configure the branch and monitor/report operations.

The MVP is a single-branch-capable prototype whose data model is designed for future multi-branch support.

---

## 3. Problem Statement

Manual queues create several problems:

- Customers must stand in line for long periods.
- Customers may not know which line is correct.
- Ordering disputes can occur because the queue is not transparent.
- Tellers cannot easily balance demand across service types.
- Managers lack reliable data about waiting time, service time, counter utilization, no-shows, and throughput.
- Crowding around counters negatively affects privacy, comfort, and branch operations.

The QMS solves these problems by making queue order explicit, automating ticket selection, updating all interfaces in real time, and recording operational events for reporting.

---

## 4. Objectives and Success Criteria

### 4.1 Primary objective

Design and implement a fair, efficient, transparent, and measurable queue-management application for a bank branch.

### 4.2 Specific objectives

- Eliminate the need for customers to stand in a physical line.
- Provide a ticket for a specific banking service.
- Show the customer's queue position and estimated waiting time.
- Let tellers call and manage customers systematically.
- Keep the kiosk, teller console, public display, and manager dashboard synchronized.
- Let managers configure counters, service types, and staff accounts.
- Generate daily and weekly performance reports.
- demonstrate object-oriented analysis and design through formal UML-aligned domain classes and state transitions.
- Produce maintainable modules that can later support SMS, mobile ticketing, and multiple branches.

### 4.3 Measurable MVP success criteria

The MVP is successful when:

- A customer can create a valid ticket in no more than three simple kiosk steps.
- Ticket creation and display updates complete within two seconds under normal branch load.
- Two tellers cannot call the same ticket.
- A counter cannot serve two active tickets simultaneously.
- Queue ordering is deterministic and auditable.
- Every ticket status change is recorded with a timestamp and responsible actor.
- The public display reflects a call within two seconds.
- A manager can view daily and weekly counts, average waiting time, and average service time.
- Role restrictions prevent tellers from opening manager-only features.
- Core automated tests pass and all critical acceptance scenarios are verified.

---

## 5. Scope

### 5.1 In scope for the MVP

- One or more bank branches in the data model, with one branch used in the initial deployment.
- Configurable service types such as Cash Deposit, Cash Withdrawal, Loans, and New Account.
- Independent FIFO queues per service type and branch.
- Optional priority service for eligible customers.
- Ticket generation and browser/thermal-printer receipt output.
- Ticket lookup using ticket number plus a private cancellation code or QR code.
- Customer cancellation while the ticket is waiting.
- Staff authentication and role-based authorization.
- Teller-counter assignment.
- Counter opening, closing, pausing, and service reassignment.
- Calling the next eligible customer.
- Starting and completing service.
- Marking a called customer as a no-show and returning the ticket to the queue.
- Transferring a customer to another service queue.
- Real-time public display updates.
- Live manager operational overview.
- Daily and weekly reports.
- CSV export of reports.
- Audit trail for sensitive or operational actions.
- English interface, with the UI prepared for future Amharic localization.

### 5.2 Out of scope for the MVP

- Core banking transactions or access to customer bank accounts.
- Payment processing.
- Identity verification against government or bank databases.
- Appointment scheduling.
- SMS, email, WhatsApp, or mobile push notifications.
- Native customer mobile application.
- Biometric staff login.
- Voice recognition.
- AI demand forecasting.
- Centralized multi-branch load balancing.
- Offline ticket synchronization across disconnected servers.
- Hardware procurement or advanced printer-driver development.
- Production integration with enterprise Active Directory or a bank's existing identity provider.

### 5.3 Future enhancements

- SMS notification when a ticket is close to being called.
- Mobile and web ticket creation before arriving at the branch.
- Appointment booking.
- Full multi-branch administration.
- Customer feedback and service rating.
- Voice announcements in English and Amharic.
- Digital signage content rotation.
- Demand forecasting and staffing recommendations.
- Integration with the bank's staff directory and analytics platform.

---

## 6. Stakeholders and Actors

| Actor                | Type                      | Responsibilities                                                                                                                     | Authentication                                                          |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Customer             | Human                     | Select service, request priority service, generate ticket, print ticket, view status, cancel waiting ticket                          | No staff login; ticket access uses ticket number and private code/QR    |
| Teller               | Human                     | Sign in, open assigned counter session, call next, recall, start service, complete, transfer, mark no-show                           | Username and password                                                   |
| Branch Manager       | Human                     | All teller capabilities where authorized; configure services/counters, assign staff, manage accounts, view reports and audit records | Username and password; manager role                                     |
| Display Screen       | System boundary device    | Subscribe to branch events and show called tickets/counters                                                                          | Device token or read-only display key                                   |
| Kiosk                | System boundary device    | Present services, create/print tickets, support status lookup and cancellation                                                       | Registered kiosk device key for production; optional in local prototype |
| System Administrator | Supporting technical role | Initial deployment, environment configuration, database backup, service health                                                       | Infrastructure access; not a normal in-app MVP role                     |

### 6.1 Role permissions

| Capability                     | Customer/Kiosk | Teller |        Manager         | Display |
| ------------------------------ | :------------: | :----: | :--------------------: | :-----: |
| View active services           |      Yes       |  Yes   |          Yes           |   No    |
| Generate ticket                |      Yes       |   No   | Optional assisted mode |   No    |
| View own ticket status         |      Yes       |   No   |          Yes           |   No    |
| Cancel waiting ticket          |      Yes       |   No   | Yes with audit reason  |   No    |
| Call next ticket               |       No       |  Yes   |          Yes           |   No    |
| Start/complete service         |       No       |  Yes   |          Yes           |   No    |
| Mark no-show                   |       No       |  Yes   |          Yes           |   No    |
| Transfer ticket                |       No       |  Yes   |          Yes           |   No    |
| Open/close own counter session |       No       |  Yes   |          Yes           |   No    |
| Configure counters/services    |       No       |   No   |          Yes           |   No    |
| Manage staff accounts          |       No       |   No   |          Yes           |   No    |
| View reports                   |       No       |   No   |          Yes           |   No    |
| Receive public call updates    |       No       |   No   |          Yes           |   Yes   |

---

## 7. Product Interfaces

### 7.1 Customer kiosk

Full-screen, touch-friendly interface used inside the branch. It must remain understandable to a first-time user without staff assistance.

Primary actions:

- Select language.
- Select a service.
- Optionally request priority service and choose an eligibility reason.
- Confirm selection.
- Generate and print a ticket.
- Scan/enter a ticket to view status.
- Cancel a waiting ticket using a private code.

### 7.2 Public display

Read-only, full-screen interface displayed on a television or monitor.

It shows:

- Branch name and current time.
- Most recently called ticket in the largest visual area.
- Assigned counter number.
- Several previous or active calls.
- Optional muted notification sound or spoken announcement.
- Connection/recovery indicator that is not distracting to customers.

No customer name, phone number, account number, or other private information may appear.

### 7.3 Teller console

Authenticated staff interface optimized for rapid, repeated operations.

It shows:

- Teller identity.
- Selected branch and current counter.
- Counter state and assigned service.
- Number of waiting customers.
- Current ticket and elapsed times.
- Primary actions: Call Next, Recall, Start Service, Complete, Transfer, Mark No-Show.
- Clear disabled states explaining why an action is unavailable.

### 7.4 Manager dashboard

Authenticated administration and reporting interface.

It includes:

- Live branch dashboard.
- Counter management.
- Service-type configuration.
- Staff account management.
- Reports and CSV export.
- Audit-log viewer.
- Branch-level settings for wait-time and no-show behavior.

---

## 8. Core Business Rules

The following rules are mandatory unless explicitly changed by a future approved requirement.

### 8.1 Ticket rules

- **BR-001:** Every ticket has an internal globally unique ID.
- **BR-002:** Every ticket also has a short public display number, such as `DEP-042`.
- **BR-003:** Public ticket sequences reset daily per branch and service code.
- **BR-004:** A ticket belongs to exactly one branch at a time.
- **BR-005:** A ticket belongs to exactly one current service queue at a time.
- **BR-006:** A customer does not need a bank account or staff login to request a ticket.
- **BR-007:** Customer name and phone number are optional and should not be collected in the default MVP flow.
- **BR-008:** A customer may cancel a ticket only while it is in `WAITING`.
- **BR-009:** `COMPLETED` and `CANCELLED` tickets are terminal and cannot return to an active state.
- **BR-010:** Every status transition must create an immutable ticket-event record.

### 8.2 Queue rules

- **BR-011:** Standard tickets are ordered first-come-first-served by `queue_entered_at`, then by sequence number.
- **BR-012:** Priority tickets are ordered first-come-first-served within the priority group.
- **BR-013:** Priority handling must use a starvation-safe policy. The default is at most two consecutive priority tickets when standard tickets are waiting; the next call must select the oldest standard ticket.
- **BR-014:** A manager can configure the maximum consecutive priority calls from 1 to 5.
- **BR-015:** A transfer adds the ticket to the destination queue using the transfer time as its new queue-entry time, while preserving the ticket's complete history.
- **BR-016:** A no-show returns the ticket to `WAITING`, increments `no_show_count`, and records a new queue-entry time.
- **BR-017:** Queue positions and estimated waits are informational and may change as counters open, close, transfer, or handle priority customers.

### 8.3 Counter and teller rules

- **BR-018:** A counter can be `CLOSED`, `OPEN`, or `PAUSED`.
- **BR-019:** An open counter must have an active teller session and an assigned service.
- **BR-020:** One teller may have only one active counter session at a time.
- **BR-021:** One counter may have only one active teller session at a time.
- **BR-022:** A counter may have only one active ticket in `CALLED` or `IN_SERVICE` at a time.
- **BR-023:** A teller cannot call another ticket until the active ticket is completed, transferred, cancelled by an authorized manager, or returned to the queue as a no-show.
- **BR-024:** Closing a counter is blocked while it has an active ticket. The active ticket must first be resolved.
- **BR-025:** A teller may act only within the teller's branch and active counter session.

### 8.4 Calling and serving rules

- **BR-026:** Calling the next customer is an atomic server-side operation.
- **BR-027:** If multiple tellers call at the same moment, each must receive a different ticket.
- **BR-028:** A called ticket is assigned to the calling counter and teller session.
- **BR-029:** A called ticket starts a configurable no-show timer; the default is 120 seconds.
- **BR-030:** Recall repeats the public announcement without changing queue order or the original called time.
- **BR-031:** Start Service is permitted only from `CALLED`.
- **BR-032:** Complete Service is permitted only from `IN_SERVICE`.
- **BR-033:** Transfer is permitted from `CALLED` or `IN_SERVICE` and requires a destination service and optional note.

### 8.5 Security and audit rules

- **BR-034:** Staff passwords are never stored in plain text.
- **BR-035:** Manager-only operations are enforced by the backend, not only hidden in the UI.
- **BR-036:** Login, logout, failed login, staff changes, service changes, counter changes, ticket overrides, and report exports are audited.
- **BR-037:** Public displays receive only non-sensitive ticket and counter data.
- **BR-038:** All API inputs are validated server-side.
- **BR-039:** Operational records must not be physically deleted through normal application functions.

---

## 9. Functional Requirements

### 9.1 Customer and kiosk requirements

- **FR-001:** The kiosk shall list only active services available at its branch.
- **FR-002:** Each service option shall show a clear service name, short description, and optional icon.
- **FR-003:** The customer shall be able to select exactly one service per ticket request.
- **FR-004:** The customer shall be able to return to the service list before confirming.
- **FR-005:** The customer may request priority service when this feature is enabled.
- **FR-006:** A priority request shall record a configured reason without displaying it publicly.
- **FR-007:** The confirmation screen shall show the selected branch, service, and priority choice.
- **FR-008:** Confirming a valid request shall create a ticket atomically.
- **FR-009:** The result shall show the public ticket number, service, issue time, people ahead, and estimated wait.
- **FR-010:** The system shall generate a private cancellation/status code and QR-compatible lookup token.
- **FR-011:** The kiosk shall offer a Print Ticket action.
- **FR-012:** If printing fails, the ticket remains valid and the screen shall offer Retry Print without creating a second ticket.
- **FR-013:** The kiosk shall automatically return to the welcome screen after a configurable idle timeout.
- **FR-014:** A customer shall be able to look up a ticket using the public number and private code or QR token.
- **FR-015:** Ticket lookup shall show status, current position when waiting, estimated wait, and assigned counter when called.
- **FR-016:** A customer shall be able to cancel a `WAITING` ticket after a confirmation step.
- **FR-017:** The cancellation result shall be synchronized with staff and manager interfaces in real time.
- **FR-018:** The kiosk shall present a friendly error when a service is inactive, unavailable, or changed during selection.
- **FR-019:** Repeated confirmation requests with the same idempotency key shall return the original ticket instead of creating duplicates.

### 9.2 Teller requirements

- **FR-020:** A teller shall log in using a username and password.
- **FR-021:** A successful login shall create an authenticated session with role and branch claims.
- **FR-022:** A teller shall select an available counter or use a manager-preassigned counter.
- **FR-023:** Opening a counter session shall make the counter available for its assigned service.
- **FR-024:** The teller console shall show the assigned service and live waiting count.
- **FR-025:** Call Next shall atomically select the next eligible waiting ticket.
- **FR-026:** If no eligible ticket exists, the UI shall show `No customers waiting` and shall not change counter state.
- **FR-027:** A successful call shall display the ticket number and customer-facing counter number.
- **FR-028:** A successful call shall publish a real-time public-display event.
- **FR-029:** A teller shall be able to recall the current ticket.
- **FR-030:** A teller shall be able to start service for a called ticket.
- **FR-031:** Starting service shall record `service_started_at` and transition the ticket to `IN_SERVICE`.
- **FR-032:** A teller shall be able to complete an in-service ticket.
- **FR-033:** Completing service shall record `completed_at`, release the counter, and update reports.
- **FR-034:** A teller shall be able to mark a called ticket as no-show.
- **FR-035:** Marking no-show shall return the ticket to the queue according to BR-016.
- **FR-036:** A teller shall be able to transfer a called or in-service ticket to another active service.
- **FR-037:** A transfer shall record source service, destination service, teller, counter, time, and optional note.
- **FR-038:** A teller shall not see manager configuration or reports.
- **FR-039:** A teller shall be able to pause and resume the counter only when there is no active ticket.
- **FR-040:** A teller shall be able to close the counter session only when there is no active ticket.
- **FR-041:** Logout shall close or require resolution of the teller's active counter session.

### 9.3 Manager requirements

- **FR-042:** A manager shall see a live overview of queues, counters, active tickets, and staff sessions for the manager's branch.
- **FR-043:** A manager shall create, edit, activate, deactivate, and reorder service types.
- **FR-044:** A manager shall configure service code, display name, description, average-service-time baseline, and priority availability.
- **FR-045:** A manager shall create, edit, activate, and deactivate counters.
- **FR-046:** A manager shall open, close, pause, or reassign an inactive counter.
- **FR-047:** Reassigning a counter with an active ticket shall be blocked.
- **FR-048:** A manager shall create teller and manager accounts within the manager's authorized branch scope.
- **FR-049:** A manager shall activate, deactivate, unlock, and reset staff credentials.
- **FR-050:** A manager shall never be able to view an existing password.
- **FR-051:** A manager shall view daily and weekly reports.
- **FR-052:** Reports shall support date range, service, counter, and teller filters.
- **FR-053:** A manager shall export filtered report results as CSV.
- **FR-054:** A manager shall view an audit log filtered by action, actor, target type, and date.
- **FR-055:** A manager shall configure no-show timeout and priority fairness settings within allowed ranges.
- **FR-056:** A manager may cancel a waiting or called ticket only with a recorded reason.

### 9.4 Display requirements

- **FR-057:** A display shall subscribe to one branch using a read-only device credential.
- **FR-058:** The display shall show the newest call prominently with the ticket number and counter label.
- **FR-059:** The display shall show a configurable number of recent calls; default is five.
- **FR-060:** A new call or recall shall trigger a visual highlight and optional sound.
- **FR-061:** The display shall not expose personal information.
- **FR-062:** On reconnect, the display shall request the current snapshot before processing new events.
- **FR-063:** If real-time connectivity is lost, the display shall retain the last safe snapshot and attempt reconnection automatically.
- **FR-064:** An out-of-date display shall show a small connection warning to staff without replacing the customer-facing content.

### 9.5 Reporting and system requirements

- **FR-065:** The system shall calculate ticket count by status.
- **FR-066:** The system shall calculate average and median waiting time.
- **FR-067:** The system shall calculate average and median service time.
- **FR-068:** The system shall calculate throughput by service, counter, and teller.
- **FR-069:** The system shall calculate no-show and cancellation counts.
- **FR-070:** The system shall calculate counter utilization using active service time divided by open-session time.
- **FR-071:** Operational events shall be timestamped in UTC and displayed in the branch's configured timezone.
- **FR-072:** Health endpoints shall report API and database availability without exposing secrets.
- **FR-073:** The application shall provide seed data for a demonstrable branch, services, counters, and users.

---

## 10. Non-Functional Requirements

| ID      | Category        | Requirement / Target                                                                                                 |
| ------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Performance     | 95% of normal API requests complete in under 500 ms on the local branch network, excluding printer time              |
| NFR-002 | Performance     | Ticket generation and public display updates complete within 2 seconds under expected load                           |
| NFR-003 | Concurrency     | The system prevents duplicate calls when at least 20 teller requests occur concurrently                              |
| NFR-004 | Capacity        | Support at least 10 active service queues per branch                                                                 |
| NFR-005 | Capacity        | Support at least 50 counters and 2,000 tickets per branch per day without redesign                                   |
| NFR-006 | Availability    | Target 99.5% availability during branch operating hours                                                              |
| NFR-007 | Reliability     | Confirmed ticket operations are durable after an application restart                                                 |
| NFR-008 | Usability       | A first-time customer can generate a ticket without staff help                                                       |
| NFR-009 | Accessibility   | Touch targets are at least 44×44 CSS pixels; keyboard navigation and visible focus are supported in staff interfaces |
| NFR-010 | Accessibility   | Text and controls meet WCAG 2.1 AA contrast where practical                                                          |
| NFR-011 | Security        | Passwords use Argon2id or bcrypt with an appropriate work factor                                                     |
| NFR-012 | Security        | Role and branch scope are validated on every protected backend operation                                             |
| NFR-013 | Security        | Login is rate-limited and repeated failures temporarily lock the account                                             |
| NFR-014 | Privacy         | Public surfaces never receive or display personal customer data                                                      |
| NFR-015 | Maintainability | Backend modules follow clear domain boundaries and object-oriented service/repository patterns                       |
| NFR-016 | Maintainability | Code is formatted, linted, typed, documented, and covered by automated tests                                         |
| NFR-017 | Observability   | Structured logs include request ID, actor ID when authenticated, branch ID, action, outcome, and duration            |
| NFR-018 | Portability     | The full MVP runs locally with Docker Compose and documented environment variables                                   |
| NFR-019 | Localization    | All visible strings are stored outside core business logic and prepared for English/Amharic translations             |
| NFR-020 | Recovery        | Daily database backups are retained for at least 14 days in production-like deployments                              |

---

## 11. Detailed Use Cases

### UC-01 — Generate Ticket

**Primary actor:** Customer  
**Supporting actors:** Kiosk, printer  
**Preconditions:** The kiosk is registered; the branch and at least one service are active.  
**Trigger:** Customer selects `Get a Ticket`.

**Main flow:**

1. Kiosk loads active branch services.
2. Customer chooses a service.
3. Customer optionally requests priority service and selects a reason.
4. Kiosk shows confirmation.
5. Customer confirms.
6. Backend validates branch, service, kiosk, and priority configuration.
7. Backend allocates the next daily service sequence inside a transaction.
8. Backend creates the ticket and its initial event.
9. Ticket transitions `ISSUED → WAITING`.
10. Backend calculates initial queue position and estimated wait.
11. Kiosk shows the result and requests one print.
12. Customer takes the ticket; kiosk returns to the welcome screen after timeout.

**Alternative flows:**

- Invalid/inactive service: reject creation and reload service options.
- Duplicate submission: return the ticket created for the same idempotency key.
- Printer unavailable: show ticket on screen and allow reprint; do not create another ticket.
- Backend unavailable: show a clear temporary-unavailable message; do not display a fake ticket.

**Postconditions:** One durable `WAITING` ticket exists and appears in the corresponding queue.

### UC-02 — View Ticket Status

**Primary actor:** Customer  
**Preconditions:** A ticket exists.  
**Main flow:** Customer scans QR or enters public ticket number and private code; system displays safe ticket status information.  
**Failure flow:** Invalid credentials return a generic `Ticket not found or code incorrect` message.

### UC-03 — Cancel Ticket

**Primary actor:** Customer  
**Preconditions:** Ticket status is `WAITING`; customer proves possession with private code/QR.  
**Main flow:** Show ticket summary → ask for confirmation → atomically transition to `CANCELLED` → record event → publish queue update.  
**Failure flow:** If the ticket has already been called, cancellation is rejected and the latest status is shown.

### UC-04 — Staff Login

**Primary actor:** Teller or Manager  
**Main flow:** Validate credentials → verify active account and branch → create secure session/access token → record successful login audit event → route user by role.  
**Failure flow:** Record failed attempt, return a generic error, and apply rate limiting/temporary lockout.

### UC-05 — Open Counter Session

**Primary actor:** Teller  
**Preconditions:** Teller is authenticated; counter is active and not occupied; service assignment is valid.  
**Main flow:** Teller selects available counter → confirms assigned service → system creates a teller-counter session and changes counter to `OPEN`.  
**Failure flow:** If another teller claimed the counter first, reject and refresh availability.

### UC-06 — Call Next Customer

**Primary actor:** Teller  
**Preconditions:** Teller has an open counter session and no active ticket.  
**Main flow:**

1. Teller selects `Call Next`.
2. Backend begins a database transaction.
3. Backend locks/selects the next eligible waiting ticket using the priority fairness rule.
4. Backend assigns teller, counter, and called timestamp.
5. Ticket transitions `WAITING → CALLED`.
6. Ticket event is recorded.
7. Transaction commits.
8. Backend publishes queue and display events.
9. Teller sees the active ticket; display announces ticket and counter.

**Alternative flow:** If no ticket is waiting, return `QUEUE_EMPTY` without modifying any record.

### UC-07 — Serve and Complete Customer

**Primary actor:** Teller  
**Preconditions:** Current ticket is `CALLED`.  
**Main flow:** Customer arrives → teller selects `Start Service` → ticket becomes `IN_SERVICE` → teller performs the banking service outside QMS → teller selects `Complete` → ticket becomes `COMPLETED` → counter is released → reports update.

### UC-08 — Mark No-Show

**Primary actor:** Teller  
**Preconditions:** Current ticket is `CALLED`.  
**Main flow:** Teller selects `Mark No-Show` → confirms → system increments no-show count → clears counter assignment → returns ticket to `WAITING` with a new queue-entry time → publishes updates.

### UC-09 — Transfer Customer

**Primary actor:** Teller  
**Preconditions:** Ticket is `CALLED` or `IN_SERVICE`.  
**Main flow:** Teller selects destination service and optional note → system validates service → records transfer → releases source counter → associates ticket with destination queue → returns ticket to `WAITING` → recalculates status.

### UC-10 — Manage Service Types

**Primary actor:** Branch Manager  
**Main flow:** Manager views services → creates or edits service → system validates unique service code per branch → saves configuration → audits change → kiosk and manager interfaces refresh.  
**Constraint:** Deactivating a service with waiting/active tickets is blocked until the tickets are resolved or transferred.

### UC-11 — Manage Counters

**Primary actor:** Branch Manager  
**Main flow:** Manager creates/edits counter labels, assigns service, and opens/pauses/closes eligible counters.  
**Constraint:** Reassignment and closure are blocked while a counter has an active ticket.

### UC-12 — Generate Report

**Primary actor:** Branch Manager  
**Main flow:** Manager selects date range and optional filters → backend aggregates ticket and session data → dashboard presents metrics and tables → manager optionally exports CSV → export is audited.

---

## 12. Ticket State Model

### 12.1 States

| State        | Meaning                                                | Allowed next states                                                                     |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `ISSUED`     | Ticket record and number have just been created        | `WAITING`                                                                               |
| `WAITING`    | Ticket is eligible to be called from its service queue | `CALLED`, `CANCELLED`                                                                   |
| `CALLED`     | Ticket has been assigned and announced at a counter    | `IN_SERVICE`, `WAITING` via no-show, `WAITING` via transfer, manager-cancel if approved |
| `IN_SERVICE` | Customer is being served                               | `COMPLETED`, `WAITING` via transfer                                                     |
| `COMPLETED`  | Service finished successfully                          | None                                                                                    |
| `CANCELLED`  | Ticket was cancelled                                   | None                                                                                    |

### 12.2 State machine

```mermaid
stateDiagram-v2
    [*] --> ISSUED: create ticket
    ISSUED --> WAITING: enqueue
    WAITING --> CALLED: call next / assign counter
    WAITING --> CANCELLED: customer cancels
    CALLED --> IN_SERVICE: customer arrives
    CALLED --> WAITING: no-show / requeue
    CALLED --> WAITING: transfer
    IN_SERVICE --> WAITING: transfer
    IN_SERVICE --> COMPLETED: complete service
    COMPLETED --> [*]
    CANCELLED --> [*]
```

### 12.3 Transition validation

State transitions must be performed in a central `TicketWorkflowService`, not by directly updating a status column from controllers. Each transition method must:

1. Load and lock the ticket.
2. Verify current state.
3. Verify actor permission and branch scope.
4. Verify counter/session conditions.
5. Update ticket timestamps and associations.
6. Insert a ticket event.
7. Insert an audit event when required.
8. Commit once.
9. Publish real-time events only after the transaction commits.

---

## 13. User Interface Specification

### 13.1 Global UI principles

- Use simple language and short action labels.
- Never rely on color alone to communicate status.
- Confirm destructive or irreversible actions.
- Show loading states for all server actions.
- Disable buttons while a request is in progress.
- Use idempotency keys for repeat-sensitive actions.
- Display friendly messages to users and log technical errors privately.
- Use the branch timezone for visible times.
- Store user-facing strings in localization files.

### 13.2 Kiosk screen map

#### K-01 Welcome

- Branch logo/name.
- `Get a Ticket` primary button.
- `Check or Cancel Ticket` secondary button.
- Language selector.
- Accessibility/high-contrast option if time permits.

#### K-02 Service selection

- Grid/list of active services.
- Service name, description, icon, and approximate current wait.
- Back button.
- No scroll required for the first six services at standard kiosk resolution; paginate if more.

#### K-03 Priority option

- Shown only if enabled for the selected service.
- `Standard Service` and `Priority Service` choices.
- Configured eligibility reasons such as elderly, disability, pregnancy, or other branch-approved reason.
- Brief message that staff may verify eligibility.

#### K-04 Confirmation

- Selected service.
- Service type/priority status.
- Estimated current wait labeled as an estimate.
- `Confirm and Get Ticket` primary button.
- `Change Service` secondary action.

#### K-05 Ticket result

- Ticket number in very large text.
- Service name.
- People ahead.
- Estimated waiting time.
- QR code/private lookup details.
- `Print Ticket` and `Done` actions.
- Automatic reset countdown.

#### K-06 Ticket lookup

- QR scan control if hardware/browser supports it.
- Ticket number field.
- Private code field.
- `View Status` button.

#### K-07 Ticket status

- Ticket number and service.
- Clear status label.
- Position/wait if `WAITING`.
- Counter if `CALLED`.
- `Cancel Ticket` only if `WAITING`.
- `Done` returns to welcome.

### 13.3 Teller screen map

#### T-01 Login

- Username.
- Password with show/hide control.
- Login action.
- Generic authentication error.

#### T-02 Counter selection/session start

- Available counters in teller's branch.
- Counter label and assigned service.
- Current state.
- Start Session action.

#### T-03 Teller workspace

Top area:

- Teller name and role.
- Counter label.
- Assigned service.
- Connection indicator.
- Pause/close/logout menu.

Queue summary:

- Total waiting.
- Standard waiting.
- Priority waiting.
- Oldest waiting time.

Active ticket card:

- Ticket number.
- Status.
- Called timer or service timer.
- No-show count.
- Call/recall count.

Actions by state:

| Counter/ticket condition | Available actions                             |
| ------------------------ | --------------------------------------------- |
| Open, no active ticket   | Call Next                                     |
| `CALLED`                 | Recall, Start Service, Mark No-Show, Transfer |
| `IN_SERVICE`             | Complete, Transfer                            |
| Paused                   | Resume                                        |
| Closed                   | Start/Open Session                            |

#### T-04 Transfer modal

- Current ticket summary.
- Destination service dropdown excluding current inactive/invalid choices.
- Optional note.
- Confirm Transfer.

#### T-05 No-show confirmation

- Explain that the ticket will return to the queue.
- Show current no-show count.
- Confirm and cancel actions.

### 13.4 Manager screen map

#### M-01 Live dashboard

- Tickets issued today.
- Waiting now.
- Called/in service now.
- Completed today.
- Average wait today.
- Average service time today.
- Queue cards by service.
- Counter cards by state.
- Long-wait alert list.

#### M-02 Counters

- Counter label, state, teller, service, active ticket, session duration.
- Create/edit counter.
- Assign/reassign service.
- Pause/resume/close eligible counter.

#### M-03 Services

- Display order.
- Code, name, status, baseline time, priority enabled.
- Create/edit/activate/deactivate.
- Prevent invalid deactivation.

#### M-04 Staff

- Name, username, role, branch, status, last login.
- Create, edit, deactivate, unlock, reset password.
- No password display.

#### M-05 Reports

- Date range.
- Service/counter/teller filters.
- KPI cards.
- Trend table/chart.
- Detailed table.
- CSV export.

#### M-06 Audit log

- Time, actor, role, action, target, outcome, source IP/device, correlation ID.
- Filters and pagination.
- Read-only.

#### M-07 Settings

- Branch timezone.
- Ticket number format.
- Kiosk idle timeout.
- Called/no-show timeout.
- Priority fairness limit.
- Display history count.

### 13.5 Display screen

- Landscape 16:9 responsive layout.
- Current call uses at least 50% of the display area.
- Ticket number and counter are readable from across the branch.
- Recent calls appear in a simple list/table.
- Avoid animations longer than one second.
- New-call highlight must not flash rapidly.
- Sound must be brief and branch-configurable.

---

## 14. Reports and Metric Definitions

Metric definitions must be consistent across the dashboard, CSV export, and tests.

| Metric               | Definition                                                                  |
| -------------------- | --------------------------------------------------------------------------- |
| Tickets issued       | Count of tickets whose `issued_at` falls in the selected period             |
| Waiting time         | `called_at - queue_entered_at` for the queue segment that led to the call   |
| Initial waiting time | First `called_at - issued_at`, if called                                    |
| Service time         | `completed_at - service_started_at` for a completed service segment         |
| Throughput           | Count of tickets completed in the selected period                           |
| Cancellation rate    | Cancelled tickets ÷ issued tickets × 100                                    |
| No-show count        | Count of no-show events, not unique tickets                                 |
| Transfer count       | Count of transfer events                                                    |
| Counter open time    | Sum of counter-session time in the selected period                          |
| Counter busy time    | Sum of in-service ticket intervals at the counter                           |
| Counter utilization  | Busy time ÷ open time × 100, capped and validated for clock/data errors     |
| SLA breach           | Waiting ticket whose current or final wait exceeds the configured threshold |

Required report views:

1. Branch daily summary.
2. Branch weekly summary.
3. Service performance.
4. Counter performance.
5. Teller throughput.
6. Hourly demand distribution.
7. No-show, cancellation, and transfer summary.

CSV exports must include the selected filters, generation time, branch timezone, and metric definitions or clear column labels.

---

## 15. Recommended Technology Stack

This is an **implementation decision** selected for a four-week academic prototype that can later be hardened.

### 15.1 Monorepo

- TypeScript monorepo managed with `pnpm` workspaces.
- Shared packages for types, validation schemas, UI components, and configuration.

### 15.2 Frontend

- React with TypeScript.
- Vite for lightweight kiosk, display, and staff web clients.
- React Router for navigation.
- TanStack Query for API state and caching.
- Socket.IO client for real-time events.
- Tailwind CSS or another consistent utility/component approach.
- `i18next`-style localization structure for English and future Amharic.

### 15.3 Backend

- Node.js active-LTS runtime.
- NestJS with TypeScript for modular, object-oriented backend services.
- REST API plus Socket.IO WebSocket gateway.
- Prisma ORM or an equivalent migration-based PostgreSQL ORM.
- OpenAPI/Swagger documentation generated from the API.

### 15.4 Data and infrastructure

- PostgreSQL as the authoritative operational database.
- Optional Redis in a later scale phase for distributed WebSocket fan-out, rate limits, and caching. Do not make Redis mandatory for the single-server MVP.
- Docker Compose for local API, database, and web-client startup.
- Nginx or Caddy as a production-like reverse proxy when deployed.

### 15.5 Testing and quality

- Unit tests: Vitest or Jest.
- API integration tests: Supertest.
- UI component tests: Testing Library.
- End-to-end tests: Playwright.
- Linting: ESLint.
- Formatting: Prettier.
- CI pipeline: install, lint, type-check, test, build, and migration validation.

### 15.6 Why a web/PWA approach

- Kiosks, staff computers, and displays can run the same browser-based system.
- Installation and updates are simpler than separate native applications.
- The four interfaces can share types and UI components.
- A local branch server can operate on the branch LAN.
- The architecture remains compatible with future mobile apps through the same API.

---

## 16. System Architecture

### 16.1 Logical architecture

```mermaid
flowchart TB
    UI["Web clients: kiosk, display, teller, manager"]
    API["NestJS REST API and WebSocket gateway"]
    DOMAIN["Domain services: tickets, queues, counters, reports"]
    DB[(PostgreSQL)]
    UI -->|HTTPS and WebSocket| API
    API --> DOMAIN
    DOMAIN --> DB
```

### 16.2 Backend modules

| Module                  | Responsibility                                                    |
| ----------------------- | ----------------------------------------------------------------- |
| `AuthModule`            | Staff login, refresh/logout, password reset, role guards, lockout |
| `BranchesModule`        | Branch metadata, timezone, settings                               |
| `DevicesModule`         | Kiosk/display registration and read-only device credentials       |
| `ServicesModule`        | Service-type configuration and availability                       |
| `CountersModule`        | Counter configuration, state, service assignment                  |
| `StaffModule`           | Staff accounts, roles, status, branch scope                       |
| `CounterSessionsModule` | Teller-counter session lifecycle                                  |
| `TicketsModule`         | Creation, lookup, cancellation, workflow transitions              |
| `QueuesModule`          | Atomic call-next selection, position and wait estimation          |
| `RealtimeModule`        | Branch rooms, authorized subscriptions, event publishing          |
| `ReportsModule`         | Aggregations, filters, CSV export                                 |
| `AuditModule`           | Immutable security and administrative audit trail                 |
| `HealthModule`          | Liveness/readiness endpoints                                      |

### 16.3 Layering rule

Controllers validate transport-level input and call application services. Application services coordinate use cases. Domain services enforce queue and ticket rules. Repositories/ORM adapters perform persistence. Controllers must not contain queue-selection logic, and UI code must not be the authority for state-transition rules.

### 16.4 Deployment topology for the prototype

- One PostgreSQL container.
- One API/WebSocket container.
- One static web container or reverse proxy serving the four clients.
- Kiosk browser opens `/kiosk/{device-code}`.
- Display browser opens `/display/{device-code}`.
- Staff browser opens `/staff` and routes by role.
- All devices connect through the secured branch LAN or localhost demo network.

---

## 17. Object-Oriented Domain Model

The implementation should preserve the proposal's UML intent while mapping it to maintainable services and entities.

### 17.1 Core classes/entities

#### `Staff` (abstract domain concept)

Attributes: `id`, `branchId`, `name`, `username`, `passwordHash`, `role`, `status`, `failedLoginCount`, `lockedUntil`, timestamps.  
Behavior: credential verification, account activation checks, authorization identity.

#### `Teller`

Specializes the staff role. Participates in counter sessions and ticket operations.

#### `BranchManager`

Specializes the staff role. Configures branch resources, manages staff, and accesses reports.

#### `Branch`

Attributes: `id`, `code`, `name`, `location`, `timezone`, `status`, settings.  
Relationships: composes counters and branch services.

#### `ServiceType`

Attributes: `id`, `branchId`, `code`, `name`, `description`, `averageServiceMinutes`, `priorityEnabled`, `displayOrder`, `status`.

#### `Counter`

Attributes: `id`, `branchId`, `label`, `status`, `assignedServiceId`, `isActive`.  
Behavior: open, pause, resume, close, assign service, reject invalid changes.

#### `CounterSession`

Attributes: `id`, `counterId`, `staffId`, `serviceTypeId`, `openedAt`, `pausedAt`, `closedAt`, `status`.

#### `Ticket`

Attributes: identity, public number, branch/service, priority, state, queue timestamps, service timestamps, counter/teller assignments, no-show count, lookup-secret hash, version.  
Behavior: enqueue, call, start service, complete, cancel, transfer, mark no-show.

#### `TicketEvent`

Immutable event containing ticket, event type, from/to state, actor, counter, service, timestamp, reason, metadata.

#### `DisplayScreen` / `Device`

Boundary-device registration containing branch, type, display label, credential hash, status, last seen.

#### `Report`

Prefer generating reports from operational data rather than storing mutable report rows. Store only export metadata if required for auditing.

### 17.2 Domain services

- `TicketNumberService`
- `TicketWorkflowService`
- `QueueSelectionService`
- `WaitEstimationService`
- `CounterSessionService`
- `AuthorizationPolicyService`
- `ReportQueryService`
- `RealtimePublisher`
- `AuditService`

---

## 18. Database Design

### 18.1 Entity relationship overview

```mermaid
erDiagram
    BRANCH ||--o{ SERVICE_TYPE : configures
    BRANCH ||--o{ COUNTER : owns
    BRANCH ||--o{ STAFF : employs
    COUNTER ||--o{ COUNTER_SESSION : hosts
    STAFF ||--o{ COUNTER_SESSION : opens
    SERVICE_TYPE ||--o{ TICKET : receives
    COUNTER ||--o{ TICKET : serves
    TICKET ||--o{ TICKET_EVENT : records
    BRANCH ||--o{ DEVICE : registers
```

### 18.2 Tables

#### `branches`

| Column                     | Type         | Rules                                   |
| -------------------------- | ------------ | --------------------------------------- |
| `id`                       | UUID         | Primary key                             |
| `code`                     | VARCHAR(20)  | Unique, uppercase                       |
| `name`                     | VARCHAR(120) | Required                                |
| `location`                 | VARCHAR(255) | Optional                                |
| `timezone`                 | VARCHAR(64)  | Required, default configured for branch |
| `status`                   | ENUM         | `ACTIVE`, `INACTIVE`                    |
| `settings`                 | JSONB        | Validated branch settings               |
| `created_at`, `updated_at` | TIMESTAMPTZ  | Required                                |

#### `service_types`

| Column                    | Type         | Rules                         |
| ------------------------- | ------------ | ----------------------------- |
| `id`                      | UUID         | Primary key                   |
| `branch_id`               | UUID         | FK to branches                |
| `code`                    | VARCHAR(10)  | Unique per branch; e.g. `DEP` |
| `name`                    | VARCHAR(100) | Required                      |
| `description`             | VARCHAR(255) | Optional                      |
| `average_service_minutes` | INTEGER      | 1–240                         |
| `priority_enabled`        | BOOLEAN      | Default false                 |
| `display_order`           | INTEGER      | Non-negative                  |
| `status`                  | ENUM         | `ACTIVE`, `INACTIVE`          |
| timestamps                | TIMESTAMPTZ  | Required                      |

Unique index: `(branch_id, code)`.

#### `counters`

| Column                | Type        | Rules                               |
| --------------------- | ----------- | ----------------------------------- |
| `id`                  | UUID        | Primary key                         |
| `branch_id`           | UUID        | FK                                  |
| `label`               | VARCHAR(40) | Unique per branch; e.g. `Counter 3` |
| `assigned_service_id` | UUID        | Nullable FK while closed            |
| `status`              | ENUM        | `CLOSED`, `OPEN`, `PAUSED`          |
| `is_active`           | BOOLEAN     | Configuration status                |
| timestamps            | TIMESTAMPTZ | Required                            |

#### `staff`

| Column               | Type         | Rules                          |
| -------------------- | ------------ | ------------------------------ |
| `id`                 | UUID         | Primary key                    |
| `branch_id`          | UUID         | FK                             |
| `staff_code`         | VARCHAR(30)  | Unique                         |
| `name`               | VARCHAR(120) | Required                       |
| `username`           | VARCHAR(80)  | Case-normalized unique         |
| `password_hash`      | TEXT         | Required                       |
| `role`               | ENUM         | `TELLER`, `MANAGER`            |
| `status`             | ENUM         | `ACTIVE`, `INACTIVE`, `LOCKED` |
| `failed_login_count` | INTEGER      | Default 0                      |
| `locked_until`       | TIMESTAMPTZ  | Nullable                       |
| `last_login_at`      | TIMESTAMPTZ  | Nullable                       |
| timestamps           | TIMESTAMPTZ  | Required                       |

#### `counter_sessions`

| Column            | Type        | Rules                                   |
| ----------------- | ----------- | --------------------------------------- |
| `id`              | UUID        | Primary key                             |
| `branch_id`       | UUID        | FK, denormalized for scope/query safety |
| `counter_id`      | UUID        | FK                                      |
| `staff_id`        | UUID        | FK                                      |
| `service_type_id` | UUID        | FK                                      |
| `status`          | ENUM        | `OPEN`, `PAUSED`, `CLOSED`              |
| `opened_at`       | TIMESTAMPTZ | Required                                |
| `paused_at`       | TIMESTAMPTZ | Nullable                                |
| `closed_at`       | TIMESTAMPTZ | Nullable                                |

Use partial unique indexes to allow only one open/paused session per teller and per counter.

#### `daily_sequences`

| Column            | Type    | Rules                                    |
| ----------------- | ------- | ---------------------------------------- |
| `branch_id`       | UUID    | Composite primary key                    |
| `service_type_id` | UUID    | Composite primary key                    |
| `business_date`   | DATE    | Composite primary key in branch timezone |
| `last_value`      | INTEGER | Incremented atomically                   |

#### `tickets`

| Column                     | Type         | Rules                                                                     |
| -------------------------- | ------------ | ------------------------------------------------------------------------- |
| `id`                       | UUID         | Primary key                                                               |
| `branch_id`                | UUID         | FK                                                                        |
| `current_service_type_id`  | UUID         | FK                                                                        |
| `original_service_type_id` | UUID         | FK                                                                        |
| `public_number`            | VARCHAR(30)  | Example `DEP-042`                                                         |
| `business_date`            | DATE         | Date in branch timezone                                                   |
| `daily_sequence`           | INTEGER      | Required                                                                  |
| `status`                   | ENUM         | Six ticket states                                                         |
| `priority`                 | BOOLEAN      | Default false                                                             |
| `priority_reason`          | VARCHAR(50)  | Nullable/private                                                          |
| `queue_entered_at`         | TIMESTAMPTZ  | Required while active                                                     |
| `issued_at`                | TIMESTAMPTZ  | Required                                                                  |
| `called_at`                | TIMESTAMPTZ  | Nullable                                                                  |
| `service_started_at`       | TIMESTAMPTZ  | Nullable                                                                  |
| `completed_at`             | TIMESTAMPTZ  | Nullable                                                                  |
| `cancelled_at`             | TIMESTAMPTZ  | Nullable                                                                  |
| `assigned_counter_id`      | UUID         | Nullable FK                                                               |
| `assigned_staff_id`        | UUID         | Nullable FK                                                               |
| `counter_session_id`       | UUID         | Nullable FK                                                               |
| `no_show_count`            | INTEGER      | Default 0                                                                 |
| `recall_count`             | INTEGER      | Default 0                                                                 |
| `lookup_secret_hash`       | TEXT         | Never return after initial safe creation payload except QR token strategy |
| `idempotency_key`          | UUID/VARCHAR | Unique per kiosk/device scope                                             |
| `version`                  | INTEGER      | Optimistic concurrency support                                            |
| timestamps                 | TIMESTAMPTZ  | Required                                                                  |

Recommended indexes:

- `(branch_id, current_service_type_id, status, priority, queue_entered_at)`
- `(branch_id, business_date, public_number)` unique
- `(assigned_counter_id, status)`
- `(issued_at)` and `(completed_at)` for reporting
- idempotency uniqueness by `(branch_id, idempotency_key)`

#### `ticket_events`

| Column            | Type         | Rules                                                                                                             |
| ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `id`              | UUID         | Primary key                                                                                                       |
| `ticket_id`       | UUID         | FK                                                                                                                |
| `branch_id`       | UUID         | FK                                                                                                                |
| `event_type`      | ENUM/VARCHAR | `ISSUED`, `ENQUEUED`, `CALLED`, `RECALLED`, `SERVICE_STARTED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`, `TRANSFERRED` |
| `from_status`     | ENUM         | Nullable for issue                                                                                                |
| `to_status`       | ENUM         | Nullable if recall only                                                                                           |
| `service_type_id` | UUID         | Context/destination                                                                                               |
| `counter_id`      | UUID         | Nullable                                                                                                          |
| `staff_id`        | UUID         | Nullable                                                                                                          |
| `occurred_at`     | TIMESTAMPTZ  | Required                                                                                                          |
| `reason`          | VARCHAR(255) | Nullable                                                                                                          |
| `metadata`        | JSONB        | Versioned, non-secret context                                                                                     |

Events are append-only in normal application operations.

#### `devices`

Columns: `id`, `branch_id`, `type` (`KIOSK`, `DISPLAY`), `name`, `device_code`, `credential_hash`, `status`, `last_seen_at`, timestamps.

#### `audit_logs`

Columns: `id`, `branch_id`, `actor_type`, `actor_id`, `action`, `target_type`, `target_id`, `outcome`, `reason`, `request_id`, `ip_address`, `user_agent/device_id`, `metadata`, `created_at`.

### 18.3 Data constraints

- Use database foreign keys for all core relationships.
- Use check constraints for valid positive timing settings and daily sequences.
- Use application validation plus partial unique indexes for one active counter session.
- Store timestamps as `TIMESTAMPTZ` in UTC.
- Derive `business_date` using the branch timezone at ticket creation.
- Never hard-delete tickets, ticket events, counter sessions, or audit logs from application endpoints.

---

## 19. REST API Specification

All endpoints use `/api/v1`. JSON error responses use a consistent envelope:

```json
{
  "error": {
    "code": "TICKET_INVALID_STATE",
    "message": "This ticket can no longer be cancelled.",
    "requestId": "req_...",
    "details": {}
  }
}
```

### 19.1 Public/kiosk endpoints

| Method | Endpoint                                | Purpose                                                           |
| ------ | --------------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/public/branches/:branchCode/services` | List active kiosk services and safe live estimates                |
| `POST` | `/public/branches/:branchCode/tickets`  | Generate a ticket; requires device credential and idempotency key |
| `POST` | `/public/tickets/lookup`                | Look up safe status using ticket number + secret/token            |
| `POST` | `/public/tickets/:id/cancel`            | Cancel a waiting ticket using private proof                       |
| `GET`  | `/public/devices/:deviceCode/bootstrap` | Return safe kiosk/display bootstrap configuration                 |

Ticket creation request:

```json
{
  "serviceTypeId": "uuid",
  "priority": false,
  "priorityReason": null,
  "idempotencyKey": "client-generated-uuid"
}
```

Ticket creation response:

```json
{
  "ticket": {
    "id": "uuid",
    "publicNumber": "DEP-042",
    "serviceName": "Cash Deposit",
    "status": "WAITING",
    "issuedAt": "2026-07-05T08:10:00Z",
    "peopleAhead": 4,
    "estimatedWaitMinutes": 12,
    "lookupCode": "739184",
    "lookupToken": "single-purpose-signed-token"
  }
}
```

The plain lookup code/token is returned only to the ticket-creation client and is not logged.

### 19.2 Authentication endpoints

| Method | Endpoint        | Purpose                              |
| ------ | --------------- | ------------------------------------ |
| `POST` | `/auth/login`   | Authenticate staff                   |
| `POST` | `/auth/refresh` | Rotate/refresh authenticated session |
| `POST` | `/auth/logout`  | Revoke session/refresh token         |
| `GET`  | `/auth/me`      | Return current user, role, and scope |

### 19.3 Teller endpoints

| Method | Endpoint                             | Purpose                                |
| ------ | ------------------------------------ | -------------------------------------- |
| `GET`  | `/teller/counters/available`         | Available counters in teller branch    |
| `POST` | `/teller/counter-sessions`           | Open counter session                   |
| `GET`  | `/teller/counter-session/current`    | Current session snapshot               |
| `POST` | `/teller/counter-session/pause`      | Pause if no active ticket              |
| `POST` | `/teller/counter-session/resume`     | Resume paused session                  |
| `POST` | `/teller/counter-session/close`      | Close if no active ticket              |
| `POST` | `/teller/tickets/call-next`          | Atomically call next eligible ticket   |
| `POST` | `/teller/tickets/:ticketId/recall`   | Republish call                         |
| `POST` | `/teller/tickets/:ticketId/start`    | Start service                          |
| `POST` | `/teller/tickets/:ticketId/complete` | Complete service                       |
| `POST` | `/teller/tickets/:ticketId/no-show`  | Return called ticket to queue          |
| `POST` | `/teller/tickets/:ticketId/transfer` | Transfer ticket to destination service |

Every mutation accepts an `Idempotency-Key` header where repeat submission could create multiple effects.

### 19.4 Manager endpoints

| Method      | Endpoint                               | Purpose                                    |
| ----------- | -------------------------------------- | ------------------------------------------ |
| `GET`       | `/manager/dashboard/live`              | Live branch snapshot                       |
| `GET/POST`  | `/manager/services`                    | List/create services                       |
| `GET/PATCH` | `/manager/services/:id`                | Read/update service                        |
| `POST`      | `/manager/services/:id/activate`       | Activate service                           |
| `POST`      | `/manager/services/:id/deactivate`     | Deactivate after validation                |
| `GET/POST`  | `/manager/counters`                    | List/create counters                       |
| `GET/PATCH` | `/manager/counters/:id`                | Read/update counter                        |
| `POST`      | `/manager/counters/:id/assign-service` | Reassign eligible counter                  |
| `GET/POST`  | `/manager/staff`                       | List/create staff                          |
| `GET/PATCH` | `/manager/staff/:id`                   | Read/update staff                          |
| `POST`      | `/manager/staff/:id/reset-password`    | Set temporary credential or reset workflow |
| `POST`      | `/manager/staff/:id/unlock`            | Clear lock state                           |
| `GET`       | `/manager/reports/summary`             | Aggregated report                          |
| `GET`       | `/manager/reports/tickets.csv`         | CSV export                                 |
| `GET`       | `/manager/audit-logs`                  | Paginated audit log                        |
| `GET/PATCH` | `/manager/settings`                    | Read/update validated branch settings      |

### 19.5 Health endpoints

- `GET /health/live` — application process is running.
- `GET /health/ready` — required dependencies are available.

Do not expose configuration values, stack traces, or credentials through health responses.

---

## 20. Real-Time Event Contract

### 20.1 Connection and authorization

- Staff connects using its authenticated session.
- Kiosk/display connects using a registered device credential.
- The backend places clients into a server-authorized room such as `branch:{branchId}`.
- Clients cannot choose an arbitrary branch ID without authorization.
- On every connect/reconnect, the client first fetches a current snapshot.

### 20.2 Events

| Event               | Audience                                            | Minimum payload                                                       |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `ticket.created`    | Teller/manager branch clients                       | ticket ID, public number, service ID, priority, status, issued time   |
| `ticket.updated`    | Teller/manager; kiosk lookup if subscribed securely | ticket ID, safe changed fields, version                               |
| `queue.updated`     | Teller/manager branch clients                       | service ID, waiting counts, oldest wait, version/time                 |
| `display.call`      | Display, teller, manager                            | public number, counter label, service label, called time, recall flag |
| `counter.updated`   | Teller/manager                                      | counter ID, state, service, active ticket safe summary                |
| `dashboard.updated` | Manager                                             | safe KPI delta or instruction to refetch                              |
| `system.notice`     | Relevant devices                                    | maintenance/degraded/reconnect notice                                 |

Example display event:

```json
{
  "event": "display.call",
  "eventId": "uuid",
  "occurredAt": "2026-07-05T08:31:20Z",
  "branchId": "uuid",
  "data": {
    "publicNumber": "DEP-042",
    "counterLabel": "Counter 3",
    "serviceName": "Cash Deposit",
    "recall": false
  }
}
```

Events must contain no customer name, phone, lookup code, authentication token, or internal notes.

### 20.3 Delivery behavior

- REST/database commit is authoritative; WebSocket messages are notifications.
- Publish only after successful commit.
- Clients deduplicate using `eventId`.
- Clients refetch snapshots after reconnect or version gaps.
- The UI must remain safe when an event arrives twice or out of order.

---

## 21. Queue Algorithms and Concurrency

### 21.1 Atomic daily number allocation

Within one database transaction:

1. Determine branch-local business date.
2. Upsert/lock the `daily_sequences` row for branch + service + date.
3. Increment `last_value` and return it.
4. Format the public number as `{SERVICE_CODE}-{zero-padded sequence}`.
5. Insert ticket and initial event.
6. Commit.

The display number is friendly, but the UUID remains the authoritative identity.

### 21.2 Atomic Call Next

The selection must run in a database transaction using row-level locking. A PostgreSQL implementation can use `FOR UPDATE SKIP LOCKED` or an ORM-supported equivalent.

Conceptual algorithm:

```text
assert teller has valid open counter session
assert counter has no active CALLED or IN_SERVICE ticket

begin transaction
  lock counter session
  determine whether priority or standard lane is eligible
  select oldest eligible WAITING ticket
    where branch and service match session
    order by chosen lane, queue_entered_at, daily_sequence
    for update skip locked

  if none: commit and return QUEUE_EMPTY

  update ticket:
    status = CALLED
    assigned_counter_id = session.counter_id
    assigned_staff_id = session.staff_id
    counter_session_id = session.id
    called_at = now
    version = version + 1

  insert CALLED ticket_event
commit
publish display.call, ticket.updated, queue.updated, counter.updated
```

### 21.3 Priority fairness

Maintain the number of consecutive priority calls per service/counter context or derive it from recent call events. Default selection:

1. If only one lane has waiting tickets, select its oldest ticket.
2. If both lanes have tickets and consecutive priority calls are below the configured limit, select the oldest priority ticket.
3. If the priority limit has been reached, select the oldest standard ticket and reset the priority count.

This preserves priority handling without allowing continuous priority arrivals to starve standard customers.

### 21.4 Queue position

Exact positions with priority are policy-dependent. The API should return:

- `peopleAhead`: number of tickets that would currently be selected before this ticket under the configured rule.
- `positionIsEstimate: true` when priority/counter changes can alter the order.

Recalculate on request rather than storing position as a permanent ticket field.

### 21.5 Estimated waiting time

MVP estimate:

```text
effective service minutes =
  recent median service duration for this branch/service
  or configured average_service_minutes when sample size is too small

active counters = number of OPEN, non-paused sessions assigned to service

estimated wait =
  ceil(people ahead × effective service minutes / max(active counters, 1))
```

If there are no active counters, show `Counter temporarily unavailable` or an estimate based on branch policy instead of falsely showing zero.

### 21.6 Idempotency

- Ticket creation, call-next, complete, cancel, transfer, and no-show requests should accept an idempotency key.
- Store the key, operation scope, actor/device, request hash, response status, and result reference for a limited retention period.
- Reusing a key with the same request returns the original result.
- Reusing it with different content returns `IDEMPOTENCY_KEY_CONFLICT`.

---

## 22. Security, Privacy, and Audit

### 22.1 Authentication

- Hash staff passwords with Argon2id or bcrypt.
- Enforce minimum password length and block common passwords in production.
- Use short-lived access sessions and secure, HTTP-only refresh cookies where applicable.
- Rotate refresh tokens and revoke them at logout/password reset/account deactivation.
- Lock or throttle after repeated failed login attempts.
- Do not reveal whether a username exists in failed login messages.

### 22.2 Authorization

Every protected action must validate:

1. User is authenticated.
2. Account is active and not locked.
3. Role allows the action.
4. Requested branch matches authorized scope.
5. Requested counter/session belongs to that branch.
6. Actor owns the active teller session when teller ownership is required.

### 22.3 Device security

- Register each kiosk/display separately.
- Store only hashed device secrets.
- Give display devices read-only, branch-limited capabilities.
- Permit secret rotation and device deactivation.
- Do not embed reusable plaintext production secrets in frontend source code.

### 22.4 Input and transport security

- Validate all request bodies, path parameters, query filters, and pagination values.
- Use parameterized ORM/database calls.
- Configure strict CORS for known origins.
- Use HTTPS outside local-only development.
- Apply rate limits to login, public lookup, cancellation, and ticket creation.
- Protect cookies against CSRF or use an explicit safe token pattern.
- Set security headers through the reverse proxy/framework.

### 22.5 Privacy

- Default MVP tickets are anonymous.
- Do not collect account numbers, balances, government IDs, or banking transaction details.
- Priority reasons are private and excluded from public events/displays.
- Logs must redact passwords, lookup codes, tokens, cookie values, and authorization headers.

### 22.6 Required audit actions

- Login success/failure and logout.
- Staff create/update/activate/deactivate/unlock/reset.
- Service create/update/activate/deactivate.
- Counter create/update/reassign/open/pause/close.
- Ticket manager override/cancel.
- Report export.
- Device register/activate/deactivate/rotate credential.
- Branch settings change.

Audit records are append-only for normal users.

---

## 23. Error Handling and Resilience

### 23.1 Standard domain error codes

| Code                       |            HTTP status | Meaning                                       |
| -------------------------- | ---------------------: | --------------------------------------------- |
| `VALIDATION_ERROR`         |                    400 | Invalid request data                          |
| `AUTHENTICATION_FAILED`    |                    401 | Invalid/expired authentication                |
| `FORBIDDEN`                |                    403 | Role or branch scope denied                   |
| `RESOURCE_NOT_FOUND`       |                    404 | Resource unavailable in scope                 |
| `TICKET_INVALID_STATE`     |                    409 | Action conflicts with ticket state            |
| `COUNTER_BUSY`             |                    409 | Counter has an active ticket/session conflict |
| `QUEUE_EMPTY`              | 409 or safe 200 result | No eligible ticket waiting                    |
| `SERVICE_INACTIVE`         |                    409 | Service changed/inactive                      |
| `IDEMPOTENCY_KEY_CONFLICT` |                    409 | Key reused with different request             |
| `RATE_LIMITED`             |                    429 | Too many requests                             |
| `SYSTEM_UNAVAILABLE`       |                    503 | Required dependency unavailable               |

### 23.2 Client behavior

- Retry only safe reads and explicitly retryable network failures.
- Never blindly retry a mutation without its idempotency key.
- Show a clear message and retain user context.
- After a conflict, refresh authoritative server state.
- After WebSocket reconnect, refetch the current snapshot.

### 23.3 Server behavior

- Include request/correlation IDs.
- Log technical error context without secrets.
- Return safe user-facing messages.
- Do not expose stack traces in non-development environments.
- Use database transactions around multi-record state changes.

---

## 24. Testing Strategy

### 24.1 Unit tests

Required unit-test areas:

- Ticket public-number formatting.
- Ticket-state transition validator.
- Priority fairness selector.
- Wait-time estimator.
- Role and branch authorization policies.
- Counter-session validation.
- Report metric calculations.
- Timezone/business-date handling.

### 24.2 Integration tests

- Ticket creation creates ticket, sequence, and events atomically.
- Duplicate idempotent request returns the same ticket.
- Two concurrent call-next requests receive different tickets.
- Call Next rejects a teller without a valid counter session.
- Start and complete set correct timestamps.
- Cancellation succeeds only from waiting.
- No-show returns ticket to waiting and increments count.
- Transfer changes queue/service and records event.
- Manager-only endpoints reject tellers.
- Branch A user cannot access Branch B data.
- Inactive services cannot issue new tickets.
- Closing a busy counter is rejected.

### 24.3 End-to-end tests

#### E2E-01 Happy path

Customer creates ticket → teller opens counter → teller calls ticket → display shows call → teller starts service → teller completes → manager report count increases.

#### E2E-02 Customer cancellation

Customer creates ticket → looks it up → cancels → teller waiting count decreases → ticket cannot be called.

#### E2E-03 No-show

Teller calls → marks no-show → ticket returns to queue → teller calls another eligible ticket according to policy.

#### E2E-04 Transfer

Teller calls/starts service → transfers to Loans → source counter released → ticket waits in Loans → Loans teller can call it.

#### E2E-05 Concurrency

Create at least 20 waiting tickets → simulate multiple tellers calling simultaneously → assert unique assignments and no lost tickets.

#### E2E-06 Permission isolation

Teller attempts staff/service/report endpoints → all are denied; teller workspace still functions.

### 24.4 Usability tests

With at least five sample users:

- Give no verbal instructions beyond `Please get a Cash Deposit ticket`.
- Record completion rate, completion time, wrong selections, and questions asked.
- Target: at least 4 of 5 complete the task unassisted on the first prototype.
- Revise unclear labels/layout before full implementation.

### 24.5 Performance tests

- Generate 100 tickets across 10 queues.
- Maintain at least 20 staff/display WebSocket clients.
- Run concurrent call-next tests.
- Verify 95th-percentile response and two-second end-to-end update target.

### 24.6 Security tests

- Authentication rate limiting.
- Passwords absent from logs/database plaintext.
- Role escalation attempts.
- Cross-branch ID manipulation.
- Public lookup brute-force resistance.
- Invalid WebSocket room subscription.
- SQL injection and stored/reflected XSS payload validation.
- CSRF protection if cookie sessions are used.

---

## 25. Seed Data and Demo Scenario

### 25.1 Branch

- Code: `MAIN`
- Name: `Main Branch`
- Timezone: configurable; use the intended deployment timezone.

### 25.2 Services

| Code  | Name            | Average minutes | Priority |
| ----- | --------------- | --------------: | :------: |
| `DEP` | Cash Deposit    |               4 |   Yes    |
| `WDR` | Cash Withdrawal |               5 |   Yes    |
| `LON` | Loan Services   |              15 |   Yes    |
| `NAC` | New Account     |              20 |   Yes    |

### 25.3 Counters

- Counter 1 → Cash Deposit.
- Counter 2 → Cash Withdrawal.
- Counter 3 → Loan Services.
- Counter 4 → New Account.

### 25.4 Users

- One manager account.
- At least three teller accounts.
- Seed credentials must be development-only, documented in `.env.example`/README, and forced to change or removed from production deployments.

### 25.5 Demo script

1. Open kiosk, display, teller, and manager in separate browser windows.
2. Create three Deposit tickets and one priority Deposit ticket.
3. Show queue order and estimate.
4. Teller opens Counter 1 and calls next.
5. Display announces the correct ticket/counter.
6. Teller marks one call no-show and shows it returning to the queue.
7. Teller serves and completes a ticket.
8. Transfer one ticket to Loan Services.
9. Customer cancels a waiting ticket using its private code.
10. Manager opens daily report and exports CSV.

---

## 26. Repository Structure

```text
bank-qms/
├── apps/
│   ├── api/                    # NestJS REST/WebSocket backend
│   ├── kiosk-web/              # Customer kiosk client
│   ├── display-web/            # Public display client
│   └── staff-web/              # Teller + manager client
├── packages/
│   ├── shared-types/           # DTO/domain/event TypeScript types
│   ├── validation/             # Shared schemas where safe
│   ├── ui/                     # Shared staff/kiosk UI primitives
│   ├── config/                 # ESLint/TypeScript/build configuration
│   └── localization/           # English and future Amharic strings
├── database/
│   ├── migrations/
│   ├── seed/
│   └── schema/
├── tests/
│   ├── e2e/
│   ├── performance/
│   └── fixtures/
├── docs/
│   ├── api/
│   ├── diagrams/
│   └── operations/
├── docker-compose.yml
├── .env.example
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

### 26.1 Backend module structure example

```text
apps/api/src/modules/tickets/
├── domain/
│   ├── ticket.entity.ts
│   ├── ticket-status.enum.ts
│   ├── ticket-workflow.service.ts
│   └── ticket.errors.ts
├── application/
│   ├── create-ticket.use-case.ts
│   ├── cancel-ticket.use-case.ts
│   ├── call-next-ticket.use-case.ts
│   └── transfer-ticket.use-case.ts
├── infrastructure/
│   ├── ticket.repository.ts
│   └── prisma-ticket.repository.ts
├── presentation/
│   ├── public-tickets.controller.ts
│   └── teller-tickets.controller.ts
└── tickets.module.ts
```

---

## 27. Environment and Local Setup Contract

The repository must include `.env.example` with safe placeholders, never real secrets.

Expected environment variables:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://qms_user:qms_password@postgres:5432/bank_qms
APP_ORIGIN=http://localhost:5173
KIOSK_ORIGIN=http://localhost:5174
DISPLAY_ORIGIN=http://localhost:5175
JWT_ACCESS_SECRET=replace-with-long-random-secret
JWT_REFRESH_SECRET=replace-with-different-long-random-secret
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
PASSWORD_HASH_COST=appropriate-development-value
LOG_LEVEL=debug
DEFAULT_BRANCH_TIMEZONE=Africa/Addis_Ababa
```

Minimum developer commands:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The README must explain:

- Prerequisites.
- Installation.
- Environment setup.
- Database migration and seeding.
- How to start all four interfaces.
- Demo user/device access.
- Test commands.
- Common troubleshooting.
- How to reset demo data safely.

---

## 28. Four-Week Implementation Plan

The process follows the proposal's Iterative Waterfall model with a kiosk/display prototype inside the design phase.

### Week 1 — Requirements and foundation

Deliverables:

- Approve this SRS/implementation specification.
- Confirm service list, counter list, roles, and branch settings.
- Create repository and CI baseline.
- Create Docker Compose and PostgreSQL connection.
- Implement initial database schema and migrations.
- Implement seed data.
- Implement authentication and role/branch authorization skeleton.

Exit gate:

- Requirements are traceable and the seeded database starts reliably.

### Week 2 — Analysis, design, and interface prototype

Deliverables:

- Validate use case, class, sequence, and state models.
- Build clickable kiosk prototype and test it with sample users.
- Build display prototype.
- Implement service/counter/staff CRUD.
- Implement ticket creation, daily numbering, lookup, and cancellation.
- Implement ticket workflow service and event table.

Exit gate:

- A customer can generate and cancel a ticket; prototype feedback is incorporated.

### Week 3 — Queue operations and real-time system

Deliverables:

- Implement counter sessions.
- Implement atomic Call Next.
- Implement recall, start, complete, no-show, and transfer.
- Implement WebSocket authorization and events.
- Connect display, teller console, and live manager dashboard.
- Add unit and integration tests for concurrency/state rules.

Exit gate:

- Complete end-to-end ticket issue → call → display → serve → complete flow works.

### Week 4 — Reports, validation, and deployment

Deliverables:

- Implement reports and CSV export.
- Complete audit logging.
- Complete error handling, validation, loading/empty states, and responsive behavior.
- Run end-to-end, concurrency, usability, and security tests.
- Fix critical/high defects.
- Prepare demo data and user guide.
- Deploy pilot/demo environment.

Exit gate:

- All MVP acceptance criteria and Definition of Done items pass.

### Team work allocation suggestion

| Area                                | Primary owner | Review owner  |
| ----------------------------------- | ------------- | ------------- |
| Backend/domain/database             | Team member A | Team member C |
| Kiosk/display frontend              | Team member B | Team member A |
| Teller/manager frontend and reports | Team member C | Team member B |
| Tests, documentation, integration   | Shared        | Rotate review |

Commit responsibilities by feature, but require peer review for database migrations, authorization, and ticket-state logic.

---

## 29. Definition of Done

The project is done only when all applicable items are true.

### Product

- [ ] Kiosk lists active services and creates a ticket.
- [ ] Ticket output includes number, service, position/estimate, and private lookup mechanism.
- [ ] Printer failure does not create duplicate tickets.
- [ ] Customer can view and cancel a waiting ticket.
- [ ] Teller can authenticate and open a valid counter session.
- [ ] Teller can call, recall, start, complete, no-show, and transfer as allowed.
- [ ] Public display updates in real time and reveals no private data.
- [ ] Manager can manage services, counters, and staff.
- [ ] Manager can view daily/weekly reports and export CSV.
- [ ] Audit records exist for required actions.

### Correctness

- [ ] All ticket transitions follow the defined state model.
- [ ] Concurrent Call Next never assigns one ticket twice.
- [ ] One counter never has two active tickets.
- [ ] One teller/counter never has two active sessions.
- [ ] Priority policy is deterministic and starvation-safe.
- [ ] Timestamps and reports use UTC storage and correct branch-timezone display.

### Security

- [ ] Passwords and device secrets are hashed.
- [ ] Tellers cannot access manager endpoints.
- [ ] Cross-branch access is denied.
- [ ] Public events contain no private fields.
- [ ] Secrets and lookup codes are excluded from logs.
- [ ] Login and public endpoints are rate-limited.
- [ ] Production-like deployment uses HTTPS.

### Quality

- [ ] Lint, formatting, and type-check commands pass.
- [ ] Unit, integration, and end-to-end tests pass.
- [ ] Critical concurrency tests pass repeatedly.
- [ ] No known critical or high-severity defects remain.
- [ ] API documentation is generated and usable.
- [ ] README setup works from a clean checkout.
- [ ] Database migrations run forward successfully.
- [ ] Backup and restore procedure is documented and tested once.

### Academic deliverables

- [ ] SRS is aligned with the implemented system.
- [ ] Use Case Diagram is aligned with implemented actors/use cases.
- [ ] Class Diagram is aligned with core entities and relationships.
- [ ] Sequence Diagram matches Issue → Call → Serve behavior.
- [ ] Statechart matches the implemented ticket workflow.
- [ ] Testing report includes evidence and results.
- [ ] Maintenance plan and future enhancements are documented.

---

## 30. Requirements Traceability Matrix

| Proposal requirement                  | Detailed coverage                  | Primary test evidence                |
| ------------------------------------- | ---------------------------------- | ------------------------------------ |
| FR-1 Generate ticket by service       | FR-001–FR-019, UC-01               | Ticket creation integration + E2E-01 |
| FR-2 Display ticket and wait          | FR-009, FR-015, Sections 13 and 21 | Kiosk E2E/usability test             |
| FR-3 Cancel before called             | FR-016–FR-017, UC-03               | E2E-02 + state test                  |
| FR-4 Teller calls next                | FR-025–FR-028, UC-06               | Concurrency integration + E2E-01     |
| FR-5 Update public display            | FR-057–FR-064, Section 20          | Display E2E-01                       |
| FR-6 Mark completed/remove            | FR-032–FR-033, UC-07               | Workflow integration test            |
| FR-7 Open/close/reassign counters     | FR-042–FR-047                      | Manager/counter tests                |
| FR-8 Daily/weekly reports             | FR-051–FR-053, Section 14          | Report calculation/export tests      |
| FR-9 Staff login                      | FR-020–FR-021, UC-04               | Auth/security tests                  |
| FR-10 Multiple service queues         | FR-001, FR-024–FR-025, data model  | Multi-queue integration test         |
| NFR-1 Two-second response/update      | NFR-001–NFR-002                    | Performance test                     |
| NFR-2 First-time kiosk usability      | NFR-008, Section 24.4              | Observed usability test              |
| NFR-3 99.5% branch-hours availability | NFR-006–NFR-007                    | Health/operations evidence           |
| NFR-4 At least 10 queues              | NFR-004                            | Capacity test                        |
| NFR-5 Authentication/authorization    | Section 22                         | Security test suite                  |
| NFR-6 Modular OOP maintainability     | Sections 16–17 and 26              | Code review/lint/typecheck           |

---

## 31. Maintenance Plan

### 31.1 Routine maintenance

- Review error logs and failed audit outcomes daily during pilot use.
- Monitor API latency, database connectivity, WebSocket connections, and disk space.
- Verify daily backups.
- Apply security and dependency updates through reviewed pull requests.
- Re-run automated tests before deployment.
- Archive or partition old operational events only through an approved retention policy.

### 31.2 Incident priorities

| Priority | Example                                                              | Target response                                         |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| Critical | Duplicate ticket assignment, authentication bypass, data loss        | Stop affected operation immediately; begin fix/rollback |
| High     | Display not updating, cannot call customers, reports seriously wrong | Same business day                                       |
| Medium   | One report filter broken, non-critical UI failure                    | Planned patch                                           |
| Low      | Cosmetic issue or minor text problem                                 | Next routine release                                    |

### 31.3 Change procedure

1. Create a tracked issue with business reason and acceptance criteria.
2. Update this specification when behavior changes.
3. Add/modify automated tests first or alongside the change.
4. Review security, database, and migration impact.
5. Test in a non-production environment.
6. Deploy using versioned releases and a rollback plan.
7. Record release notes.

---

## 32. Instructions for an AI Coding Assistant

When using this document with an AI coding tool, give the tool these execution rules:

1. Treat this file as the authoritative functional specification.
2. Build the project in vertical slices; do not generate the whole system as unverified placeholder code.
3. Start with repository setup, database migrations, seed data, and authentication.
4. Implement ticket-state transitions only through a centralized workflow service.
5. Implement `Call Next` with a real database transaction and row-level concurrency protection.
6. Enforce roles and branch scope in the backend.
7. Publish WebSocket events only after database commit.
8. Never log secrets, passwords, lookup codes, cookies, or authorization headers.
9. Add tests with every feature and run lint, type-check, unit, integration, and build commands.
10. Do not use hardcoded UI data once the corresponding API exists.
11. Do not create fake reports; derive metrics from tickets, events, and counter sessions.
12. Keep the kiosk, display, teller, and manager interfaces visually consistent but optimized for their different environments.
13. Maintain a working README and `.env.example`.
14. Stop and report any ambiguity that would change a core business rule, state transition, security boundary, or database identity strategy.

Recommended implementation order:

```text
Foundation
  → Branch/service/staff/counter configuration
  → Authentication and authorization
  → Ticket creation and cancellation
  → Counter sessions
  → Atomic call-next workflow
  → Start/complete/no-show/transfer
  → Real-time display
  → Live manager dashboard
  → Reports and audit log
  → Hardening, testing, deployment
```

---

## 33. Final Acceptance Scenario

The final demonstration must prove the entire system, not only isolated screens:

1. Manager logs in and verifies four active services and counters.
2. Teller logs in and opens Counter 1 for Cash Deposit.
3. Customer creates a standard Deposit ticket at the kiosk.
4. Another customer creates a priority Deposit ticket.
5. Both tickets print or show valid, distinct public numbers and private lookup details.
6. Teller calls the next eligible ticket according to the configured priority policy.
7. Public display shows the correct ticket and counter within two seconds.
8. Teller recalls, starts service, and completes the ticket.
9. Customer checks the other ticket and sees its latest position/status.
10. Teller calls the next ticket and marks it no-show; it returns to waiting.
11. Teller serves another ticket and transfers it to Loan Services.
12. Customer cancels an eligible waiting ticket.
13. Manager dashboard reflects current queue/counter state.
14. Manager opens the daily report and verifies issued, completed, cancelled, no-show, transfer, wait, and service-time metrics.
15. Manager exports CSV and the export is present in the audit log.
16. Teller attempts a manager-only endpoint and is denied.
17. Automated tests and build pipeline pass.

If all steps succeed and the Definition of Done is satisfied, the Bank Queue Management System MVP is ready for academic submission and pilot demonstration.

---

**End of specification**
