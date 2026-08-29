# Bank QMS iOS applications

The XcodeGen project defines two installable iOS targets:

- `BankQMSCustomer` (`com.bankqms.customer`)
- `BankQMSStaff` (`com.bankqms.staff`)

Requirements: macOS, Xcode 16+, XcodeGen, and an Apple Development team for physical devices.

```bash
cd apps/ios
xcodegen generate
xcodebuild -project BankQMS.xcodeproj -scheme BankQMSCustomer \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -project BankQMS.xcodeproj -scheme BankQMSStaff \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Override `BANK_QMS_START_URL` in each target's build settings for an approved HTTPS deployment. The shared `WKWebView` shell keeps HTTP-only cookies in the system website data store, rejects invalid TLS, prevents cleartext traffic, preserves a safe offline state, and opens untrusted external links outside the app. Signing certificates and provisioning profiles are intentionally excluded from source control.
