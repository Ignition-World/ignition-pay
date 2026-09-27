# Deep linking (issue #677)

The app accepts two link shapes and both must open the installed app:

| Shape | Example | Mechanism |
| --- | --- | --- |
| Custom scheme | `ignitionpay://pay/GABC...?amount=10&asset=USDC` | Android intent-filter / iOS `CFBundleURLTypes` |
| Universal link | `https://ignitionpay.com/pay/GABC...?amount=10` | Android App Links / iOS Universal Links |

[`DeepLinkResolver`](../../lib/core/routing/deep_link.dart) normalises both
shapes into a GoRouter location and falls back to `/` for anything it does not
recognise, so a malformed link never strands the user on the error page.

## Platform configuration in this repo

- **Android** — `android/app/src/main/AndroidManifest.xml` declares the
  `ignitionpay` scheme, plus an `autoVerify` intent-filter for
  `https://ignitionpay.com` and `https://www.ignitionpay.com`.
- **iOS** — `ios/Runner/Info.plist` registers the `ignitionpay` scheme and
  enables `FlutterDeepLinkingEnabled`; `ios/Runner/Runner.entitlements`
  declares the `applinks:ignitionpay.com` associated domain.

## One-time hosting steps

Both association files must be served over HTTPS **without redirects** at the
domain root so the OS can verify ownership.

1. Replace the placeholders:
   - `assetlinks.json` — the `REPLACE_WITH_RELEASE_KEYSTORE_SHA256_FINGERPRINT`
     placeholder with the SHA-256 fingerprint of the release keystore
     (`keytool -list -v -keystore <keystore> | grep SHA256`).
   - `apple-app-site-association` — `REPLACE_WITH_TEAM_ID` with the Apple Team
     ID from the developer account.
2. Publish them at:
   - `https://ignitionpay.com/.well-known/assetlinks.json`
   - `https://ignitionpay.com/.well-known/apple-app-site-association`
3. In Xcode, ensure the **Associated Domains** capability is enabled and the
   `Runner.entitlements` file is assigned to the `Runner` target.

## Verifying

- Android: `adb shell pm get-app-links com.ignitionpay.app` should report
  `verified` for `ignitionpay.com`.
- iOS: reinstall the app after the association file is live, then open the
  universal link from Notes or Safari.
- The GoRouter-level flow is covered by
  `test/router/deep_link_routing_test.dart`.
