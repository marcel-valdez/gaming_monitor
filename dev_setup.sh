#!/usr/bin/env bash

# dev_setup.sh - Setup script for Roblox Activity Monitor
# Installs all system dependencies and development tools by building on top of runtime deps.

set -e

# --- ARGUMENT PARSING ---

SKIP_CONFIRM=false
PASSTHROUGH_ARGS=""
for arg in "$@"; do
    if [[ "$arg" == "-y" ]] || [[ "$arg" == "--yes" ]]; then
        SKIP_CONFIRM=true
        PASSTHROUGH_ARGS="-y"
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

echo "=== Roblox Activity Monitor: Full Development Setup ==="

# 1. Install Runtime Dependencies first
if [ -f "./install_runtime_dependencies.sh" ]; then
    echo "--- Installing runtime dependencies ---"
    ./install_runtime_dependencies.sh $PASSTHROUGH_ARGS
else
    echo "❌ Error: ./install_runtime_dependencies.sh not found."
    exit 1
fi

echo "--- Installing additional development dependencies ---"

# 2. System Packages for Testing (Node.js/npm)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    check_and_install_apt "node" "nodejs"
    check_and_install_apt "npm" "npm"
fi

# 3. Node.js Packages (jsdom)
if type npm &>/dev/null; then
    if ! node -e "require('jsdom')" &>/dev/null; then
        echo "❌ npm package 'jsdom' (required for E2E tests) not found."
        if confirm "Do you want to install 'jsdom' locally via npm?"; then
            npm install jsdom --no-save
            echo "✅ jsdom installed successfully."
        else
            echo "⚠️ Skipping jsdom. E2E tests will fail."
        fi
    else
        echo "✅ npm package 'jsdom' is already available."
    fi
fi

# 4. Completion
echo ""
echo "🎉 Full development setup complete."
echo "You can now run all tests with: ./run_tests.sh"
