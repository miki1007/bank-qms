# Bank Queue Management System

## Presentation Overview

**Presenter:** Mikiyas Bayle Derseh  
**Purpose:** Academic presentation and live system demonstration

---

## 1. System Overview

The Bank Queue Management System is a connected digital platform for organizing customer service queues inside a bank branch. It replaces unclear physical lines with numbered tickets, controlled service queues, real-time updates and measurable branch operations.

The main purpose of the system is to make banking service fair, visible, secure and easier to manage. Customers can create and follow tickets without standing continuously in a line. Tellers receive a controlled workflow for serving customers. Managers receive live operational information and reports. Administrators manage the system information and staff access required to keep the branch operating.

The system is divided into separate applications that work together through one shared backend and database. Each application is designed for a specific actor, while the backend applies the central business, security and queue rules.

### Complete Queue Process

**Customer creates a ticket → Ticket enters a strict FIFO service queue → Teller calls the ticket → Public Display and voice announcement notify the customer → Teller serves the customer → Service is completed → Manager sees the result in reports**

The current system uses strict first-in, first-out ordering within each branch and service queue. The earliest eligible waiting ticket is called first. Priority service is not used and priority requests are rejected.

---

## 2. Actors of the System

| Actor | Interface Used | Main Responsibilities | Main Restrictions |
|---|---|---|---|
| Customer | Customer Application | Select a branch and service, create a remote ticket, follow its position and status, cancel when allowed and view personal ticket history. | Can access only tickets owned by the signed-in customer account. |
| Teller | Teller Console | Work from the assigned counter, view the waiting queue, call or recall customers, start and complete service, transfer tickets and record no-shows. | Cannot switch Teller identity or counter, open Manager functions or change Administrator-controlled information. |
| Manager | Manager Dashboard | Monitor live branch activity, queues, counters, Teller activity, performance statistics, reports and exports. | Cannot serve tickets as a Teller or manage system-level Administrator records. |
| Administrator | Administrator Workspace | Manage branches, services, counters, staff accounts, Teller assignments, settings, security information and audit records. | Does not perform Teller queue work or use the Manager operational dashboard. |
| Kiosk | Kiosk Application | Let walk-in customers select an available service and receive a ticket and private lookup code. | Cannot access staff functions or reveal internal customer and branch information. |
| Public Display | Full-Screen Display | Show the current and recent calls and announce the service, ticket digits and counter. | Receives only safe public information and never displays customer identity or private codes. |
| System/API | Shared Backend | Apply authentication, role permissions, strict FIFO rules, ticket-state changes, reporting, storage, auditing and real-time notifications. | All changes must follow the validated server-side rules. |

### Teller, Manager and Administrator Difference

A **Teller** directly serves customers through an assigned counter.

A **Manager** monitors branch operations and evaluates queue and staff performance.

An **Administrator** manages system-level information, configuration and access.

These roles have separate workspaces and permissions. One role cannot silently switch into another role. Every staff actor has a visible logout action.

---

## 3. What the System Does

### Customer Application

The Customer Application focuses only on queue management. It does not expose a banking-account dashboard or real-money functions.

Implemented features include:

- Customer registration and sign-in
- Branch and banking-service selection
- Remote ticket creation
- Ticket number and service confirmation
- Queue position and estimated waiting information
- Live ticket-status updates
- Ticket cancellation while the ticket is still eligible
- Personal ticket history
- Protection that limits each customer to personal ticket information

### Kiosk Application

The Kiosk Application is used by walk-in customers inside the branch. A customer selects an active service and confirms the request. The system creates a ticket in the correct branch and service queue and returns a public ticket number plus a private lookup code.

The private code can be used to check or cancel the Kiosk ticket without revealing personal information on the public display.

### Teller Console

Implemented Teller functions include:

- Teller-only login
- Backend-controlled Teller identity and counter assignment
- Assigned service and counter information
- Waiting queue and active-ticket information
- Call next customer
- Recall a called ticket
- Start service
- Complete service
- Transfer a ticket
- Skip or record an absent customer as a no-show
- Clear logout action

The Call Next operation is controlled by the backend. The Teller cannot manually choose a later ticket and bypass the strict FIFO order.

### Manager Dashboard

The Manager Dashboard provides branch-level operational visibility through:

- Live queue totals
- Service demand
- Oldest waiting tickets
- Counter status
- Teller activity
- Waiting-time and service-time measures
- Throughput, cancellation, transfer and no-show information
- Graphs and branch statistics
- Reports and CSV export

Manager functions are operational and analytical. They are separate from Teller service actions and Administrator configuration.

### Administrator Workspace

The Administrator Workspace provides the implemented system-management functions for:

- Branches
- Banking services
- Counters
- Staff user accounts
- Teller-to-counter assignments
- Branch and queue settings
- Security-related account information
- Audit records

The Administrator workspace is separate from the Teller and Manager workspaces.

### Public Display

The Public Display is designed for a branch television or monitor. It provides:

- A full-screen flight-board-style layout
- The currently called ticket
- Recent calls
- Service name
- Ticket number
- Counter number
- English voice announcements
- Configurable announcement repetition
- Immediate call updates
- Safe public information without customer names or private ticket data

The announcement includes the service, ticket digits and counter so customers can distinguish between services such as Cash Withdrawal, Cash Deposit, Transfer, Loan and New Account.

---

## 4. Technologies Used to Build the System

| Layer | Technology Used | What It Does | Why It Was Used |
|---|---|---|---|
| Programming language | TypeScript | Provides typed application code across the frontend, backend and shared packages. | Helps detect mistakes early and keeps a multi-application project consistent. |
| Frontend | React and Vite | Build the Customer, Kiosk, Staff and Display web interfaces. | Support reusable components, responsive interfaces and fast development builds. |
| Backend | NestJS | Runs the shared API and contains the main queue, security and reporting rules. | Provides a structured architecture for a large TypeScript server. |
| Database | PostgreSQL | Stores permanent tickets, users, branches, services, counters, assignments, events and audit records. | Provides reliable transactions and strong consistency for queue operations. |
| Database management | Prisma ORM | Connects the NestJS backend to PostgreSQL and manages schema changes. | Provides typed database access and controlled migrations. |
| Real-time communication | Socket.IO | Publishes ticket changes and public-call updates immediately. | Supports live events and automatic reconnection for connected applications. |
| Authentication and authorization | Password hashing, signed sessions/tokens and NestJS role guards | Identifies users and enforces Teller, Manager and Administrator permissions. | Protects staff functions and keeps role responsibilities separate. |
| Interface styling | Responsive CSS and shared UI packages | Provides consistent layouts, controls, colours and screen-size behavior. | Keeps the applications visually consistent and usable on different displays. |
| Testing | Vitest, Supertest, Testing Library, Playwright and contract tests | Tests business rules, API behavior, interfaces and complete workflows. | Covers both isolated logic and connected system behavior. |
| Project management | pnpm workspaces | Manages all applications and shared packages in one repository. | Reduces duplication and keeps dependency versions consistent. |
| Local deployment | Docker Compose | Runs PostgreSQL and supports the local development environment. | Makes the database setup repeatable. |
| Hosted demonstration | Private hosted showcase | Provides owner-only demonstration access to the main user experiences. | Allows the completed workflow to be presented online without exposing it as a public banking service. |

---

## 5. High-Level Architecture

~~~text
+--------------------------+        +--------------------------+
| Customer Application     |        | Kiosk Application        |
| Remote ticket creation   |        | Walk-in ticket creation  |
| Queue tracking + history |        | Ticket + private code    |
+------------+-------------+        +-------------+------------+
             \                                     /
              +----------------+------------------+
                               |
+--------------------------+   |    +--------------------------+
| Staff Applications       |   |    | Public Display           |
| Teller                    |   |    | Current + recent calls   |
| Manager                   |   |    | Service, ticket, counter |
| Administrator             |   |    | English voice output     |
+------------+-------------+   |    +------------+-------------+
             \                 |                /
              +----------------+---------------+
                               |
                   HTTPS requests / responses
                               |
                               v
+----------------------------------------------------------------+
| Shared Backend / API - apps/api                                |
| NestJS REST API                                                |
| Authentication + role-based access control                     |
| Strict FIFO queue rules + validation + reports + audit records |
+------------------------------+---------------------------------+
                               |
             +-----------------+-----------------+
             |                                   |
        Prisma ORM                         Socket.IO events
             |                                   |
             v                                   v
+-----------------------------+     +-----------------------------+
| PostgreSQL Database        |     | Real-Time Communication     |
| Tickets, users, branches   |     | Customer ticket updates     |
| Services and counters      |     | Public call updates         |
| Events and audit records   |     | Automatic reconnection      |
+-----------------------------+     +-----------------------------+
~~~

All applications use one shared backend. The backend is the central authority for authentication, strict FIFO processing, ticket-state changes, reporting and security.

PostgreSQL stores the system's permanent information. Prisma provides the controlled connection between the backend and database. Socket.IO sends immediate queue updates to the Customer Application and Public Display.

Authentication and role-based access control protect all staff functions. Teller, Manager and Administrator permissions remain separate.

---

## 6. Authentication and Role-Based Access

Staff members sign in with an individual username and password through the application for their role. The backend identifies the account role and allows only the matching functions.

The local Administrator, Manager and Teller workspaces use separate browser origins. A wrong-role account is rejected instead of being silently redirected into another role's workspace. Tellers are also limited to the identity and counter assignment stored by the backend.

Customer and staff authentication are separate. A signed-in customer can access only personal tickets. A Kiosk ticket requires its private lookup proof. The Public Display receives only the service name, ticket number, counter, time and safe public status.

---

## 7. Non-Functional Requirement Implementation and Testing

The following results describe the latest recorded project verification. Items that still require a dedicated production test are clearly identified.

| Non-Functional Requirement | How It Was Implemented | Test Performed | Actual Result |
|---|---|---|---|
| Performance | Indexed database access, short queue operations and efficient service-specific queries. | Automated workflows processed queue operations and builds; a formal production load benchmark was not completed. | **Not formally tested yet** for production load and response-time targets. |
| Security | Password protection, signed authentication, server-side role guards, separate staff origins and audit records. | Wrong-role access and protected-function checks. | Role isolation checks passed. |
| Reliability | Controlled ticket states, validation, event records and authoritative refresh after reconnection. | Unit and integration checks for legal and illegal ticket transitions. | Automated state-transition checks passed; complete recovery rehearsal is pending. |
| Data consistency | PostgreSQL transactions and controlled state changes keep tickets, counters and events synchronized. | Ticket workflow and database integration checks. | No invalid duplicate transition was recorded in the verified test set. |
| Concurrency safety | Call Next locks eligible queue records during assignment. | Five Teller workers processed 100 tickets concurrently. | All 100 tickets were processed without a duplicate or lost ticket. |
| Strict FIFO ordering | The backend selects the earliest eligible waiting ticket in each service queue. | Tickets were issued in a known order, called concurrently and compared with issue order. A priority request was also attempted. | Call order matched issue order and the priority request was rejected. |
| Real-time responsiveness | Socket.IO events publish ticket and call updates; clients can refresh authoritative state after reconnecting. | Event and contract checks verified update payloads. Full live timing and reconnection testing were not completed. | Payload checks passed; complete browser reconnection timing is **not formally tested yet**. |
| Usability | Purpose-specific applications, clear status labels, focused actions and visible logout controls. | Interface component checks and live workflow review. | Main flows were usable in the reviewed desktop interfaces. |
| Different screen sizes | Responsive layouts and a full-screen Display layout are used. | Automated frontend checks and manual desktop review. | Desktop layouts passed review; complete physical-device acceptance is **not formally tested yet**. |
| Maintainability | TypeScript, modular NestJS features, shared packages, migrations and pnpm workspaces. | Type checking, automated test suites and production-build checks. | TypeScript checks passed and 56 automated checks passed in the latest recorded verification. |
| Scalability | Shared backend, service-specific queues and a multi-branch data model. | Concurrency test completed; production-scale multi-branch load test not completed. | Concurrency test passed; production scalability is **not formally tested yet**. |
| Privacy | Customer ownership checks, private Kiosk proof and restricted Public Display payloads. | Attempts to access another customer's ticket and public-payload contract checks. | Protected ticket access was rejected and public information remained limited. |
| Availability and recovery | Client reconnection behavior, authoritative snapshots and persistent database records. | Basic disconnect/reconnect logic was reviewed. Backup restoration and full outage rehearsal were not completed. | **Not formally tested yet** for production recovery. |
| Build readiness | Separate build and type-check workflows for the applications. | API, Customer, Display, three Staff builds and hosted showcase were compiled. | Those builds passed. The standalone Kiosk production build still references a missing stylesheet and must be rechecked after that asset is restored. |
| Voice announcement | Browser speech creates a service-aware English sentence with ticket digits and counter. | Announcement text tests for service, ticket and counter. | Announcement text checks passed. Audible output still depends on browser permission, one enabling click and the operating-system voice. |

---

## 8. Project Structure

~~~text
bank-qms/
├── apps/
│   ├── api/             # NestJS backend and Prisma database access
│   ├── customer-web/    # Customer queue application
│   ├── kiosk-web/       # Walk-in ticket application
│   ├── staff-web/       # Teller, Manager and Administrator interfaces
│   ├── display-web/     # Public queue display and voice
│   ├── android/         # Android application packaging
│   └── ios/             # iOS application packaging
├── packages/
│   ├── config/          # Shared configuration
│   ├── localization/    # Shared language resources
│   ├── shared-types/    # Shared TypeScript definitions
│   ├── ui/              # Reusable interface elements
│   └── validation/      # Shared validation rules
├── docs/                # Architecture, testing and operating documents
├── tests/               # Cross-application automated tests
├── scripts/             # Project automation and verification scripts
├── docker-compose.yml   # Local PostgreSQL service
├── package.json         # Main project commands
└── pnpm-workspace.yaml  # Workspace application and package definitions
~~~

The **apps** folder contains the runnable applications. The **packages** folder contains reusable code shared by those applications. The **docs** folder contains the system documentation. The **tests** folder contains cross-application verification, while **scripts** contains repeatable project tasks.

---

## 9. Main System Achievements

The completed system demonstrates:

- Multiple connected applications built around one controlled queue workflow
- Strict FIFO processing with priority service disabled
- Transaction-safe Call Next behavior for simultaneous Teller actions
- Immediate ticket and public-call update architecture
- Service-aware English voice announcements
- Clear Teller, Manager and Administrator separation
- Customer ticket ownership protection
- A full-screen public Display with current and recent calls
- Manager statistics, graphs, reports and export
- Administrator control of system information and staff access
- One shared backend and PostgreSQL database
- Shared TypeScript packages and responsive interfaces
- A private hosted showcase for academic demonstration

---

## 10. Current Limitations and Future Improvements

The project is a strong academic prototype, but several production improvements remain:

- Restore the missing standalone Kiosk stylesheet reference and rerun the complete production build.
- Complete formal production load and response-time testing.
- Automate full browser reconnection and audible-voice acceptance tests.
- Complete testing on the physical Kiosk, Display and mobile devices.
- Add monitored database backups and rehearse full restoration.
- Replace development credentials with managed production secrets.
- Strengthen production monitoring, alerting and infrastructure hardening.
- Expand language support when an appropriate speech service or device voice is available.
- Extend multi-branch deployment and operational testing.
- Integrate optional notification channels such as SMS only after privacy and cost requirements are approved.

The system does not connect to a bank's core financial system and does not move real money. It manages queues and demonstration data only.

The private hosted showcase demonstrates the workflow in a constrained hosting environment. The canonical local architecture remains NestJS, PostgreSQL and Socket.IO.

---

## 11. Conclusion

The Bank Queue Management System successfully creates a complete digital path from ticket creation to service completion and management reporting.

It solves the original banking queue problem by replacing uncertain physical lines with fair service-specific FIFO queues, real-time public notification and controlled Teller actions. Its main technical strengths are the shared backend, permanent PostgreSQL storage, concurrency-safe queue operations, Socket.IO communication, role-based protection and privacy-aware public information.

The current project provides a strong foundation for a larger production platform. Future work can strengthen deployment, recovery, monitoring, device testing, language support and multi-branch operation without changing the main queue-management design.
