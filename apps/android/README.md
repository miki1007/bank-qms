# Bank QMS native Android applications

This Gradle project builds two real Android applications. They are not WebView
launchers and do not download their interface from the website.

- `customer-app`: account access, branch/service selection, priority assistance,
  ticket creation, live status, ticket history and cancellation.
- `staff-app`: independent teller authentication, fixed manager-assigned counter,
  queue metrics, Call Next, Recall, Start, Complete, No-show, Transfer and
  counter-session controls.
- `mobile-core`: encrypted Android Keystore sessions, REST client, refresh-token
  rotation, Socket.IO synchronization, duplicate-event protection and the shared
  Compose visual system.

Open this directory in Android Studio (JDK 17, Android SDK 35), allow Gradle to
sync, and run either application configuration. From a terminal with Gradle
8.10+:

```bash
gradle test :customer-app:assembleDebug :staff-app:assembleDebug
```

Debug builds default to the Android Emulator host at
`http://10.0.2.2:3000/api/v1`. Select another real backend at build time:

```bash
gradle -PbankQmsApiUrl=https://qms-api.your-domain.example/api/v1 \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

For a physical phone on the same private Wi-Fi during development, use the
computer's LAN address, for example
`-PbankQmsApiUrl=http://192.168.1.20:3000/api/v1`. Clear-text traffic is enabled
only in debug builds; release builds require HTTPS. Never place credentials,
preview bypass tokens or signing keys in this project.

The APK contains the interface and application logic, but PostgreSQL and the
NestJS API remain authoritative and must be reachable from the device. The
staff application never exposes a counter picker: it uses only the counter
assigned to the signed-in teller by a manager.
