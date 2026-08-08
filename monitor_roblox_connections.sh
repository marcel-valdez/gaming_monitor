#!/usr/bin/env bash

if (( BASH_VERSINFO[0] < 4 )); then
  echo "Error: This script requires bash 4.0 or higher."
  exit 1
fi

OUTPUT_FILE="$(mktemp)"
LOG_FILE="roblox_connections.log"

trap 'rm -f "$OUTPUT_FILE"' EXIT

NOTIFY_SEND=echo
if type notify-send &>/dev/null; then
  NOTIFY_SEND=notify-send
fi

TMUX_NOTIFY=echo
if type tmux-notify &>/dev/null; then
  TMUX_NOTIFY=tmux-notify
fi

function notify {
  local TITLE="$1"
  local BODY="$2"
  ${NOTIFY_SEND} -u critical -t 43200000 "${TITLE}" "${BODY}" &
  ${TMUX_NOTIFY} "${TITLE}" "${BODY}" &
}

function log_event {
  local L_APP="$1"
  local L_PROTO="$2"
  local L_STATE="$3"
  local L_MSG="$4"
  printf "[%s] | %-15s | %-3s | %-8s | %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$L_APP" "$L_PROTO" "$L_STATE" "$L_MSG" >> "$LOG_FILE"
}

INITIAL_RUN_FLAG="--initial"

echo "Starting Aggregated Roblox Monitor (PC & Phone). Press [Ctrl+C] to stop."
echo "Logging all state changes to: $(pwd)/$LOG_FILE"
sleep 2

while true; do
  expect << 'EOF' > "$OUTPUT_FILE"
    match_max 1000000
    set timeout 30
    spawn telnet 192.168.100.1
    expect "Login:" { send "root\r" }
    expect "Password:" { send "adminHW\r" }
    expect "WAP>" { send "display connection IP 192.168.100.37\r" }
    expect "Total :" { send "\r" }
    expect "WAP>" { send "display connection IP 192.168.100.66\r" }
    expect "Total :" { send "\r" }
    expect "WAP>" { send "quit\r" }
    expect eof
EOF

  clear
  echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Roblox Monitor ==="

  # Pipe router output to Python logic
  ACTIONS_JSON=$(cat "$OUTPUT_FILE" | python3 scripts/process_connections.py "$INITIAL_RUN_FLAG")
  
  # Process actions returned by Python
  if type jq &>/dev/null; then
    while read -r action; do
      TYPE=$(echo "$action" | jq -r '.type')
      if [ "$TYPE" == "LOG" ]; then
        DEVICE=$(echo "$action" | jq -r '.device')
        PROTO=$(echo "$action" | jq -r '.proto')
        STATE=$(echo "$action" | jq -r '.state')
        MSG=$(echo "$action" | jq -r '.msg')
        log_event "$DEVICE" "$PROTO" "$STATE" "$MSG"
        echo "   [LOG] $DEVICE ($PROTO) -> $STATE: $MSG"
      elif [ "$TYPE" == "NOTIFY" ]; then
        TITLE=$(echo "$action" | jq -r '.title')
        BODY=$(echo "$action" | jq -r '.body')
        notify "$TITLE" "$BODY"
        echo "   🚨 [NOTIFICATION SENT] $BODY"
      fi
    done < <(echo "$ACTIONS_JSON" | jq -c '.[]')
  else
    echo "ERROR: jq is not installed. Cannot process Python actions." >&2
  fi

  INITIAL_RUN_FLAG=""
  
  echo "------------------------------------------------------"
  echo "Monitoring active. Waiting 60 seconds..."
  sleep 60
done
