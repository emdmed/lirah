#!/bin/bash
# Nevo Terminal Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/emdmed/lirah/main/scripts/install.sh | bash

set -euo pipefail

REPO="emdmed/lirah"
APP_NAME="lirah"
DISPLAY_NAME="Lirah"

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
        DISTRO_ID_LIKE="${ID_LIKE:-}"
    else
        error "Cannot detect distribution (missing /etc/os-release)"
    fi
    info "Detected distribution: $DISTRO_ID"
}

# Fetch a URL to stdout (uses curl or wget)
fetch() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$1"
    else
        error "Neither curl nor wget found. Please install one of them."
    fi
}

# Get latest release version from GitHub
get_latest_version() {
    VERSION=$(fetch "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
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

    CHECKSUM=$(fetch "$CHECKSUMS_URL" 2>/dev/null | grep -F "$FILENAME" | grep -v '\.sig' | cut -d' ' -f1)
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
    # Tauri generates AppImage with format: {ProductName}_{version}_{arch}.AppImage
    FILENAME="${DISPLAY_NAME}_${VERSION_NUM}_${DEB_ARCH}.AppImage"
    URL="https://github.com/$REPO/releases/download/$VERSION/$FILENAME"

    INSTALL_DIR="$HOME/.local/bin"
    APPIMAGE_PATH="$INSTALL_DIR/${APP_NAME}.AppImage"

    mkdir -p "$INSTALL_DIR"

    download "$URL" "$APPIMAGE_PATH"

    CHECKSUM=$(get_checksum "$FILENAME")
    if [ -n "$CHECKSUM" ]; then
        verify_checksum "$APPIMAGE_PATH" "$CHECKSUM"
    fi

    chmod +x "$APPIMAGE_PATH"

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

    # Create symlink so 'lirah' works as a command
    ln -sf "$APPIMAGE_PATH" "$INSTALL_DIR/$APP_NAME"

    info "AppImage installed to: $APPIMAGE_PATH"
    info "Symlinked as: $INSTALL_DIR/$APP_NAME"
    info "Desktop entry created at: $DESKTOP_DIR/${APP_NAME}.desktop"

    # Check if ~/.local/bin is in PATH
    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *)
            warn "~/.local/bin is not in your PATH"
            warn "Add this to your shell config: export PATH=\"\$HOME/.local/bin:\$PATH\""
            ;;
    esac

    info "Installation complete! Run '$APP_NAME' from terminal or launch from your application menu."
}

# Prompt user to install a single dependency
prompt_install() {
    PKG_NAME="$1"
    INSTALL_CMD="$2"
    printf "${YELLOW}[MISSING]${NC} %s is not installed.\n" "$PKG_NAME"
    printf "  Install with: %s\n" "$INSTALL_CMD"
    printf "  Install now? [y/N] "
    read -r REPLY < /dev/tty
    case "$REPLY" in
        [yY]|[yY][eE][sS])
            info "Installing $PKG_NAME..."
            eval "$INSTALL_CMD" || { warn "Failed to install $PKG_NAME"; return 1; }
            info "$PKG_NAME installed successfully"
            ;;
        *)
            warn "Skipping $PKG_NAME"
            return 1
            ;;
    esac
}

# Check if a command exists
has_cmd() {
    command -v "$1" >/dev/null 2>&1
}

# Check if a package is installed (distro-specific)
has_pkg() {
    PKG="$1"
    case "$DISTRO_ID" in
        ubuntu|debian|linuxmint|pop|elementary|zorin|kali)
            dpkg -s "$PKG" >/dev/null 2>&1
            ;;
        arch|manjaro|endeavouros|garuda|artix)
            pacman -Qi "$PKG" >/dev/null 2>&1 || pacman -Qg "$PKG" >/dev/null 2>&1 || return 1
            ;;
        fedora|rhel|centos|rocky|alma|nobara)
            rpm -q "$PKG" >/dev/null 2>&1
            ;;
        opensuse*|suse|sles)
            rpm -q "$PKG" >/dev/null 2>&1
            ;;
        *)
            # Fallback: check ID_LIKE
            case "$DISTRO_ID_LIKE" in
                *debian*|*ubuntu*) dpkg -s "$PKG" >/dev/null 2>&1 ;;
                *fedora*|*rhel*|*suse*) rpm -q "$PKG" >/dev/null 2>&1 ;;
                *) return 1 ;;
            esac
            ;;
    esac
}

# Check and prompt for Tauri build dependencies
check_tauri_deps() {
    info "Checking Tauri build dependencies..."
    MISSING=0

    # Common tools (check via command)
    for CMD in curl wget file; do
        if ! has_cmd "$CMD"; then
            case "$DISTRO_ID" in
                ubuntu|debian|linuxmint|pop|elementary|zorin|kali)
                    prompt_install "$CMD" "sudo apt install -y $CMD" || MISSING=$((MISSING + 1))
                    ;;
                arch|manjaro|endeavouros|garuda|artix)
                    prompt_install "$CMD" "sudo pacman -S --needed --noconfirm $CMD" || MISSING=$((MISSING + 1))
                    ;;
                fedora|rhel|centos|rocky|alma|nobara)
                    prompt_install "$CMD" "sudo dnf install -y $CMD" || MISSING=$((MISSING + 1))
                    ;;
                *)
                    warn "$CMD is missing — please install it manually"
                    MISSING=$((MISSING + 1))
                    ;;
            esac
        fi
    done

    # Distro-specific library packages
    case "$DISTRO_ID" in
        ubuntu|debian|linuxmint|pop|elementary|zorin|kali)
            DEB_DEPS="libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev"
            for PKG in $DEB_DEPS; do
                if ! has_pkg "$PKG"; then
                    prompt_install "$PKG" "sudo apt install -y $PKG" || MISSING=$((MISSING + 1))
                fi
            done
            ;;
        arch|manjaro|endeavouros|garuda|artix)
            ARCH_DEPS="webkit2gtk-4.1 base-devel openssl gtk3 appmenu-gtk-module libappindicator-gtk3 librsvg xdotool"
            for PKG in $ARCH_DEPS; do
                if ! has_pkg "$PKG"; then
                    prompt_install "$PKG" "sudo pacman -S --needed --noconfirm $PKG" || MISSING=$((MISSING + 1))
                fi
            done
            ;;
        fedora|rhel|centos|rocky|alma|nobara)
            FED_DEPS="webkit2gtk4.1-devel openssl-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel"
            for PKG in $FED_DEPS; do
                if ! has_pkg "$PKG"; then
                    prompt_install "$PKG" "sudo dnf install -y $PKG" || MISSING=$((MISSING + 1))
                fi
            done
            # C development group
            if ! dnf group info "C Development Tools and Libraries" 2>/dev/null | grep -q "Installed"; then
                prompt_install "C Development Tools" "sudo dnf group install -y 'C Development Tools and Libraries'" || MISSING=$((MISSING + 1))
            fi
            ;;
        opensuse*|suse|sles)
            SUSE_DEPS="webkit2gtk3-devel libopenssl-devel gtk3-devel libappindicator3-devel librsvg-devel libxdo-devel"
            for PKG in $SUSE_DEPS; do
                if ! has_pkg "$PKG"; then
                    prompt_install "$PKG" "sudo zypper install -y $PKG" || MISSING=$((MISSING + 1))
                fi
            done
            ;;
        *)
            case "$DISTRO_ID_LIKE" in
                *debian*|*ubuntu*)
                    DEB_DEPS="libwebkit2gtk-4.1-dev build-essential libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev"
                    for PKG in $DEB_DEPS; do
                        if ! has_pkg "$PKG"; then
                            prompt_install "$PKG" "sudo apt install -y $PKG" || MISSING=$((MISSING + 1))
                        fi
                    done
                    ;;
                *fedora*|*rhel*)
                    FED_DEPS="webkit2gtk4.1-devel openssl-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel"
                    for PKG in $FED_DEPS; do
                        if ! has_pkg "$PKG"; then
                            prompt_install "$PKG" "sudo dnf install -y $PKG" || MISSING=$((MISSING + 1))
                        fi
                    done
                    ;;
                *)
                    warn "Unknown distro — cannot check Tauri dependencies automatically"
                    warn "See https://v2.tauri.app/start/prerequisites/ for required packages"
                    ;;
            esac
            ;;
    esac

    # Check Rust toolchain
    if ! has_cmd rustc; then
        printf "${YELLOW}[MISSING]${NC} Rust toolchain is not installed.\n"
        printf "  Install with: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\n"
        printf "  Install now? [y/N] "
        read -r REPLY < /dev/tty
        case "$REPLY" in
            [yY]|[yY][eE][sS])
                fetch https://sh.rustup.rs | sh -s -- -y || { warn "Failed to install Rust"; MISSING=$((MISSING + 1)); }
                . "$HOME/.cargo/env"
                info "Rust installed successfully"
                ;;
            *)
                warn "Skipping Rust — required for building Tauri apps"
                MISSING=$((MISSING + 1))
                ;;
        esac
    else
        info "Rust $(rustc --version | cut -d' ' -f2) found"
    fi

    # Check Node.js
    if ! has_cmd node; then
        printf "${YELLOW}[MISSING]${NC} Node.js is not installed.\n"
        printf "  Recommended: install via nvm (https://github.com/nvm-sh/nvm)\n"
        printf "  Install nvm + Node.js now? [y/N] "
        read -r REPLY < /dev/tty
        case "$REPLY" in
            [yY]|[yY][eE][sS])
                fetch https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash || { warn "Failed to install nvm"; MISSING=$((MISSING + 1)); }
                export NVM_DIR="${HOME}/.nvm"
                # shellcheck source=/dev/null
                [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
                nvm install --lts || { warn "Failed to install Node.js"; MISSING=$((MISSING + 1)); }
                info "Node.js $(node --version) installed successfully"
                ;;
            *)
                warn "Skipping Node.js — required for building the frontend"
                MISSING=$((MISSING + 1))
                ;;
        esac
    else
        info "Node.js $(node --version) found"
    fi

    if [ "$MISSING" -gt 0 ]; then
        warn "$MISSING dependency/dependencies were skipped or failed to install"
        printf "  Continue with installation anyway? [y/N] "
        read -r REPLY < /dev/tty
        case "$REPLY" in
            [yY]|[yY][eE][sS]) ;;
            *) error "Aborting installation due to missing dependencies" ;;
        esac
    else
        info "All Tauri dependencies are satisfied!"
    fi
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

    # Check Tauri build dependencies before proceeding
    check_tauri_deps

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
