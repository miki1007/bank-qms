# Android development with VS Code and a physical phone

The repository contains two Android applications:

- `Bank QMS Customer` (`com.bankqms.customer`)
- `Bank QMS Staff` (`com.bankqms.staff`)

Both are secure native Android shells connected to the same Bank QMS backend.
Queue rules remain server-side; the APKs do not contain a second copy of the
business logic.

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

## 3. Choose the backend URL for the APKs

Android builds intentionally accept only HTTPS. For a phone build, use an
approved HTTPS deployment or an HTTPS development tunnel that forwards to the
running web application. Do not weaken the WebView or enable clear-text HTTP
for convenience.

Set the URL at build time; do not include `/customer-app` or `/staff-app` because
the Gradle modules append the correct route:

```bash
gradle -p apps/android \
  -PbankQmsBaseUrl=https://your-approved-bank-qms-host.example \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

On Windows, use `gradlew.bat` from `apps/android` if a system Gradle command is
not installed:

```powershell
cd apps/android
./gradlew.bat -PbankQmsBaseUrl=https://your-approved-bank-qms-host.example :customer-app:assembleDebug :staff-app:assembleDebug
```

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

If the phone shows a connection screen, confirm that the build-time URL is
HTTPS, reachable from the phone, and serving the current Bank QMS version.
