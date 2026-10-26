#!/bin/bash
# Todas las pruebas (las mismas que corre GitHub en cada cambio).
# Uso: bash pruebas/correr.sh   (la interfaz necesita Playwright: PLAYWRIGHT=/ruta/a/playwright si no está en node_modules)
set -e
cd "$(dirname "$0")/.."
echo "Sintaxis"; node --check ui/app.js; python3 -m py_compile bin/*.py pruebas/*.py; for f in herramientas/*.sh pruebas/*.sh; do bash -n "$f"; done
python3 -c "import json, glob; [json.load(open(f, encoding='utf-8')) for f in glob.glob('ui/idiomas/*.json') + glob.glob('temas/*.json') + ['ui/demo.json', 'pruebas/casos.json']]"
echo "Temas"; python3 -c "
import sys, json, glob; sys.path.insert(0, 'bin'); import temas
m = {f: p for f in glob.glob('temas/*.json') if (p := temas.validar(json.load(open(f, encoding='utf-8'))))}
print(m or '✓ Temas válidos'); sys.exit(1 if m else 0)"
echo "Privacidad"; bash herramientas/revisar_privacidad.sh --generico
echo "Python"; python3 pruebas/test_python.py 2>&1 | tail -3
echo "Interfaz"; node pruebas/interfaz.mjs
