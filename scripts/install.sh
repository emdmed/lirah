#!/bin/sh
# Nevo Terminal Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/emdmed/ao-terminal/main/scripts/install.sh | sh

set -e

REPO="emdmed/ao-terminal"
APP_NAME="nevo-terminal"
DISPLAY_NAME="Nevo Terminal"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() {
    printf "${GREEN}[INFO]${NC} %s\n" "$1"
}

warn() {
    printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

error() {
    printf "${RED}[ERROR]${NC} %s\n" "$1"
    exit 1
}

# Detect architecture
detect_arch() {
    ARCH=$(uname -m)
    case "$ARCH" in
        x86_64|amd64)
            ARCH="x86_64"
            DEB_ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="aarch64"
            DEB_ARCH="arm64"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac
    info "Detected architecture: $ARCH"
}

# Detect Linux distribution
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_ID="$ID"
        DISTRO_ID_LIKE="$ID_LIKE"
    else
        error "Cannot detect distribution (missing /etc/os-release)"
    fi
    info "Detected distribution: $DISTRO_ID"
}

# Get latest release version from GitHub
get_latest_version() {
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    if [ -z "$VERSION" ]; then
        error "Failed to get latest version from GitHub"
    fi
    # Remove 'v' prefix if present for version number
    VERSION_NUM="${VERSION#v}"
    info "Latest version: $VERSION"
}

# Download file with progress
download() {
    URL="$1"
    OUTPUT="$2"
    info "Downloading: $URL"
    if command -v wget >/dev/null 2>&1; then
        wget -q --show-progress -O "$OUTPUT" "$URL" || error "Download failed"
    elif command -v curl >/dev/null 2>&1; then
        curl -fSL --progress-bar -o "$OUTPUT" "$URL" || error "Download failed"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Verify SHA256 checksum
verify_checksum() {
    FILE="$1"
    EXPECTED="$2"

    if command -v sha256sum >/dev/null 2>&1; then
        ACTUAL=$(sha256sum "$FILE" | cut -d' ' -f1)
    elif command -v shasum >/dev/null 2>&1; then
        ACTUAL=$(shasum -a 256 "$FILE" | cut -d' ' -f1)
    else
        warn "No checksum utility found, skipping verification"
        return 0
    fi

    if [ "$ACTUAL" != "$EXPECTED" ]; then
        error "Checksum verification failed!\nExpected: $EXPECTED\nActual: $ACTUAL"
    fi
    info "Checksum verified successfully"
}

# Get checksum for a specific file from checksums.sha256
get_checksum() {
    FILENAME="$1"
    CHECKSUMS_URL="https://github.com/$REPO/releases/download/$VERSION/checksums.sha256"

    CHECKSUM=$(curl -fsSL "$CHECKSUMS_URL" 2>/dev/null | grep "$FILENAME" | cut -d' ' -f1)
    if [ -z "$CHECKSUM" ]; then
        warn "Could not fetch checksum for $FILENAME"
        echo ""
    else
        echo "$CHECKSUM"
    fi
}

# Install using DEB package
install_deb() {
    FILENAME="${APP_NAME}_${VERSION_NUM}_${DEB_ARCH}.deb"
    URL="https://github.com/$REPO/releases/download/$VERSION/$FILENAME"
    TMPFILE="/tmp/$FILENAME"

    download "$URL" "$TMPFILE"

    CHECKSUM=$(get_checksum "$FILENAME")
    if [ -n "$CHECKSUM" ]; then
        verify_checksum "$TMPFILE" "$CHECKSUM"
    fi

    info "Installing DEB package..."
    if command -v apt >/dev/null 2>&1; then
        sudo apt install -y "$TMPFILE"
    elif command -v dpkg >/dev/null 2>&1; then
        sudo dpkg -i "$TMPFILE" || sudo apt-get install -f -y
    else
        error "Neither apt nor dpkg found"
    fi

    rm -f "$TMPFILE"
    info "Installation complete!"
}

# Install using RPM package
install_rpm() {
    FILENAME="${APP_NAME}-${VERSION_NUM}-1.${ARCH}.rpm"
    URL="https://github.com/$REPO/releases/download/$VERSION/$FILENAME"
    TMPFILE="/tmp/$FILENAME"

    download "$URL" "$TMPFILE"

    CHECKSUM=$(get_checksum "$FILENAME")
    if [ -n "$CHECKSUM" ]; then
        verify_checksum "$TMPFILE" "$CHECKSUM"
    fi

    info "Installing RPM package..."
    if command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y "$TMPFILE"
    elif command -v zypper >/dev/null 2>&1; then
        sudo zypper install -y "$TMPFILE"
    elif command -v rpm >/dev/null 2>&1; then
        sudo rpm -i "$TMPFILE"
    else
        error "No RPM package manager found (dnf/zypper/rpm)"
    fi

    rm -f "$TMPFILE"
    info "Installation complete!"
}

# Install using AppImage (fallback)
install_appimage() {
    FILENAME="${DISPLAY_NAME}-${VERSION}-${ARCH}.AppImage"
    # Handle spaces in filename for URL encoding
    FILENAME_URL=$(echo "$FILENAME" | sed 's/ /%20/g')
    URL="https://github.com/$REPO/releases/download/$VERSION/$FILENAME_URL"

    INSTALL_DIR="$HOME/.local/bin"
    APPIMAGE_PATH="$INSTALL_DIR/${APP_NAME}.AppImage"

    mkdir -p "$INSTALL_DIR"

    download "$URL" "$APPIMAGE_PATH"
    chmod +x "$APPIMAGE_PATH"

    CHECKSUM=$(get_checksum "$FILENAME")
    if [ -n "$CHECKSUM" ]; then
        verify_checksum "$APPIMAGE_PATH" "$CHECKSUM"
    fi

    # Create desktop entry
    DESKTOP_DIR="$HOME/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"

    cat > "$DESKTOP_DIR/${APP_NAME}.desktop" << EOF
[Desktop Entry]
Type=Application
Name=$DISPLAY_NAME
Comment=GUI for Claude Code with integrated terminal and file browser
Exec=$APPIMAGE_PATH
Icon=$APP_NAME
Terminal=false
Categories=Development;Utility;
StartupWMClass=$APP_NAME
EOF

    info "AppImage installed to: $APPIMAGE_PATH"
    info "Desktop entry created at: $DESKTOP_DIR/${APP_NAME}.desktop"

    # Check if ~/.local/bin is in PATH
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *)
            warn "~/.local/bin is not in your PATH"
            warn "Add this to your shell config: export PATH=\"\$HOME/.local/bin:\$PATH\""
            ;;
    esac

    info "Installation complete! You can run '$APP_NAME.AppImage' or launch from your application menu."
}

# Main installation logic
main() {
    info "Installing $DISPLAY_NAME..."

    # Check for root (we need sudo for package installation)
    if [ "$(id -u)" = "0" ]; then
        warn "Running as root. Consider running as a normal user (sudo will be used when needed)."
    fi

    detect_arch
    detect_distro
    get_latest_version

    # Determine installation method based on distro
    case "$DISTRO_ID" in
        ubuntu|debian|linuxmint|pop|elementary|zorin|kali)
            install_deb
            ;;
        fedora|rhel|centos|rocky|alma|nobara)
            install_rpm
            ;;
        opensuse*|suse|sles)
            install_rpm
            ;;
        arch|manjaro|endeavouros|garuda|artix)
            # Arch-based distros: try AppImage since there's no native package
            info "Arch-based distro detected, using AppImage..."
            install_appimage
            ;;
        *)
            # Check ID_LIKE for derivatives
            case "$DISTRO_ID_LIKE" in
                *debian*|*ubuntu*)
                    install_deb
                    ;;
                *fedora*|*rhel*)
                    install_rpm
                    ;;
                *suse*)
                    install_rpm
                    ;;
                *)
                    warn "Unknown distribution: $DISTRO_ID"
                    info "Falling back to AppImage installation..."
                    install_appimage
                    ;;
            esac
            ;;
    esac
}

main "$@"
