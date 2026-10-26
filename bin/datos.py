"""Los datos de Repasa en disco: formato abierto y documentado (ver README, "Formato de los datos"). Solo biblioteca estándar.

~/Repasa/
  perfiles.json                 [{"id", "nombre", "curso", "avatar"}]   solo el primer nombre o un apodo, nunca más
  temas/<id>/tema.json          lo que hay que estudiar: resumen, conceptos, preguntas y tarjetas (ver temas.py)
  temas/<id>/material/          copias de las fotos o PDF de donde salió el tema (quedan en el computador)
  progreso/<perfil>.json        cómo le va a cada perfil con cada pregunta (cajas de repaso), puntos y racha
  pruebas.json                  [{"id", "perfil", "ramo", "temas": [...], "fecha"}]
  .repasa/config.json           ajustes de la app (IA, idioma)
  .repasa/catalogo/             temas descargados del catálogo comunitario
"""
import json
import os
import re
import tempfile

BASE = os.environ.get("REPASA_CARPETA") or os.path.join(os.path.expanduser("~"), "Repasa")
INTERNO = os.path.join(BASE, ".repasa")
TEMAS = os.path.join(BASE, "temas")
PROGRESO = os.path.join(BASE, "progreso")
RECURSOS = os.environ.get("REPASA_RECURSOS") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer_json(ruta, defecto):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def escribir_json(ruta, valor):
    """Escribe en un temporal y lo renombra: si algo se corta a la mitad, el archivo anterior queda intacto."""
    os.makedirs(os.path.dirname(ruta) or ".", exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(ruta) or ".", prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(valor, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ruta)


def config():
    return {"ia": "claude", "idioma_ui": "", **leer_json(os.path.join(INTERNO, "config.json"), {})}


def id_de(texto):
    """«Independencia de Chile» → «independencia-de-chile» (sin tildes, para nombres de carpeta)."""
    import unicodedata
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:50] or "tema"


def temas():
    r = []
    try:
        nombres = sorted(os.listdir(TEMAS))
    except OSError:
        return r
    for n in nombres:
        t = leer_json(os.path.join(TEMAS, n, "tema.json"), None)
        if t:
            r.append(t)
    return r
