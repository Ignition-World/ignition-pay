# App Store and Play Store Setup

This document captures the repository-side preparation for publishing Ignition Pay on Apple App Store Connect and Google Play Console.

> **Status:** the repository side (bundle identifiers, signing wiring, fastlane
> lanes, and metadata text) is now complete and consistent across platforms.
> What remains is account-level work that only an org owner can do: creating
> the actual App Store Connect / Google Play Console records, paying the
> developer fees, and capturing real screenshots. See "Remaining manual steps"
> below.

## App identifiers (already aligned)
- Android `applicationId` / iOS `PRODUCT_BUNDLE_IDENTIFIER`: `com.ignitionpay.app`
- Display name on both platforms: `Ignition Pay`
- These match `docs/store-metadata-template.json`.

## Fastlane lanes

Both platforms now have fastlane scaffolding under `android/fastlane/` and
`ios/fastlane/`, with metadata text files pre-filled from
`store-metadata-template.json`.

```bash
# Android (run from ignition-mobile/android)
bundle exec fastlane metadata   # push text + screenshots only, no binary
bundle exec fastlane internal   # build AAB + upload to internal testing track
bundle exec fastlane promote_to_production

# iOS (run from ignition-mobile/ios)
bundle exec fastlane metadata   # push text + screenshots only, no binary
bundle exec fastlane beta       # build IPA + upload to TestFlight
bundle exec fastlane release    # submit current build for App Store review
```

`fastlane metadata` for Android needs `android/fastlane/play-console-key.json`
(a Play Console service-account key, not committed). `fastlane` for iOS reads
`FASTLANE_APPLE_ID`, `FASTLANE_ITC_TEAM_ID`, and `FASTLANE_TEAM_ID` from the
environment — set these as CI secrets once the Apple Developer account exists.

## 1. App Store Connect (iOS)

### Create the app record
- Sign in to App Store Connect.
- Create or select the team/account that will own the app.
- Create a new app record for Ignition Pay.
- Set the bundle identifier to the value used by the iOS app target.
- Choose the primary language and SKU.

### Configure release channels
- Create a production release candidate once the build is ready.
- Add internal testers and external testers as needed.
- Prepare a release submission checklist for review.

### Fill metadata
- App name
- Subtitle
- Promotional text
- Description
- Keywords
- Privacy policy URL
- Support URL
- Marketing URL
- Category and age rating

### Prepare screenshots
- Capture screenshots for the required iPhone and iPad sizes.
- Store them in the project folder for later upload.

## 2. Google Play Console (Android)

### Create the app record
- Sign in to Google Play Console.
- Create a new app entry for Ignition Pay.
- Set the default language and app category.
- Link the app to the correct Google Play signing configuration.

### Configure release channels
- Create an internal testing track.
- Add closed testing and open testing tracks as release stages.
- Promote builds from internal -> closed -> open once approved.

### Fill metadata
- App title
- Short description
- Full description
- Feature graphic
- Phone and tablet screenshots
- Privacy policy URL
- Support URL
- Contact email
- Category and tags

## 3. Repository checklist

### Required assets
- App icon
- Privacy policy URL
- Support URL
- App store screenshots
- Play Store feature graphic

### Suggested folder layout
- [ignition-mobile/docs/screenshots/ios](screenshots/ios)
- [ignition-mobile/docs/screenshots/android](screenshots/android)

### Metadata template
Use the metadata template in [ignition-mobile/docs/store-metadata-template.json](store-metadata-template.json) as the starting point for both stores.

## 4. Release notes template
- What changed in this version
- New features and fixes
- Known limitations
- Security or compliance notes

## Remaining manual steps (require org owner access)

These cannot be done from a PR — they require an Apple Developer account
($99/yr, possibly a D-U-N-S number for an org account) and a Google Play
Developer account ($25 one-time), owned and paid for by Ignition-World:

1. Create the App Store Connect app record under the `com.ignitionpay.app`
   bundle ID and the Google Play Console app under the same package name.
2. Generate the Android release keystore (`docs/SIGNING.md`) and the iOS
   distribution certificate / provisioning profile, then store them as CI
   secrets (`ANDROID_KEYSTORE_BASE64`, `IOS_CERTIFICATE_BASE64`, etc.).
3. Capture real screenshots into `docs/screenshots/ios` and
   `docs/screenshots/android` (see the README in each folder for required
   sizes), and replace the placeholder URLs in the metadata files
   (`privacy_url.txt`, `support_url.txt`, `marketing_url.txt`) with the real
   ones.
4. Run `fastlane metadata` on each platform once the service-account key /
   App Store Connect API credentials are in place.
