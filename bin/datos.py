"""Los datos de Repasa en disco: formato abierto y documentado (ver README, "Formato de los datos"). Solo biblioteca estándar.

~/Repasa/
  perfiles.json                 [{"id", "nombre", "curso", "avatar"}]   solo el primer nombre o un apodo, nunca más
  temas/<id>/tema.json          lo que hay que estudiar: resumen, conceptos, preguntas y tarjetas (ver temas.py)
  temas/<id>/material/          copias de las fotos o PDF de donde salió el tema (quedan en el computador)
  progreso/<perfil>.json        cómo le va a cada perfil con cada pregunta (cajas de repaso), puntos y racha
  pruebas.json                  [{"id", "perfil", "ramo", "temas": [...], "fecha"}]
  .repasa/config.json           ajustes de la app (IA, idioma), validados con app.json (pieza «nucleo»)
  .repasa/catalogo/             temas descargados del catálogo comunitario
  .repasa/temporal/             fotos o PDF arrastrados a la app de escritorio para un tema que todavía no se guarda

Las reglas de perfiles, pruebas y progreso son las mismas que motor/datos.js (pruebas/casos.json, sección «datos»).

Lo genérico (app.json, config validada, escritura atómica) viene de la pieza «nucleo» (bin/nucleo.py); aquí queda lo propio de
Repasa. app.json dice «"datos": "visible"»: la carpeta interna de nucleo es ~/Repasa/.repasa, la misma de siempre.
"""
import json
import os
import re

import nucleo

BASE = os.environ.get("REPASA_CARPETA") or os.path.join(os.path.expanduser("~"), "Repasa")
INTERNO = os.path.join(BASE, ".repasa")
if os.environ.get("REPASA_CARPETA"):
    # Pruebas: nucleo (config de la app) mira la misma carpeta que el resto. La app de Mac nunca pasa variables REPASA_* de afuera.
    os.environ["REPASA_DATOS"] = INTERNO
TEMAS = os.path.join(BASE, "temas")
PROGRESO = os.path.join(BASE, "progreso")
RECURSOS = nucleo.recursos()  # donde está app.json: el checkout o Contents/Resources/repasa
ID = re.compile(r"[a-z0-9-]{1,80}")
ID_TEMA = re.compile(r"[a-z0-9-]{2,60}")
CURSOS = ("5b", "6b", "7b", "8b", "1m", "2m", "3m", "4m")


def carpeta_privada():
    """~/Repasa solo para la cuenta de la persona (0700): hay nombres de niños y su avance."""
    os.makedirs(BASE, mode=0o700, exist_ok=True)
    try:
        os.chmod(BASE, 0o700)
    except OSError:
        pass


def leer_json(ruta, defecto):
    return nucleo.leer_json(ruta, defecto)


def escribir_json(ruta, valor):
    """Escribe en un temporal y lo renombra (nucleo.escribir_atomico): si algo se corta a la mitad, el archivo anterior queda
    intacto. El archivo queda siempre 0600, aunque antes fuera otra cosa, y ~/Repasa, 0700."""
    if os.path.abspath(ruta).startswith(os.path.abspath(BASE) + os.sep):
        carpeta_privada()
    nucleo.escribir_atomico(ruta, json.dumps(valor, ensure_ascii=False, indent=1) + "\n", nucleo.PRIVADO)


def config():
    """Los ajustes, solo con las claves y valores de app.json (nucleo.config). ~/Repasa queda 0700 antes de que nucleo cree
    ~/Repasa/.repasa (os.makedirs dejaría la carpeta de arriba con los permisos de siempre)."""
    carpeta_privada()
    return {"ia": "claude", "idioma_ui": "", **nucleo.config()}


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


def _largo_js(texto):
    """Largo como lo cuenta JavaScript (unidades UTF-16), para dar lo mismo que motor/datos.js."""
    return len(texto.encode("utf-16-le")) // 2


def perfil_valido(p):
    """Igual que perfilValido en motor/datos.js: solo un nombre o apodo, un curso y un personaje."""
    return (isinstance(p, dict) and isinstance(p.get("id"), str) and bool(ID.fullmatch(p["id"])) and isinstance(p.get("nombre"), str)
            and len(p["nombre"].strip()) > 0 and _largo_js(p["nombre"]) <= 40 and p.get("curso") in CURSOS
            and isinstance(p.get("avatar"), str) and len(p["avatar"]) <= 8)


def prueba_valida(x):
    """Igual que pruebaValida en motor/datos.js."""
    return (isinstance(x, dict) and isinstance(x.get("id"), str) and bool(ID.fullmatch(x["id"])) and isinstance(x.get("perfil"), str)
            and bool(ID.fullmatch(x["perfil"])) and isinstance(x.get("fecha"), str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", x["fecha"]))
            and isinstance(x.get("temas"), list) and all(isinstance(t, str) for t in x["temas"]))


def perfiles():
    p = leer_json(os.path.join(BASE, "perfiles.json"), [])
    return [x for x in p if perfil_valido(x)] if isinstance(p, list) else []


def guardar_perfil(p):
    if not perfil_valido(p):
        raise ValueError("Perfil no válido.")
    limpio = {"id": p["id"], "nombre": p["nombre"].strip()[:20], "curso": p["curso"], "avatar": p["avatar"]}
    escribir_json(os.path.join(BASE, "perfiles.json"), [x for x in perfiles() if x["id"] != p["id"]] + [limpio])


def temas_validos():
    """Los temas guardados que pasan temas.validar (igual que Almacen.temas en motor/datos.js)."""
    import temas as formato
    r = []
    try:
        nombres = sorted(os.listdir(TEMAS))
    except OSError:
        return r
    for n in nombres:
        if not ID_TEMA.fullmatch(n):
            continue
        t = leer_json(os.path.join(TEMAS, n, "tema.json"), None)
        if t and not formato.validar(t):
            r.append(t)
    return r


def progreso():
    r = {}
    try:
        nombres = os.listdir(PROGRESO)
    except OSError:
        return r
    for n in nombres:
        if n.endswith(".json") and ID.fullmatch(n[:-5]):
            p = leer_json(os.path.join(PROGRESO, n), None)
            if isinstance(p, dict):
                r[n[:-5]] = p
    return r


def guardar_progreso(perfil, valor):
    if not (isinstance(perfil, str) and ID.fullmatch(perfil)) or not isinstance(valor, dict):
        raise ValueError("Progreso no válido.")
    escribir_json(os.path.join(PROGRESO, perfil + ".json"), valor)


def pruebas():
    p = leer_json(os.path.join(BASE, "pruebas.json"), [])
    return [x for x in p if prueba_valida(x)] if isinstance(p, list) else []


def guardar_pruebas(lista):
    if not isinstance(lista, list):
        raise ValueError("Pruebas no válidas.")
    escribir_json(os.path.join(BASE, "pruebas.json"), [x for x in lista if prueba_valida(x)])
