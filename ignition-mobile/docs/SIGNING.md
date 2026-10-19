# App Signing Guide

## Android

1. Generate a keystore:
   ```bash
   keytool -genkey -v -keystore ignition-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias ignition
   ```
2. Place `ignition-release.jks` in `android/app/`.
3. Create `android/key.properties` with storePassword, keyPassword, keyAlias, storeFile.

## iOS

1. Create an App ID in Apple Developer Portal.
2. Generate a Distribution Certificate and Provisioning Profile.
3. Import into Xcode under Signing & Capabilities.

## CI/CD

Store as encrypted secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`, `IOS_CERTIFICATE_BASE64`.
