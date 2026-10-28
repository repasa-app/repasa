"""Guardar lo que cambia la interfaz en el computador: un perfil, el progreso de un perfil o la lista de pruebas. Solo biblioteca
estándar.

  guardar.py perfil   <entrada.json> <salida.json>     entrada: {"perfil": {id, nombre, curso, avatar}}
  guardar.py progreso <entrada.json> <salida.json>     entrada: {"perfil": "<id>", "progreso": {...}}
  guardar.py pruebas  <entrada.json> <salida.json>     entrada: {"pruebas": [...]}

Lo que manda la interfaz llega en un archivo (nunca como argumento) y se valida con las mismas reglas que motor/datos.js.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos  # noqa: E402

MAXIMO = 5 * 1024 * 1024  # un progreso con años de repaso pesa unos cientos de KB; más que esto no es de la interfaz


def guardar(accion, d):
    if not isinstance(d, dict):
        return {"ok": False, "error": "Entrada no válida."}
    if accion == "perfil":
        datos.guardar_perfil(d.get("perfil"))
    elif accion == "progreso":
        datos.guardar_progreso(d.get("perfil"), d.get("progreso"))
    elif accion == "pruebas":
        datos.guardar_pruebas(d.get("pruebas"))
    else:
        return {"ok": False, "error": "Acción desconocida."}
    return {"ok": True}


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) != 3:
        print(__doc__)
        sys.exit(2)
    try:
        if os.path.getsize(a[1]) > MAXIMO:
            raise ValueError("La entrada es demasiado grande.")
        r = guardar(a[0], datos.leer_json(a[1], None))
    except (OSError, ValueError) as e:
        r = {"ok": False, "error": str(e)}
    datos.escribir_json(a[2], r)
    print(json.dumps(r, ensure_ascii=False))
