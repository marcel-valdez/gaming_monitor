#!/usr/bin/env bash

PORT=${1:-8080}
DIRECTORY="public"

echo "Iniciando servidor web en http://localhost:$PORT..."
echo "Sirviendo archivos desde el directorio: $DIRECTORY"

# Intentar usar Python 3 (método más común)
if type python3 &>/dev/null; then
    python3 -m http.server $PORT --directory "$DIRECTORY"
# Fallback a Python 2
elif type python &>/dev/null; then
    echo "Python 3 no encontrado. Usando Python 2 (Nota: la opción --directory no es compatible en versiones antiguas)."
    cd "$DIRECTORY" && python -m SimpleHTTPServer $PORT
# Fallback a PHP
elif type php &>/dev/null; then
    echo "Python no encontrado. Usando servidor integrado de PHP..."
    php -S localhost:$PORT -t "$DIRECTORY"
else
    echo "ERROR: No se encontró ningún servidor HTTP compatible (Python o PHP)."
    exit 1
fi
