#!/usr/bin/env bash

LOG_FILE="roblox_connections.log"
REPORT_FILE="reporte_roblox.html"

if [ ! -f "$LOG_FILE" ]; then
  touch "$LOG_FILE"
fi

TMP_CSV="$(mktemp)"
trap 'rm -f "$TMP_CSV" "${TMP_CSV}_sorted"' EXIT

generate_report() {
    # 1. Parsear los registros con AWK
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
            split(key, k_arr, "_")
            proto = k_arr[2]
            print start_date[key] "|" start_time[key] "|🟢 Activa|" proto "|CALC_DUR|" device_map[key]
        }
    }' "$LOG_FILE" > "$TMP_CSV"

    # 2. Ordenar cronológicamente
    sort -t'|' -k1,1 -k2,2 "$TMP_CSV" > "${TMP_CSV}_sorted"

    # 3. Construir el HTML (Cabecera con auto-recarga cada 10 segundos)
    cat << 'EOF' > "$REPORT_FILE"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="10">
    <title>Reporte de Actividad de Roblox</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f6; color: #333; margin: 0; padding: 40px 20px; }
        .container { max-width: 850px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 40px; }
        .header h1 { color: #2c3e50; margin-bottom: 5px; }
        .header p { color: #7f8c8d; font-size: 1.1em; margin-top: 0; }
        .day-card { background: #fff; border-radius: 10px; padding: 25px; margin-bottom: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .day-title { font-size: 1.4em; font-weight: bold; color: #2980b9; border-bottom: 2px solid #ecf0f1; padding-bottom: 10px; margin-bottom: 15px; margin-top: 0; text-transform: capitalize; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 10px; text-align: left; border-bottom: 1px solid #f1f2f6; }
        th { background-color: #f9fbfb; color: #95a5a6; font-size: 0.85em; text-transform: uppercase; letter-spacing: 1px; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background-color: #fcfcfc; }
        .type-gameplay { color: #27ae60; font-weight: bold; }
        .type-menu { color: #f39c12; font-weight: bold; }
        .device { font-weight: bold; color: #34495e; }
        .duration { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 1.05em; color: #34495e; font-weight: 600;}
        .active-duration { color: #e74c3c; }
        .note { text-align: center; color: #95a5a6; font-size: 0.9em; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Reporte de Actividad de Roblox</h1>
            <p>Un resumen consolidado por dispositivo del tiempo de juego y menús. (Actualización automática cada 10s)</p>
        </div>
EOF

    CURRENT_DAY=""
    SESSIONS_FOUND=0
    CURRENT_EPOCH=$(date +%s)

    while IFS="|" read -r date_val start_t end_t proto dur_sec dev_alias; do
        SESSIONS_FOUND=1
        
        if [ "$date_val" != "$CURRENT_DAY" ]; then
            if [ -n "$CURRENT_DAY" ]; then
                echo "            </table>" >> "$REPORT_FILE"
                echo "        </div>" >> "$REPORT_FILE"
            fi
            CURRENT_DAY="$date_val"
            
            DISPLAY_DATE=$(LC_TIME="es_ES.UTF-8" date -d "$date_val" "+%d de %B de %Y" 2>/dev/null || echo "$date_val")
            
            cat << EOF >> "$REPORT_FILE"
        <div class="day-card">
            <h2 class="day-title">$DISPLAY_DATE</h2>
            <table>
                <tr>
                    <th>Dispositivo</th>
                    <th>Tipo de Actividad</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th>Tiempo</th>
                </tr>
EOF
        fi

        if [ "$dev_alias" == "Phone" ]; then
            DISP_HTML="<span class=\"device\">📱 Celular</span>"
        elif [ "$dev_alias" == "PC" ]; then
            DISP_HTML="<span class=\"device\">💻 PC</span>"
        else
            DISP_HTML="<span class=\"device\">❓ $dev_alias</span>"
        fi

        if [ "$proto" == "UDP" ]; then
            FRIENDLY_TYPE="<span class=\"type-gameplay\">🎮 Jugando (Activo)</span>"
        else
            FRIENDLY_TYPE="<span class=\"type-menu\">⚙️ Menús / Chat</span>"
        fi

        IS_ACTIVE=0
        START_EPOCH=0
        if [ "$dur_sec" == "CALC_DUR" ]; then
            START_EPOCH=$(date -d "$date_val $start_t" +%s)
            dur_sec=$(( CURRENT_EPOCH - START_EPOCH ))
            [ $dur_sec -lt 0 ] && dur_sec=0
            IS_ACTIVE=1
        fi

        HRS=$(( dur_sec / 3600 ))
        MINS=$(( (dur_sec % 3600) / 60 ))
        SECS=$(( dur_sec % 60 ))
        
        DUR_STR=""
        [ $HRS -gt 0 ] && DUR_STR="${HRS}h "
        [ $MINS -gt 0 ] && DUR_STR="${DUR_STR}${MINS}m "
        DUR_STR="${DUR_STR}${SECS}s"

        S_TIME_F=$(date -d "$date_val $start_t" "+%I:%M %p" 2>/dev/null || echo "$start_t")
        
        if [ $IS_ACTIVE -eq 1 ]; then
            E_TIME_F="🟢 Activa"
            TD_DUR="<td class=\"duration active-duration\" data-start=\"$START_EPOCH\">$DUR_STR</td>"
        else
            E_TIME_F=$(date -d "$date_val $end_t" "+%I:%M %p" 2>/dev/null || echo "$end_t")
            TD_DUR="<td class=\"duration\">$DUR_STR</td>"
        fi

        echo "                <tr>" >> "$REPORT_FILE"
        echo "                    <td>$DISP_HTML</td>" >> "$REPORT_FILE"
        echo "                    <td>$FRIENDLY_TYPE</td>" >> "$REPORT_FILE"
        echo "                    <td>$S_TIME_F</td>" >> "$REPORT_FILE"
        echo "                    <td>$E_TIME_F</td>" >> "$REPORT_FILE"
        echo "                    $TD_DUR" >> "$REPORT_FILE"
        echo "                </tr>" >> "$REPORT_FILE"

    done < "${TMP_CSV}_sorted"

    if [ $SESSIONS_FOUND -eq 1 ]; then
        echo "            </table>" >> "$REPORT_FILE"
        echo "        </div>" >> "$REPORT_FILE"
    else
        echo "        <div class=\"day-card\"><p style='text-align:center;'>No hay sesiones registradas aún.</p></div>" >> "$REPORT_FILE"
    fi

    # 4. Cerrar HTML e inyectar JavaScript para el reloj fluido
    cat << 'EOF' >> "$REPORT_FILE"
    </div>

    <script>
        function actualizarTiemposActivos() {
            const celdasActivas = document.querySelectorAll('.active-duration');
            const ahora = Math.floor(Date.now() / 1000);
            
            celdasActivas.forEach(celda => {
                const inicioStr = celda.getAttribute('data-start');
                if (!inicioStr) return;
                
                const inicioEpoch = parseInt(inicioStr, 10);
                let duracion = ahora - inicioEpoch;
                if (duracion < 0) duracion = 0;
                
                const horas = Math.floor(duracion / 3600);
                const minutos = Math.floor((duracion % 3600) / 60);
                const segundos = duracion % 60;
                
                let texto = "";
                if (horas > 0) texto += horas + "h ";
                if (minutos > 0 || horas > 0) texto += minutos + "m ";
                texto += segundos + "s";
                
                celda.innerText = texto;
            });
        }

        actualizarTiemposActivos();
        setInterval(actualizarTiemposActivos, 1000);
    </script>
</body>
</html>
EOF
    echo "[$(date '+%H:%M:%S')] Reporte regenerado -> $REPORT_FILE"
}

# --- BUCLE DEL DAEMON ---

echo "Iniciando generador de reportes HTML..."
generate_report

if type inotifywait &>/dev/null; then
    echo "Escuchando eventos de archivo mediante inotifywait..."
    while inotifywait -q -e modify "$LOG_FILE" >/dev/null 2>&1; do
        sleep 1
        generate_report
    done
else
    echo "inotifywait no encontrado. Respaldando en bucle de 5 segundos..."
    LAST_MOD=0
    while true; do
        CURRENT_MOD=$(stat -c %Y "$LOG_FILE" 2>/dev/null || echo 0)
        if [ "$CURRENT_MOD" != "$LAST_MOD" ] && [ "$CURRENT_MOD" != "0" ]; then
            generate_report
            LAST_MOD=$CURRENT_MOD
        fi
        sleep 5
    done
fi
