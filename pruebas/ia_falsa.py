#!/usr/bin/env python3
"""IA falsa para las pruebas: se instala como «claude» en un PATH temporal. Nunca sale a internet."""
import json
import os
import sys

if "--help" in sys.argv:
    # Como un Claude Code al día: la pieza «ia» nunca corre un CLI que no conoce sus protecciones.
    print("-p --print --strict-mcp-config --allowedTools --disallowedTools --tools --safe-mode --setting-sources")
    sys.exit(0)
pedido = sys.stdin.read()
if "arma un tema de repaso" in pedido:
    hay_material = any(n.startswith("material-") for n in os.listdir("."))
    with open(os.environ["PRUEBA_TEMA_FALSO"], encoding="utf-8") as f:
        tema = json.load(f)
    if not hay_material:
        tema["titulo"] = "Sin material"
    if os.environ.get("PRUEBA_IA_MALA"):
        tema["preguntas"] = tema["preguntas"][:1]
    print("Aquí está:\n```json\n" + json.dumps(tema, ensure_ascii=False) + "\n```")
elif "no entendió esta pregunta" in pedido:
    print("## Imagínate una **carrera**\nPiensa en una carrera de postas <b>y</b> listo.")
else:
    print("listo")
