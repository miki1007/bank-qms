# Bank QMS Android applications

Open this directory as a project in Android Studio, or run Gradle 8.10+ with Android SDK 35 and JDK 17.

```bash
gradle :customer-app:assembleDebug :staff-app:assembleDebug
gradle test
```

Set a different connected deployment at build time when required:

```bash
gradle -PbankQmsBaseUrl=https://your-approved-domain.example \
  :customer-app:assembleDebug :staff-app:assembleDebug
```

Only use an HTTPS deployment that serves `/customer-app` and `/staff-app`. Never place a preview bypass token, staff password, API key or signing key in this project. The default private showcase may ask the owner to authenticate. Production signing is intentionally not configured in source control.
