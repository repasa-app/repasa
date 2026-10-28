#!/bin/bash
# Compila Repasa y la instala en ~/Applications/Repasa.app (para desarrollo en este Mac).
# El checkout va en ~/Developer/repasa: macOS no distingue mayúsculas y ~/repasa chocaría con la carpeta de datos ~/Repasa.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH
RAIZ="$(cd "$(dirname "$0")" && pwd)"
# Cerrar la app mientras la IA arma un tema lo cortaría.
if pgrep -f "bin/crear_tema.py" >/dev/null && [ "${FORZAR:-0}" != "1" ]; then
  echo "✗ Repasa está armando un tema con la IA. Espera a que termine (o usa FORZAR=1)." >&2; exit 3
fi
bash "$RAIZ/herramientas/empaquetar.sh"
APP="$HOME/Applications/Repasa.app"
mkdir -p "$HOME/Applications"
osascript -e 'tell application id "app.repasa.mac" to quit' 2>/dev/null || true
sleep 1
rm -rf "$APP"
ditto "$RAIZ/dist/Repasa.app" "$APP"
# La app sabe que viene de este checkout: se actualiza con git pull (Para adultos → Buscar actualizaciones).
mkdir -p "$HOME/Repasa/.repasa" && chmod 700 "$HOME/Repasa" && echo "$RAIZ" > "$HOME/Repasa/.repasa/desarrollo"
echo "Instalada en $APP ($(du -sh "$APP" | cut -f1))"
