"""Todo lo que pinta la interfaz en el computador. Solo biblioteca estándar.

  estado.py <salida.json>

Perfiles, temas, progreso, pruebas y ajustes (lo mismo que Almacen.estado() en motor/datos.js) más el catálogo incluido en la app
(temas/*.json validados, sin los que ya se agregaron), igual que el anfitrión del celular. La app de escritorio le suma lo suyo
(las IA instaladas, versión, carpeta, actualizaciones y capacidades).
"""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos  # noqa: E402
import temas  # noqa: E402


def catalogo(tengo):
    r = []
    for f in sorted(glob.glob(os.path.join(datos.RECURSOS, "temas", "*.json"))):
        t = datos.leer_json(f, None)
        if isinstance(t, dict) and not temas.validar(t) and t["id"] not in tengo and os.path.basename(f) == t["id"] + ".json":
            r.append({k: t[k] for k in ("id", "titulo", "ramo", "curso")})
    return r


def estado():
    datos.carpeta_privada()
    ts = datos.temas_validos()
    return {"ok": True, "perfiles": datos.perfiles(), "temas": ts, "progreso": datos.progreso(), "pruebas": datos.pruebas(),
            "config": datos.config(), "catalogo": catalogo({t["id"] for t in ts})}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    try:
        r = estado()
    except (OSError, ValueError) as e:
        r = {"ok": False, "error": str(e)}
    datos.escribir_json(sys.argv[1], r)
    print(json.dumps({"ok": r["ok"], "temas": len(r.get("temas", []))}, ensure_ascii=False))
