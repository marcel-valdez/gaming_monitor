#!/usr/bin/env bash

LOG_FILE="roblox_connections.log"
DATA_FILE="public/data.json"

if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
fi

mkdir -p public

TMP_CSV="$(mktemp)"
trap 'rm -f "$TMP_CSV" "${TMP_CSV}_sorted"' EXIT

generate_data() {
    # 1. Parsear los registros con AWK
    # Generamos un CSV temporal con los datos crudos procesados
    awk -F '|' '
    function trim(s) {
        sub(/^[ \t]+/, "", s);
        sub(/[ \t]+$/, "", s);
        return s;
    }
    {
        f1 = trim($1); f2 = trim($2); f3 = trim($3); f4 = trim($4); f5 = trim($5)
        
        sub(/^\[/, "", f1); sub(/\]$/, "", f1);
        
        split(f1, dt, " ");
        date_val = dt[1]; time_val = dt[2];
        
        split(f2, dev_parts, " - ");
        device_alias = trim(dev_parts[1]);
        if (device_alias == "") { device_alias = "Desconocido" }
        
        key = f2 "_" f3;
        
        if (f4 == "ACTIVE") {
            start_date[key] = date_val
            start_time[key] = time_val
            device_map[key] = device_alias
        } 
        else if (f4 == "IDLE") {
            if (key in start_date) {
                if (match(f5, /[0-9]+s/)) {
                    dur_str = substr(f5, RSTART, RLENGTH)
                    sub(/s/, "", dur_str)
                    print start_date[key] "|" start_time[key] "|" time_val "|" f3 "|" dur_str "|" device_map[key]
                }
                delete start_date[key]
                delete start_time[key]
                delete device_map[key]
            }
        }
    }
    END {
        for (key in start_date) {
            print start_date[key] "|" start_time[key] "|🟢 Activa|" key "|CALC_DUR|" device_map[key]
        }
    }' "$LOG_FILE" > "$TMP_CSV"

    # 2. Ordenar cronológicamente
    sort -t'|' -k1,1 -k2,2 "$TMP_CSV" > "${TMP_CSV}_sorted"

    # 3. Construir el JSON
    echo "[" > "$DATA_FILE"
    FIRST=1
    CURRENT_EPOCH=$(date +%s)

    while IFS="|" read -r date_val start_t end_t proto_key dur_sec dev_alias; do
        if [ "$FIRST" -eq 0 ]; then
            echo "," >> "$DATA_FILE"
        fi
        FIRST=0

        # Limpiar proto_key (puede venir como Device_Proto o solo Proto)
        proto="${proto_key#*_}"
        
        DISPLAY_DATE=$(LC_TIME="es_ES.UTF-8" date -d "$date_val" "+%d de %B de %Y" 2>/dev/null || echo "$date_val")
        START_TIME_F=$(date -d "$date_val $start_t" "+%I:%M %p" 2>/dev/null || echo "$start_t")
        
        START_EPOCH=$(date -d "$date_val $start_t" +%s)
        
        if [ "$dur_sec" == "CALC_DUR" ]; then
            dur_sec=$(( CURRENT_EPOCH - START_EPOCH ))
            [ $dur_sec -lt 0 ] && dur_sec=0
            END_TIME_F="🟢 Activa"
        else
            END_TIME_F=$(date -d "$date_val $end_t" "+%I:%M %p" 2>/dev/null || echo "$end_t")
        fi

        HRS=$(( dur_sec / 3600 ))
        MINS=$(( (dur_sec % 3600) / 60 ))
        SECS=$(( dur_sec % 60 ))
        DUR_STR=""
        [ $HRS -gt 0 ] && DUR_STR="${HRS}h "
        [ $MINS -gt 0 ] && DUR_STR="${DUR_STR}${MINS}m "
        DUR_STR="${DUR_STR}${SECS}s"

        cat << EOF >> "$DATA_FILE"
  {
    "date": "$DISPLAY_DATE",
    "start_time_fmt": "$START_TIME_F",
    "start_epoch": $START_EPOCH,
    "end": "$end_t",
    "end_time_fmt": "$END_TIME_F",
    "proto": "$proto",
    "device": "$dev_alias",
    "duration_sec": $dur_sec,
    "duration_str": "$DUR_STR"
  }
EOF
    done < "${TMP_CSV}_sorted"
    echo "]" >> "$DATA_FILE"

    echo "[$(date '+%H:%M:%S')] Datos JSON actualizados -> $DATA_FILE"
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
