#!/bin/bash
# Arma dist/Repasa.app (autosuficiente) y dist/Repasa-macOS.zip + .sha256, sin instalar nada. Solo en un Mac.
# Lo usan build.sh (en tu Mac), la actualización de una instalación de desarrollo y, cuando exista, la acción que publica cada versión.
# Dentro van: la app, Python portátil y el código en Contents/Resources/repasa: bin/, temas/ (catálogo incluido) y ui/ con el
# motor JS (ui/motor/) y la copia cifrada de escritorio (ui/escritorio.js, desde app/web/). Los datos de la familia quedan en ~/Repasa.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ/app"
swift build -c release 2>&1 | tee "${REPASA_PROGRESO:-/dev/null}" | tail -20
REL=.build/release

# Python portátil (python-build-standalone, el mismo que Alcancía): se descarga una vez y se verifica su huella. Nadie instala nada.
PY_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.13.16%2B20261003-aarch64-apple-darwin-install_only_stripped.tar.gz"
PY_SHA="9e01f63bbb08576cd9c8bc2d0564d098cb30c8453a0cd4bcf6aef458f6d2a147"
PY_TGZ=.build/python-3.13.16.tar.gz
if [ ! -f "$PY_TGZ" ] || [ "$(shasum -a 256 "$PY_TGZ" | cut -d' ' -f1)" != "$PY_SHA" ]; then
  curl -fsSL --proto '=https' "$PY_URL" -o "$PY_TGZ.tmp"
  [ "$(shasum -a 256 "$PY_TGZ.tmp" | cut -d' ' -f1)" = "$PY_SHA" ] || { rm -f "$PY_TGZ.tmp"; echo "✗ El Python descargado no coincide con su huella" >&2; exit 1; }
  mv "$PY_TGZ.tmp" "$PY_TGZ"
fi

DIST="$RAIZ/dist"; APP="$DIST/Repasa.app"; CODIGO="$APP/Contents/Resources/repasa"
rm -rf "$DIST"; mkdir -p "$APP/Contents/MacOS" "$CODIGO"
cp "$REL/Repasa" "$APP/Contents/MacOS/"
cp Info.plist "$APP/Contents/Info.plist"
[ -f Repasa.icns ] && cp Repasa.icns "$APP/Contents/Resources/Repasa.icns"
tar -xzf "$PY_TGZ" -C "$APP/Contents/Resources"   # → Resources/python/bin/python3
for d in bin ui temas; do ditto "$RAIZ/$d" "$CODIGO/$d"; done
ditto "$RAIZ/motor" "$CODIGO/ui/motor"
cp "$RAIZ/app/web/escritorio.js" "$CODIGO/ui/escritorio.js"
# La app usa los datos de la familia, nunca la demo ni sus imágenes; temas/README.md no hace falta adentro.
rm -rf "$CODIGO/ui/demo.json" "$CODIGO/ui/demo" "$CODIGO/temas/README.md"
find "$CODIGO" -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
chmod +x "$CODIGO/bin/"*.py

# Firma ad hoc, de adentro hacia afuera, con requisito por identificador (macOS reconoce la app entre versiones).
find "$APP/Contents/Resources/python" -type f \( -name "*.so" -o -name "*.dylib" -o -perm -u+x \) -exec codesign --force --sign - {} \; 2>/dev/null || true
codesign --force --sign - --requirements '=designated => identifier "app.repasa.mac"' "$APP"

cd "$DIST"
ditto -c -k --keepParent Repasa.app Repasa-macOS.zip
shasum -a 256 Repasa-macOS.zip > Repasa-macOS.zip.sha256
echo "Listo: $DIST/Repasa-macOS.zip ($(du -h Repasa-macOS.zip | cut -f1))"
