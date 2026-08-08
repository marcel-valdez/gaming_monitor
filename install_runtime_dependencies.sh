#!/usr/bin/env bash

# install_runtime_dependencies.sh - Setup script for Roblox Activity Monitor
# Installs only the dependencies required to RUN the system.

set -e

# --- ARGUMENT PARSING ---

SKIP_CONFIRM=false
for arg in "$@"; do
    if [[ "$arg" == "-y" ]] || [[ "$arg" == "--yes" ]]; then
        SKIP_CONFIRM=true
    fi
done

# --- HELPER FUNCTIONS ---

confirm() {
    if [ "$SKIP_CONFIRM" = true ]; then
        return 0
    fi

    local prompt="$1"
    read -p "$prompt [y/N]: " response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

check_and_install_apt() {
    local binary="$1"
    local package="$2"
    
    if ! type "$binary" &>/dev/null; then
        echo "❌ $binary not found."
        if confirm "Do you want to install the '$package' package via apt?"; then
            sudo apt-get update
            sudo apt-get install -y "$package"
            echo "✅ $package installed successfully."
        else
            echo "⚠️ Skipping $package installation. Some features may not be available."
        fi
    else
        echo "✅ $binary is already installed."
    fi
}

# --- MAIN SETUP ---

echo "=== Roblox Activity Monitor: Runtime Dependencies Installation ==="
echo "This script will install ONLY the dependencies required to run the system."
if [ "$SKIP_CONFIRM" = true ]; then
    echo "ℹ️ Automatic mode enabled (-y). Skipping all confirmations."
fi

# 1. Runtime Packages (APT)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    check_and_install_apt "python3" "python3"
    check_and_install_apt "expect" "expect"
    check_and_install_apt "telnet" "telnet"
    check_and_install_apt "inotifywait" "inotify-tools"
    check_and_install_apt "jq" "jq"
    check_and_install_apt "notify-send" "libnotify-bin"
else
    echo "⚠️ OS not compatible with apt ($OSTYPE). Please install dependencies manually."
fi

# 2. Execution Permissions
echo "=== Configuring execution permissions ==="
chmod +x *.sh
echo "✅ Scripts configured as executable."

# 3. Completion
echo ""
echo "🎉 Runtime dependencies installation complete."
echo "You can start the system with: ./start_all.sh"
