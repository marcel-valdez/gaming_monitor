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
else
  echo "WARNING: No notify-send found, using echo." >&2
fi

TMUX_NOTIFY=echo
if type tmux-notify &>/dev/null; then
  TMUX_NOTIFY=tmux-notify
else
  echo "WARNING: No tmux-notify found, using echo." >&2
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
  # Clean log without specific IP addresses
  printf "[%s] | %-15s | %-3s | %-8s | %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$L_APP" "$L_PROTO" "$L_STATE" "$L_MSG" >> "$LOG_FILE"
}

declare -A PREV_INACTIVE
declare -A SESSION_START
declare -A CONNECTION_STATE

INITIAL_RUN=true
SIGNIFICANT_INACTIVE_SECS=1800 # 30 mins
ACTIVE_THRESHOLD_SECS=300      # 5 mins

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

  GREP_OUT=$(grep -B 1 "128\.116\." "$OUTPUT_FILE")
  
  # Temporary array to hold the minimum inactive time for this specific loop iteration
  declare -A CURRENT_MIN_INACTIVE

  if [ -n "$GREP_OUT" ]; then
    PREV_LINE=""
    while IFS= read -r line; do
      if [[ "$line" == *"128.116."* ]]; then
        if [[ "$line" == *"192.168.100.37"* ]]; then DEVICE="Phone"
        elif [[ "$line" == *"192.168.100.66"* ]]; then DEVICE="PC"
        else DEVICE="Unknown"; fi

        if [[ "$PREV_LINE" =~ (tcp|udp|TCP|UDP).+([0-9]+)\ days,\ ([0-9]{2}):([0-9]{2}):([0-9]{2}) ]]; then
          PROTOCOL=$(echo "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')
          
          # We no longer track the IP! The key is just the Device + Protocol.
          TRACK_KEY="${DEVICE}_${PROTOCOL}"
          
          DAYS=$((10#${BASH_REMATCH[2]}))
          HOURS=$((10#${BASH_REMATCH[3]}))
          MINS=$((10#${BASH_REMATCH[4]}))
          SECS=$((10#${BASH_REMATCH[5]}))

          EXPIRY_SECS=$(( (DAYS * 86400) + (HOURS * 3600) + (MINS * 60) + SECS ))
          FIVE_DAYS_SECS=$(( 5 * 86400 ))
          
          if [ "$EXPIRY_SECS" -le "$FIVE_DAYS_SECS" ]; then
            INACTIVE_SECS=$(( FIVE_DAYS_SECS - EXPIRY_SECS ))
            
            # Aggregate: Only keep the LOWEST inactive time (most recently active)
            if [ -z "${CURRENT_MIN_INACTIVE[$TRACK_KEY]}" ] || [ "$INACTIVE_SECS" -lt "${CURRENT_MIN_INACTIVE[$TRACK_KEY]}" ]; then
              CURRENT_MIN_INACTIVE[$TRACK_KEY]=$INACTIVE_SECS
            fi
            
            # Ensure the connection state tracker knows about this session
            CONNECTION_STATE[$TRACK_KEY]=${CONNECTION_STATE[$TRACK_KEY]:-"DISCOVERED"}
          fi
        fi
      fi
      PREV_LINE="$line"
    done <<< "$GREP_OUT"
  fi

  CURRENT_TIME=$(date +%s)
  
  # If there are no connections at all, notify the user.
  if [ ${#CONNECTION_STATE[@]} -eq 0 ]; then
      echo "No Roblox sessions found."
  fi

  # Now, evaluate the aggregated data
  for TRACK_KEY in "${!CONNECTION_STATE[@]}"; do
    
    # If the device disappeared from the table entirely, default to 5 days inactive (Offline)
    INACTIVE_SECS=${CURRENT_MIN_INACTIVE[$TRACK_KEY]:-432000}
    
    DEVICE="${TRACK_KEY%_*}"
    PROTOCOL="${TRACK_KEY#*_}"
    DISPLAY_NAME="${DEVICE} - Roblox"

    OUT_D=$(( INACTIVE_SECS / 86400 ))
    REM=$(( INACTIVE_SECS % 86400 ))
    OUT_H=$(( REM / 3600 ))
    REM=$(( REM % 3600 ))
    OUT_M=$(( REM / 60 ))
    OUT_S=$(( REM % 60 ))

    # --- LOGGING & DISPLAY LOGIC ---
    if [ "$INACTIVE_SECS" -lt "$ACTIVE_THRESHOLD_SECS" ]; then
      # State is ACTIVE
      if [ "${CONNECTION_STATE[$TRACK_KEY]}" != "ACTIVE" ]; then
        CONNECTION_STATE[$TRACK_KEY]="ACTIVE"
        SESSION_START["$TRACK_KEY"]=$CURRENT_TIME
        log_event "$DISPLAY_NAME" "$PROTOCOL" "ACTIVE" "Session started."
      fi
      
      SESSION_DUR=$(( CURRENT_TIME - SESSION_START["$TRACK_KEY"] ))
      DUR_H=$(( SESSION_DUR / 3600 ))
      REM_DUR=$(( SESSION_DUR % 3600 ))
      DUR_M=$(( REM_DUR / 60 ))
      DUR_S=$(( REM_DUR % 60 ))
      
      START_STR=$(date -d "@${SESSION_START[$TRACK_KEY]}" "+%Y-%m-%d %I:%M:%S %p")
      printf "[%-5s] Roblox [%-3s] -> 🟢 ACTIVE  | Started: %s | Duration: %02d:%02d:%02d\n" "$DEVICE" "$PROTOCOL" "$START_STR" "$DUR_H" "$DUR_M" "$DUR_S"
    else
      # State is IDLE
      if [ "${CONNECTION_STATE[$TRACK_KEY]}" == "ACTIVE" ]; then
        CONNECTION_STATE[$TRACK_KEY]="IDLE"
        ENDED_DUR=$(( CURRENT_TIME - SESSION_START["$TRACK_KEY"] ))
        log_event "$DISPLAY_NAME" "$PROTOCOL" "IDLE" "Session ended. Total Duration: ${ENDED_DUR}s."
        unset SESSION_START["$TRACK_KEY"]
      elif [ "${CONNECTION_STATE[$TRACK_KEY]}" == "DISCOVERED" ]; then
        CONNECTION_STATE[$TRACK_KEY]="IDLE"
      fi
      
      if [ "$INACTIVE_SECS" -ge 432000 ]; then
          printf "[%-5s] Roblox [%-3s] -> 🌑 OFFLINE | Connection closed properly.\n" "$DEVICE" "$PROTOCOL"
      else
          LAST_ACTIVE_EPOCH=$(( CURRENT_TIME - INACTIVE_SECS ))
          LAST_ACTIVE_STR=$(date -d "@$LAST_ACTIVE_EPOCH" "+%Y-%m-%d %I:%M:%S %p")
          printf "[%-5s] Roblox [%-3s] -> ⏱  IDLE    | Last Active: %s | Inactive: %d days, %02d:%02d:%02d\n" "$DEVICE" "$PROTOCOL" "$LAST_ACTIVE_STR" "$OUT_D" "$OUT_H" "$OUT_M" "$OUT_S"
      fi
    fi

    # --- NOTIFICATION LOGIC ---
    if [[ -n "${PREV_INACTIVE[$TRACK_KEY]}" ]]; then
      PREV_VAL="${PREV_INACTIVE[$TRACK_KEY]}"
      if [ "$INACTIVE_SECS" -lt "$PREV_VAL" ]; then
        if [ "$PREV_VAL" -ge "$SIGNIFICANT_INACTIVE_SECS" ]; then
          notify "Roblox Monitor" "[$DEVICE] $PROTOCOL Session Resumed after >30m"
          echo "   🚨 [NOTIFICATION SENT] Reconnected after being inactive for >30m!"
          log_event "$DISPLAY_NAME" "$PROTOCOL" "NOTIFY" "Session resumed after being idle >30m."
        else
          echo "   [Ignored] $PROTOCOL Heartbeat reset detected for $DEVICE."
        fi
      fi
    else
      # Only alert on a new session if it is ACTUALLY active (not a 2-day old ghost connection)
      if [ "$INITIAL_RUN" = false ] && [ "$INACTIVE_SECS" -lt "$ACTIVE_THRESHOLD_SECS" ]; then
        notify "Roblox Monitor" "[$DEVICE] New $PROTOCOL Session Started"
        echo "   🚨 [NOTIFICATION SENT] Brand new $PROTOCOL connection detected on $DEVICE!"
        log_event "$DISPLAY_NAME" "$PROTOCOL" "NOTIFY" "Brand new session detected."
      fi
    fi
    
    PREV_INACTIVE["${TRACK_KEY}"]=$INACTIVE_SECS
  done
  
  INITIAL_RUN=false
  
  echo "------------------------------------------------------"
  echo "Monitoring active. Waiting 60 seconds..."
  sleep 60
done
