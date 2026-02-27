#!/bin/bash

# Lirah Multi-Instance Dev Launcher
# Usage: ./scripts/dev.sh [instance-number]
# Example: 
#   Terminal 1: ./scripts/dev.sh 1
#   Terminal 2: ./scripts/dev.sh 2

set -e

INSTANCE_NUM=${1:-1}
BASE_PORT=1420
PORT=$((BASE_PORT + (INSTANCE_NUM - 1) * 10))

# Check if the port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port $PORT is already in use. Finding next available port..."
    # Try to find an available port
    for i in $(seq $((PORT + 1)) 65535); do
        if ! lsof -Pi :$i -sTCP:LISTEN -t >/dev/null 2>&1; then
            PORT=$i
            echo "✓ Found available port: $PORT"
            break
        fi
    done
fi

echo "🚀 Starting Lirah instance $INSTANCE_NUM on port $PORT"

# Export the port for vite.config.js
export LIRAH_DEV_PORT=$PORT

# Run tauri dev with the specified port
cd "$(dirname "$0")/.."
npm run dev
