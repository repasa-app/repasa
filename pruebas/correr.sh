#!/bin/bash
# Todas las pruebas (las mismas que corre GitHub en cada cambio).
# Uso: bash pruebas/correr.sh   (la interfaz necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
#      La app de escritorio (Rust, pieza «host-tauri») se compila y prueba si hay cargo (SIN_RUST=1 la salta), y se abre si hay Xvfb.
set -eo pipefail
cd "$(dirname "$0")/.."
echo "Sintaxis"; for f in ui/*.js motor/*.js movil/host/*.js movil/*.mjs herramientas/*.mjs pruebas/*.mjs pruebas/capacitor_falso.js; do node --check "$f"; done; python3 -m py_compile bin/*.py pruebas/*.py; for f in herramientas/*.sh pruebas/*.sh build.sh; do bash -n "$f"; done
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('ui/idiomas/*.json') + glob.glob('temas/*.json') + ['ui/demo.json', 'pruebas/casos.json']]"
echo "Temas"; python3 -c "
import sys, json, glob; sys.path.insert(0, 'bin'); import temas
m = {f: p for f in glob.glob('temas/*.json') if (p := temas.validar(json.load(open(f, encoding='utf-8'))))}
print(m or '✓ Temas válidos'); sys.exit(1 if m else 0)"
echo "Privacidad"; bash herramientas/revisar_privacidad.sh --generico
echo "Python"; python3 pruebas/test_python.py 2>&1 | tail -3
echo "Motor JS (igual que Python)"; node pruebas/motor.mjs
echo "Copia cifrada en el escritorio (ui/escritorio.js)"; node pruebas/escritorio.mjs
echo "Contrato (interfaz ↔ celular ↔ escritorio ↔ plugins nativos)"; python3 pruebas/contrato.py
echo "Interfaz"; node pruebas/interfaz.mjs
echo "Interfaz en el celular (anfitrión del teléfono y Capacitor falso)"; MOVIL=1 node pruebas/interfaz.mjs
echo "App del celular de punta a punta"; node pruebas/movil.mjs
if command -v cargo >/dev/null && [ "${SIN_RUST:-0}" != "1" ]; then
  echo "App de escritorio (Rust, pieza «host-tauri»)"; (cd escritorio && cargo test --quiet 2>&1 | grep -E "test result|error" | tail -3)
  if command -v xvfb-run >/dev/null && command -v dbus-run-session >/dev/null; then bash escritorio/pruebas/arranque.sh; fi
else
  echo "App de escritorio: sin cargo (o SIN_RUST=1), se prueba en GitHub (job «app»)"
fi
