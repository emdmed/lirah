#!/bin/bash

# Dependency installer for Lirah
# Checks for and installs required system libraries

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to detect package manager
detect_package_manager() {
    if command -v apt &> /dev/null; then
        echo "apt"
    elif command -v dnf &> /dev/null; then
        echo "dnf"
    elif command -v yum &> /dev/null; then
        echo "yum"
    elif command -v pacman &> /dev/null; then
        echo "pacman"
    elif command -v zypper &> /dev/null; then
        echo "zypper"
    else
        echo "unknown"
    fi
}

# Function to check if package is installed
is_package_installed() {
    local pkg=$1
    local pkg_manager=$2
    
    case $pkg_manager in
        "apt")
            dpkg -l | grep -q "^ii.*$pkg"
            ;;
        "dnf"|"yum")
            rpm -q "$pkg" &> /dev/null
            ;;
        "pacman")
            pacman -Q "$pkg" &> /dev/null
            ;;
        "zypper")
            zypper search -i "$pkg" &> /dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to install packages based on package manager
install_packages() {
    local pkgs=("$@")
    local pkg_manager=$(detect_package_manager)
    
    case $pkg_manager in
        "apt")
            print_status "Using apt package manager"
            print_status "Installing packages: ${pkgs[*]}"
            sudo apt update
            sudo apt install -y "${pkgs[@]}"
            ;;
        "dnf")
            print_status "Using dnf package manager"
            print_status "Installing packages: ${pkgs[*]}"
            sudo dnf install -y "${pkgs[@]}"
            ;;
        "yum")
            print_status "Using yum package manager"
            print_status "Installing packages: ${pkgs[*]}"
            sudo yum install -y "${pkgs[@]}"
            ;;
        "pacman")
            print_status "Using pacman package manager"
            print_status "Installing packages: ${pkgs[*]}"
            sudo pacman -S --noconfirm "${pkgs[@]}"
            ;;
        "zypper")
            print_status "Using zypper package manager"
            print_status "Installing packages: ${pkgs[*]}"
            sudo zypper install -y "${pkgs[@]}"
            ;;
        *)
            print_error "Unsupported package manager. Please install manually:"
            echo "  - libcairo2-dev (Ubuntu/Debian) or cairo-devel (Fedora/CentOS) or cairo (Arch)"
            echo "  - pkg-config (Ubuntu/Debian) or pkgconf (Arch)"
            exit 1
            ;;
    esac
}

# Function to check pkg-config for Cairo
check_cairo_with_pkg_config() {
    if command -v pkg-config &> /dev/null; then
        if pkg-config --exists cairo; then
            print_status "Cairo found via pkg-config"
            pkg-config --modversion cairo
            return 0
        else
            print_warning "Cairo not found via pkg-config"
            return 1
        fi
    else
        print_warning "pkg-config not found"
        return 1
    fi
}

# Main function
main() {
    print_status "Checking dependencies for Lirah..."
    
    local pkg_manager=$(detect_package_manager)
    print_status "Detected package manager: $pkg_manager"
    
    # Define packages based on distribution
    local packages=()
    case $pkg_manager in
        "apt")
            packages=("libcairo2-dev" "pkg-config")
            ;;
        "dnf"|"yum")
            packages=("cairo-devel" "pkgconfig")
            ;;
        "pacman")
            packages=("cairo" "pkgconf")
            ;;
        "zypper")
            packages=("cairo-devel" "pkg-config")
            ;;
        *)
            print_error "Unsupported Linux distribution"
            print_status "Please install manually:"
            echo "  Ubuntu/Debian: sudo apt install libcairo2-dev pkg-config"
            echo "  Fedora/CentOS: sudo dnf install cairo-devel pkgconfig"
            echo "  Arch Linux: sudo pacman -S cairo pkgconf"
            exit 1
            ;;
    esac
    
    # Check if packages are already installed
    local missing_packages=()
    for pkg in "${packages[@]}"; do
        if ! is_package_installed "$pkg" "$pkg_manager"; then
            missing_packages+=("$pkg")
        fi
    done
    
    if [ ${#missing_packages[@]} -eq 0 ]; then
        print_status "All required packages are already installed"
        
        # Double-check with pkg-config
        if check_cairo_with_pkg_config; then
            print_status "Cairo is properly configured for building"
            exit 0
        else
            print_warning "Packages are installed but pkg-config cannot find Cairo"
            print_status "You may need to set PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1 when building"
            exit 0
        fi
    fi
    
    print_warning "Missing packages: ${missing_packages[*]}"
    
    # Ask for confirmation
    echo
    read -p "Do you want to install the missing packages? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_packages "${missing_packages[@]}"
        
        # Verify installation
        echo
        print_status "Verifying installation..."
        if check_cairo_with_pkg_config; then
            print_status "Dependencies installed successfully!"
            print_status "You can now run: npm run tauri:build"
        else
            print_warning "Installation completed, but pkg-config still cannot find Cairo"
            print_status "Try building with: PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1 npm run tauri:build"
        fi
    else
        print_status "Installation cancelled"
        print_status "Please install the missing packages manually:"
        for pkg in "${missing_packages[@]}"; do
            echo "  - $pkg"
        done
    fi
}

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "This script is designed for Linux systems"
    print_status "On macOS, install with: brew install cairo pkg-config"
    print_status "On Windows, use MSYS2 or WSL"
    exit 1
fi

# Run main function
main "$@"