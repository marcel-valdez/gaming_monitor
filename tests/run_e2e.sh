#!/usr/bin/env bash

# Exit on any error
set -e

echo "=== Starting End-to-End Test ==="

# 1. Clean up old state
rm -f state.json roblox_connections.log public/data.json integration_state.json integration_roblox.log integration_data.json

# 2. Setup initial mock router output (Step 1: Phone Active, PC Active)
echo "Step 1: Processing Mock Router Output (Both Active)..."
cat << 'EOF' > tests/mock_router_output.txt
WAP>display connection IP 192.168.100.37
udp          [REPLIED]           0                                            4 days, 23:59:00             N/A
    INIT: 192.168.100.37:45994 - 128.116.95.3:443  RESP: 128.116.95.3:443 - 10.76.185.47:45994
Total : 1
WAP>display connection IP 192.168.100.66
tcp          [ASSURED]           TCP_ESTABLISHED                              4 days, 23:56:00             NAPT
    INIT: 192.168.100.66:35798 - 128.116.1.1:53  RESP: 128.116.1.1:53 - 10.76.185.47:35798
Total : 1
WAP>quit
EOF

cat tests/mock_router_output.txt | python3 scripts/process_connections.py --initial > tests/actions.json

# Log actions
if type jq &>/dev/null; then
    while read -r action; do
        TYPE=$(echo "$action" | jq -r '.type')
        if [ "$TYPE" == "LOG" ]; then
            DEVICE=$(echo "$action" | jq -r '.device')
            PROTO=$(echo "$action" | jq -r '.proto')
            STATE=$(echo "$action" | jq -r '.state')
            MSG=$(echo "$action" | jq -r '.msg')
            printf "[%s] | %-15s | %-3s | %-8s | %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$DEVICE" "$PROTO" "$STATE" "$MSG" >> roblox_connections.log
        fi
    done < <(cat tests/actions.json | jq -c '.[]')
fi

# 3. Generate initial dashboard data
echo "Step 2: Generating initial dashboard data.json..."
python3 scripts/generate_data.py

# 4. Simulating session end (Step 3: PC ends)
echo "Step 3: Simulating session end (PC Idle)..."
# Change PC to be idle (expiry < 4 days 23:55:00)
sed -i 's/23:56:00/23:50:00/' tests/mock_router_output.txt
cat tests/mock_router_output.txt | python3 scripts/process_connections.py > tests/actions.json

if type jq &>/dev/null; then
    while read -r action; do
        TYPE=$(echo "$action" | jq -r '.type')
        if [ "$TYPE" == "LOG" ]; then
            DEVICE=$(echo "$action" | jq -r '.device')
            PROTO=$(echo "$action" | jq -r '.proto')
            STATE=$(echo "$action" | jq -r '.state')
            MSG=$(echo "$action" | jq -r '.msg')
            printf "[%s] | %-15s | %-3s | %-8s | %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$DEVICE" "$PROTO" "$STATE" "$MSG" >> roblox_connections.log
        fi
    done < <(cat tests/actions.json | jq -c '.[]')
fi

echo "Step 4: Updating dashboard data.json..."
python3 scripts/generate_data.py

# 5. Run JS Unit Tests
node tests/test_app_units.js

# 6. Run JS/HTML Rendering Test
echo "Step 5: Verifying UI rendering with JSDOM..."
node tests/test_e2e.js

echo "✅ End-to-End Test Passed!"
