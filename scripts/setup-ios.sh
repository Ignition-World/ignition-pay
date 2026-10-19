#!/bin/bash
set -e

echo "=== Ignition Pay - iOS Development Environment Setup ==="

OS=$(uname -s)
if [ "$OS" != "Darwin" ]; then
    echo "iOS development requires macOS. Detected: $OS"
    echo "Xcode and iOS tools are only available on macOS."
    exit 1
fi

echo "=== Step 1: Install Xcode ==="
if xcode-select -p &>/dev/null; then
    XCODE_PATH=$(xcode-select -p)
    echo "Xcode Command Line Tools found at: $XCODE_PATH"
else
    echo "Installing Xcode Command Line Tools..."
    xcode-select --install
    echo "Please complete the installation dialog, then press Enter."
    read -p ""
fi

if [ -d "/Applications/Xcode.app" ]; then
    echo "Xcode found at: /Applications/Xcode.app"
    XCODE_VERSION=$(/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -version 2>/dev/null | head -1)
    echo "Version: $XCODE_VERSION"
else
    echo ""
    echo "Installing Xcode from the Mac App Store..."
    echo "  Download from: https://apps.apple.com/app/xcode/id497799835"
    echo "  OR use: mas install 497799835 (if mas CLI is installed)"
    echo ""
    read -p "Press Enter after installing Xcode..."
fi

echo ""
echo "=== Step 2: Accept Xcode License ==="
if [ -f "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild" ]; then
    sudo "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild" -license accept
    echo "License accepted."
fi

echo ""
echo "=== Step 3: Install iOS Simulator Runtimes ==="
echo "Available simulator runtimes:"
xcrun simctl list runtimes 2>/dev/null || true
echo ""
echo "Installing iOS 18.0 Simulator (if not already present)..."
if ! xcrun simctl list runtimes 2>/dev/null | grep -q "iOS 18.0"; then
    echo "Downloading iOS 18.0 Simulator runtime..."
    xcodebuild -downloadPlatform iOS
else
    echo "iOS 18.0 Simulator already installed."
fi

echo ""
echo "=== Step 4: Create Default Simulator ==="
SIM_NAME="iPhone_16_Pro"
if ! xcrun simctl list devices 2>/dev/null | grep -q "$SIM_NAME"; then
    echo "Creating iPhone 16 Pro simulator..."
    RUNTIME_ID=$(xcrun simctl list runtimes 2>/dev/null | grep "iOS 18.0" | head -1 | sed 's/.*(\(.*\))/\1/' | tr -d ' ')
    if [ -n "$RUNTIME_ID" ]; then
        xcrun simctl create "$SIM_NAME" "iPhone 16 Pro" "$RUNTIME_ID"
        echo "Created: $SIM_NAME"
    else
        echo "Could not find iOS 18.0 runtime. Creating with default runtime."
        xcrun simctl create "$SIM_NAME" "iPhone 16 Pro"
    fi
else
    echo "Simulator $SIM_NAME already exists."
fi

echo ""
echo "=== Step 5: Install CocoaPods ==="
if command -v pod &>/dev/null; then
    echo "CocoaPods already installed: $(pod --version)"
else
    echo "Installing CocoaPods..."
    sudo gem install cocoapods
    echo "CocoaPods installed: $(pod --version)"
fi

echo ""
echo "=== Step 6: Install Flutter iOS Tools ==="
if command -v flutter &>/dev/null; then
    echo "Flutter found, running precache for iOS..."
    flutter precache --ios
else
    echo "Flutter not found. Install from: https://docs.flutter.dev/get-started/install"
fi

echo ""
echo "=== Step 7: Configure Flutter Project for iOS ==="
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ -d "ignition-mobile/ios" ]; then
    echo "iOS directory exists, running pod install..."
    cd ignition-mobile/ios
    pod install 2>/dev/null || echo "Pod install completed with warnings"
else
    echo "Creating iOS platform directory..."
    cd ignition-mobile
    flutter create --platforms=ios .
    echo "iOS platform files generated."
fi

echo ""
echo "=== iOS Development Environment Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Open iOS project: cd ignition-mobile/ios && open Runner.xcworkspace"
echo "  2. Start the simulator: open -a Simulator"
echo "  3. Build and run: cd ignition-mobile && flutter run"
echo ""
echo "Verified tools:"
echo "  Xcode: $(xcodebuild -version 2>/dev/null | head -1 || echo 'check installation')"
echo "  CocoaPods: $(pod --version 2>/dev/null || echo 'check installation')"
echo "  Simulators:"
xcrun simctl list devices 2>/dev/null | grep -E "^    " | head -5 || echo "  No simulators created"
