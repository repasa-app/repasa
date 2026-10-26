"""Preguntas, conceptos y tarjetas escritos como texto simple (lo que escribe un adulto «a mano» y lo que responde una IA chica).
Solo biblioteca estándar. Es la misma lógica que motor/lineas.js, probada con pruebas/casos.json (sección «lineas»).

    ¿Qué se formó el 18 de septiembre de 1810?     ← enunciado (la primera línea del bloque)
    * La Primera Junta Nacional de Gobierno         ← * la correcta
    - El Congreso Nacional                          ← - una incorrecta (con incorrectas: alternativas, de 3 a 5 opciones)
    - El Ejército de los Andes
    > Ese día se formó la Primera Junta.             ← > la explicación (opcional)
                                                    ← una línea en blanco separa las preguntas
    La Primera Junta gobernaba en nombre del rey.   ← sin «-»: verdadero o falso…
    * Verdadero

    En 1814 se perdió la batalla de ___.            ← …o completar, si el enunciado lleva ___ (1 a 4 respuestas con *)
    * Rancagua

Conceptos: una línea por término, «Término: definición».
"""
import re
import unicodedata

CORRECTA = re.compile(r"^[*✓✔]\s*")
INCORRECTA = re.compile(r"^[-–—]\s*")
EXPLICACION = re.compile(r"^>\s*")
NUMERO = re.compile(r"^(?:[0-9]{1,3}\s*[.)-]|pregunta\s*[0-9]{1,3}\s*[:.)-]?)\s*", re.I)
VINETA = re.compile(r"^(?:[-*•–—]|[0-9]{1,3}\s*[.)])\s*")
VERDADERO = {"verdadero", "v", "true", "t", "si", "cierto", "correcto"}
FALSO = {"falso", "f", "false", "no", "incorrecto"}
TEXTOS = {
    "es": {"respuesta": "La respuesta correcta es: {r}.", "verdadero": "Verdadero", "falso": "Falso", "que_es": "¿Qué es «{t}»?"},
    "en": {"respuesta": "The correct answer is: {r}.", "verdadero": "True", "falso": "False", "que_es": "What is “{t}”?"},
}


def _textos(idioma):
    return TEXTOS.get(idioma, TEXTOS["es"])


def _limpiar(linea):
    return linea.replace("**", "").strip()


def _sin_tildes(t):
    t = "".join(c for c in unicodedata.normalize("NFKD", t) if not "̀" <= c <= "ͯ").lower()
    return re.sub(r"[.!¡*]", "", t).strip()


def _lineas(texto):
    return str(texto or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")


def _bloques(texto):
    r, actual = [], []
    for cruda in _lineas(texto):
        linea = _limpiar(cruda)
        if not linea:
            if actual:
                r.append(actual)
            actual = []
        else:
            actual.append(linea)
    if actual:
        r.append(actual)
    return r


def leer_preguntas(texto, idioma="es"):
    """Devuelve {"preguntas", "problemas"}: lo que no se entiende no se usa y se dice por qué."""
    t_ = _textos(idioma)
    preguntas, problemas = [], []
    for k, lineas in enumerate(_bloques(texto)):
        donde = f"Bloque {k + 1}"
        enunciado, opciones, correctas, explicacion = [], [], [], []
        marcado = False
        for linea in lineas:
            if CORRECTA.match(linea):
                marcado = True
                o = CORRECTA.sub("", linea, count=1).strip()
                if o:
                    correctas.append(o)
                    opciones.append((o, True))
            elif INCORRECTA.match(linea):
                marcado = True
                o = INCORRECTA.sub("", linea, count=1).strip()
                if o:
                    opciones.append((o, False))
            elif EXPLICACION.match(linea):
                marcado = True
                x = EXPLICACION.sub("", linea, count=1).strip()
                if x:
                    explicacion.append(x)
            elif marcado:
                explicacion.append(linea)
            else:
                enunciado.append(linea)
        e = NUMERO.sub("", " ".join(enunciado), count=1).strip()
        if not e:
            problemas.append(f"{donde}: falta la pregunta.")
            continue
        if not correctas:
            problemas.append(f"{donde}: marca la respuesta correcta con *.")
            continue
        p = {"id": "", "tipo": "", "enunciado": e, "correcta": None, "explicacion": "", "dificultad": 1}
        if any(not ok for _, ok in opciones):
            if len(correctas) != 1 or not 3 <= len(opciones) <= 5:
                problemas.append(f"{donde}: en alternativas va una sola correcta (*) y en total de 3 a 5 opciones.")
                continue
            p["tipo"], p["opciones"] = "alternativas", [o for o, _ in opciones]
            p["correcta"] = next(i for i, (_, ok) in enumerate(opciones) if ok)
            respuesta = correctas[0]
        elif "___" in e:
            p["tipo"], p["correcta"], respuesta = "completar", correctas[:4], correctas[0]
        elif len(correctas) == 1 and (_sin_tildes(correctas[0]) in VERDADERO or _sin_tildes(correctas[0]) in FALSO):
            p["tipo"], p["correcta"] = "vf", _sin_tildes(correctas[0]) in VERDADERO
            respuesta = t_["verdadero"] if p["correcta"] else t_["falso"]
        else:
            problemas.append(f"{donde}: no sé qué tipo de pregunta es (agrega opciones con -, ___ para completar, o * Verdadero / * Falso).")
            continue
        p["explicacion"] = " ".join(explicacion) or t_["respuesta"].replace("{r}", respuesta)
        p["id"] = f"p{len(preguntas) + 1}"
        preguntas.append(p)
    return {"preguntas": preguntas, "problemas": problemas}


def leer_conceptos(texto):
    """«Término: definición», una por línea (hasta 30). Las líneas sin «:» no se usan."""
    r = []
    for cruda in _lineas(texto):
        linea = VINETA.sub("", _limpiar(cruda), count=1)
        i = linea.find(":")
        if i < 1:
            continue
        termino, definicion = linea[:i].strip(), linea[i + 1:].strip()
        if termino and definicion and len(r) < 30:
            r.append({"termino": termino, "definicion": definicion})
    return r


def tarjetas_de(conceptos, idioma="es"):
    """Tarjetas para memorizar a partir de los conceptos (hasta 40)."""
    t_ = _textos(idioma)
    return [{"frente": t_["que_es"].replace("{t}", c["termino"]), "reverso": c["definicion"]} for c in conceptos[:40]]
