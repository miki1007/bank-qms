# Android development with VS Code and a physical phone

The repository contains two Android applications:

- `Bank QMS Customer` (`com.bankqms.customer`)
- `Bank QMS Staff` (`com.bankqms.staff`)

Both are native Jetpack Compose Android applications connected to the same Bank
QMS backend. Their screens and interaction logic are packaged in the APK; queue
rules remain server-side so there is no competing copy of the domain workflow.

## 1. Install the development tools

Install Git, VS Code, Node.js 22+, pnpm 10, Docker Desktop, JDK 17, and the
Android SDK. Android Studio is the simplest way to install the Android SDK,
platform tools, and an emulator even if source editing is done in VS Code.

Recommended VS Code extensions:

- ESLint
- Prettier
- Java Extension Pack
- Gradle for Java

## 2. Open and start Bank QMS

```bash
git clone https://github.com/miki1007/bank-qms.git
cd bank-qms
code .
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
NODE_ENV=development pnpm db:seed
pnpm dev
```

Replace every placeholder in `.env` before migrating or seeding. The four local
teller accounts are `teller.one`, `teller.two`, `teller.three`, and
`teller.four`; their password is the development value chosen in
`DEV_TELLER_PASSWORD`. They are assigned to Counters 1–4 respectively.

## 3. Choose the API URL for the APKs

The value identifies the NestJS REST API. Including `/api/v1` is recommended;
the mobile core appends it if omitted. Release builds intentionally accept only
HTTPS. Debug builds also allow a private development address so a physical phone
on the same trusted Wi-Fi can reach the computer running Docker and NestJS.

Build against an HTTPS deployment:

```bash
gradle -p apps/android \
  -PbankQmsApiUrl=https://qms-api.your-approved-host.example/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

On Windows, install Gradle 8.10.2 (or let Android Studio configure that Gradle
version), then run the same build from PowerShell:

```powershell
cd apps/android
gradle -PbankQmsApiUrl=https://qms-api.your-approved-host.example/api/v1 :customer-app:assembleDebug :staff-app:assembleDebug
```

For the Android Emulator, the default `http://10.0.2.2:3000/api/v1` reaches the
host computer. For a physical phone, find the computer's LAN address and use it
in a debug build, for example:

```bash
gradle -p apps/android \
  -PbankQmsApiUrl=http://192.168.1.20:3000/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

Keep the phone and computer on the same private network and allow TCP port 3000
through the development firewall. Never use clear-text HTTP for a distributed
or production build.

## 4. Install on a physical Android phone

On the phone, enable Developer options and USB debugging, connect the USB cable,
approve the computer, then confirm the device:

```bash
adb devices
```

Install both debug APKs:

```bash
adb install -r apps/android/customer-app/build/outputs/apk/debug/customer-app-debug.apk
adb install -r apps/android/staff-app/build/outputs/apk/debug/staff-app-debug.apk
```

You can also copy each APK to the phone and open it manually. Android may ask
for permission to install an app from the Files application. Debug APKs are for
private testing only and must not be treated as Play Store releases.

## 5. Verify the phone flow

1. Open Bank QMS Customer and create a standard ticket.
2. Create priority tickets only after choosing a private eligibility reason.
3. Open Bank QMS Staff and sign in as the teller assigned to that service.
4. Confirm the app shows only that teller's assigned counter.
5. Tap Call Next, start service, and complete the ticket.
6. Confirm the public display and manager dashboard update.

If the phone reports a connection problem, confirm that the build-time API URL
is reachable from the phone, the API health check responds, and PostgreSQL is
running. A working website URL is not enough: the mobile apps connect directly
to the `/api/v1` backend.
