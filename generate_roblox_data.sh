#!/usr/bin/env bash

LOG_FILE="roblox_connections.log"
DATA_FILE="public/data.json"

if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
fi

mkdir -p public

generate_data() {
    python3 scripts/generate_data.py
}

# --- BUCLE DEL DAEMON ---

echo "Iniciando generador de datos JSON..."
generate_data

if type inotifywait &>/dev/null; then
    echo "Escuchando eventos de archivo mediante inotifywait..."
    while inotifywait -q -e modify "$LOG_FILE" >/dev/null 2>&1; do
        sleep 1
        generate_data
    done
else
    echo "inotifywait no encontrado. Respaldando en bucle de 5 segundos..."
    LAST_MOD=0
    while true; do
        CURRENT_MOD=$(stat -c %Y "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$CURRENT_MOD" != "$LAST_MOD" ] && [ "$CURRENT_MOD" != "0" ]; then
            generate_data
            LAST_MOD=$CURRENT_MOD
        fi
        sleep 5
    done
fi
