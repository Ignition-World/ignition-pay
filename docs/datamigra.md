# iOS Development Environment Setup

## Prerequisites

- macOS (Apple Silicon or Intel) — Xcode requires macOS
- At least 8GB RAM (16GB recommended)
- 15GB free disk space for Xcode and simulators
- Apple ID (free) for simulator access

## Quick Start

Run the automated setup script:

```bash
bash scripts/setup-ios.sh
```

The script will:

1. Install Xcode Command Line Tools
2. Accept the Xcode license
3. Download iOS 18.0 Simulator runtime
4. Create an iPhone 16 Pro simulator
5. Install CocoaPods for iOS dependencies
6. Run Flutter iOS precache
7. Generate iOS platform files with flutter create

## Manual Setup

### Step 1: Install Xcode

Download from the [Mac App Store](https://apps.apple.com/app/xcode/id497799835) or:

```bash
# Using mas CLI
mas install 497799835
```

After installation, open Xcode once to complete the setup.

### Step 2: Install Command Line Tools

```bash
xcode-select --install
```

### Step 3: Accept License

```bash
sudo xcodebuild -license accept
```

### Step 4: Install iOS Simulator

Open Xcode > Settings > Platforms, click "+" next to iOS 18.0.

Or via command line:

```bash
xcodebuild -downloadPlatform iOS
```

### Step 5: Create Simulator

```bash
xcrun simctl create "iPhone 16 Pro" "iPhone 16 Pro" "com.apple.CoreSimulator.SimRuntime.iOS-18-0"
```

### Step 6: Install CocoaPods

```bash
sudo gem install cocoapods
```

### Step 7: Flutter iOS Setup

```bash
flutter precache --ios
cd ignition-mobile
flutter create --platforms=ios .
cd ios && pod install
```

### Step 8: Verify

```bash
flutter doctor
open -a Simulator
cd ignition-mobile && flutter run
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| xcrun: error: unable to find utility "simctl" | Install Xcode Command Line Tools |
| CocoaPods installation fails | Run sudo gem update --system before install |
| Flutter doctor shows no iOS toolchain | Run xcode-select -s /Applications/Xcode.app/Contents/Developer |
| Pod install fails | Run pod repo update then pod install again |

## Resources

- [Xcode Documentation](https://developer.apple.com/documentation/xcode)
- [Flutter iOS Setup](https://docs.flutter.dev/get-started/install/macos/mobile-ios)
- [CocoaPods Guide](https://guides.cocoapods.org/)
