#!/bin/bash
set -e

echo "=== Ignition Pay - Android Development Environment Setup ==="

OS=$(uname -s)
case "$OS" in
    Linux*)   MACHINE=linux;;
    Darwin*)  MACHINE=mac;;
    *)        echo "Unsupported OS: $OS"; exit 1;;
esac
echo "Detected OS: $MACHINE"

ANDROID_STUDIO_PATH=""
if [ "$MACHINE" = "mac" ]; then
    if [ -d "/Applications/Android Studio.app" ]; then
        ANDROID_STUDIO_PATH="/Applications/Android Studio.app"
    fi
else
    if [ -d "/usr/local/android-studio" ]; then
        ANDROID_STUDIO_PATH="/usr/local/android-studio"
    fi
fi

if [ -z "$ANDROID_STUDIO_PATH" ]; then
    echo ""
    echo "=== Step 1: Install Android Studio ==="
    echo "Download from: https://developer.android.com/studio"
    echo ""
    if [ "$MACHINE" = "mac" ]; then
        echo "  brew install --cask android-studio"
    else
        echo "  Download the Linux tarball from the URL above"
        echo "  Extract to /usr/local/android-studio"
    fi
    echo "After installing, launch Android Studio and complete the setup wizard."
    echo ""
    read -p "Press Enter after installing Android Studio..."
else
    echo "Android Studio found at: $ANDROID_STUDIO_PATH"
fi

echo ""
echo "=== Step 2: Configure Android SDK ==="

if [ "$MACHINE" = "mac" ]; then
    DEFAULT_SDK="$HOME/Library/Android/sdk"
else
    DEFAULT_SDK="$HOME/Android/Sdk"
fi

read -p "Android SDK path [$DEFAULT_SDK]: " SDK_PATH
SDK_PATH=${SDK_PATH:-$DEFAULT_SDK}
mkdir -p "$SDK_PATH"

SDKMANAGER="$SDK_PATH/cmdline-tools/latest/bin/sdkmanager"
if [ ! -f "$SDKMANAGER" ]; then
    echo "Installing Android command-line tools..."
    CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-${MACHINE}-11076708_latest.zip"
    TMP_DIR=$(mktemp -d)
    cd "$TMP_DIR"
    curl -o cmdline-tools.zip "$CMDLINE_TOOLS_URL"
    unzip -q cmdline-tools.zip
    mkdir -p "$SDK_PATH/cmdline-tools"
    mv cmdline-tools "$SDK_PATH/cmdline-tools/latest"
    rm -rf "$TMP_DIR"
    SDKMANAGER="$SDK_PATH/cmdline-tools/latest/bin/sdkmanager"
fi

echo "Accepting SDK licenses..."
yes | "$SDKMANAGER" --licenses > /dev/null 2>&1 || true

echo "Installing Android SDK packages..."
"$SDKMANAGER" --install \
    "platforms;android-34" \
    "platforms;android-35" \
    "build-tools;34.0.0" \
    "build-tools;35.0.0" \
    "platform-tools" \
    "emulator" \
    "system-images;android-34;google_apis;x86_64" \
    "system-images;android-35;google_apis;x86_64"

echo ""
echo "=== Step 3: Setup Gradle ==="
if command -v gradle &> /dev/null; then
    echo "Gradle already installed: $(gradle --version | head -1)"
else
    echo "Installing Gradle..."
    if [ "$MACHINE" = "mac" ]; then
        brew install gradle
    else
        GRADLE_VERSION=8.10
        cd /tmp
        curl -L -o gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
        unzip -q gradle.zip
        sudo mv "gradle-${GRADLE_VERSION}" /opt/gradle
        sudo ln -sf /opt/gradle/bin/gradle /usr/local/bin/gradle
    fi
    echo "Gradle installed: $(gradle --version | head -1)"
fi

echo ""
echo "=== Step 4: Create Android Emulator ==="
AVDMANAGER="$SDK_PATH/cmdline-tools/latest/bin/avdmanager"
if [ ! -f "$AVDMANAGER" ]; then
    AVDMANAGER="$SDK_PATH/tools/bin/avdmanager"
fi

echo "Creating Pixel 6 Pro emulator (API 34)..."
echo "no" | "$AVDMANAGER" create avd \
    -n "Pixel_6_Pro_API_34" \
    -k "system-images;android-34;google_apis;x86_64" \
    -d "pixel_6_pro" \
    -f

echo ""
echo "=== Step 5: Configure Environment Variables ==="
SHELL_CONFIG="$HOME/.zshrc"
if [ "$SHELL" = "/bin/bash" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
fi

if ! grep -q "ANDROID_HOME" "$SHELL_CONFIG" 2>/dev/null; then
    {
        echo ""
        echo "# Android SDK"
        echo "export ANDROID_HOME=\"$SDK_PATH\""
        echo "export PATH=\"\$PATH:\$ANDROID_HOME/emulator\""
        echo "export PATH=\"\$PATH:\$ANDROID_HOME/platform-tools\""
        echo "export PATH=\"\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin\""
    } >> "$SHELL_CONFIG"
    echo "Added Android SDK environment to $SHELL_CONFIG"
else
    echo "Android SDK environment already configured in $SHELL_CONFIG"
fi

echo ""
echo "=== Step 6: Configure Flutter Project ==="
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "sdk.dir=$SDK_PATH" > "$PROJECT_ROOT/ignition-mobile/android/local.properties"
echo "Created ignition-mobile/android/local.properties"

echo ""
echo "=== Android Development Environment Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Restart your terminal or run: source $SHELL_CONFIG"
echo "  2. Start the emulator: $SDK_PATH/emulator/emulator -avd Pixel_6_Pro_API_34"
echo "  3. Build the Flutter project: cd ignition-mobile && flutter run"
