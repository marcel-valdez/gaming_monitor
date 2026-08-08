#!/usr/bin/env bash

# Roblox Activity Monitor - Master Supervisor Script
# Manages the monitor, data generator, and web server with exponential backoff.

# Ensure we kill all background processes when the master script exits
trap "kill 0" EXIT

run_supervised() {
    local cmd="$1"
    local label="$2"
    local delay=1
    local max_delay=300

    while true; do
        echo "[$label] [$(date '+%H:%M:%S')] Starting process..."
        
        start_time=$(date +%s)
        
        # Execute the command
        $cmd
        
        exit_code=$?
        end_time=$(date +%s)
        
        # Reset backoff if the process was stable for at least 30 seconds
        if [ $(( end_time - start_time )) -gt 30 ]; then
            delay=1
        fi
        
        echo "[$label] [$(date '+%H:%M:%S')] Process exited (Code: $exit_code). Restarting in ${delay}s..."
        sleep $delay
        
        # Exponential backoff
        delay=$(( delay * 2 ))
        if [ $delay -gt $max_delay ]; then
            delay=$max_delay
        fi
    done
}

echo "=========================================="
echo "   Roblox Monitor System Supervisor       "
echo "=========================================="
echo "Press Ctrl+C to stop all services."
echo ""

# Start all three core components in the background
# We include DATAGEN because it is the bridge between the logs and the UI.
run_supervised "./monitor_roblox_connections.sh" "MONITOR" &
run_supervised "./generate_roblox_data.sh" "DATAGEN" &
run_supervised "./start_server.sh" "WEBSERVER" &

# Wait for all background processes to keep the master script alive
wait
