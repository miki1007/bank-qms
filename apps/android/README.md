# Bank QMS native Android applications

This Gradle project builds two real Android applications. They are not WebView
launchers and do not download their interface from the website.

- `customer-app`: account access and branch/service queue selection,
  ticket creation, live status, ticket history and cancellation.
- `staff-app`: independent teller authentication, fixed manager-assigned counter,
  queue metrics, Call Next, Recall, Start, Complete, No-show, Transfer and
  counter-session controls.
- `mobile-core`: encrypted Android Keystore sessions, REST client, refresh-token
  rotation, Socket.IO synchronization, duplicate-event protection and the shared
  Compose visual system. It also provides first-run server discovery, readiness
  verification and locally persisted server settings.

## First launch on a phone

The APK is no longer tied to the emulator address. On first launch, both apps
show **Connect this phone** and verify the selected backend before presenting
login or registration.

1. Start PostgreSQL and the Bank QMS API on the computer.
2. Put the Android phone and computer on the same private Wi-Fi.
3. Find the computer's IPv4 address (`ipconfig` on Windows).
4. Enter an address such as `192.168.1.20:3000`. The debug app adds
   `http://` and `/api/v1` when omitted.
5. Tap **Connect and continue**. The app checks `/health/ready` and explains
   Wi-Fi, firewall, API or database problems without storing an invalid server.

The selected address is remembered. From either login screen, tap the displayed
server address to change it. Changing servers clears the old authenticated
session so credentials from one deployment are never sent to another.

Open this directory in Android Studio (JDK 17, Android SDK 35), allow Gradle to
sync, and run either application configuration. From a terminal with Gradle
8.10+:

```bash
gradle test :customer-app:assembleDebug :staff-app:assembleDebug
```

The setup screen initially suggests the Android Emulator host at
`http://10.0.2.2:3000/api/v1`. A backend can still be selected at build time:

```bash
gradle -PbankQmsApiUrl=https://qms-api.your-domain.example/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

For a physical phone, using `-PbankQmsApiUrl` only changes the initial
suggestion; the address remains editable in the debug app. Clear-text traffic
is enabled only in debug builds; release builds accept HTTPS endpoints only.
Never place credentials, preview bypass tokens or signing keys in this project.

The APK contains the interface and application logic, but PostgreSQL and the
NestJS API remain authoritative and must be reachable from the device. The
staff application never exposes a counter picker: it uses only the counter
assigned to the signed-in teller by a manager.
