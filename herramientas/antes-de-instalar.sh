#!/usr/bin/env bash
# build.sh no instala mientras la IA arma un tema: cerrar la app lo cortaría (FORZAR=1 instala igual).
if pgrep -f "bin/crear_tema.py" >/dev/null; then
  echo "✗ Repasa está armando un tema con la IA. Espera a que termine (o usa FORZAR=1)." >&2
  exit 3
fi
