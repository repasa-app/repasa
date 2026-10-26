"""El formato de un tema y su validación. Solo biblioteca estándar.

Un tema es un JSON de **solo datos** (formato completo en temas/README.md). Lo escribe la IA a partir del material, lo puede
escribir a mano un profesor o apoderado, o viene del catálogo comunitario: en todos los casos pasa por `validar` antes de usarse,
y la interfaz escapa todo el texto antes de mostrarlo.
"""
import re

FORMATO = 1
RAMOS = {"lenguaje": "Lenguaje", "matematica": "Matemática", "historia": "Historia", "ciencias": "Ciencias", "ingles": "Inglés",
         "biologia": "Biología", "quimica": "Química", "fisica": "Física", "filosofia": "Filosofía", "artes": "Artes",
         "tecnologia": "Tecnología", "musica": "Música", "otro": "Otro"}
CURSOS = ["5b", "6b", "7b", "8b", "1m", "2m", "3m", "4m"]
NOMBRE_CURSO = {"5b": "5° básico", "6b": "6° básico", "7b": "7° básico", "8b": "8° básico", "1m": "1° medio", "2m": "2° medio",
                "3m": "3° medio", "4m": "4° medio"}
TIPOS = {"alternativas", "vf", "completar"}
CLAVES = {"formato", "id", "titulo", "ramo", "curso", "resumen", "conceptos", "preguntas", "tarjetas", "fuente", "autor", "creado", "notas"}


def _texto(v, maximo):
    return isinstance(v, str) and 0 < len(v.strip()) <= maximo and "<" not in v


def validar(t):
    """Lista de problemas (vacía = tema válido)."""
    if not isinstance(t, dict):
        return ["El tema no es un objeto JSON."]
    e = []
    if t.get("formato") != FORMATO:
        e.append(f"formato debe ser {FORMATO}.")
    if extra := set(t) - CLAVES:
        e.append("Campos desconocidos: " + ", ".join(sorted(extra)) + ".")
    if not re.fullmatch(r"[a-z0-9-]{2,60}", str(t.get("id", ""))):
        e.append("id: minúsculas, números y guiones.")
    if not _texto(t.get("titulo"), 80):
        e.append("titulo: texto de 1 a 80 caracteres, sin HTML.")
    if t.get("ramo") not in RAMOS:
        e.append("ramo debe ser uno de: " + ", ".join(RAMOS) + ".")
    if t.get("curso") not in CURSOS:
        e.append("curso debe ser uno de: " + ", ".join(CURSOS) + ".")
    if not _texto(t.get("resumen"), 3000):
        e.append("resumen: la explicación fácil del tema (hasta 3000 caracteres, sin HTML).")
    conceptos = t.get("conceptos", [])
    if not isinstance(conceptos, list) or len(conceptos) > 30 or not all(
            isinstance(c, dict) and _texto(c.get("termino"), 60) and _texto(c.get("definicion"), 400) and set(c) <= {"termino", "definicion"}
            for c in conceptos):
        e.append("conceptos: lista de {termino, definicion} (máx. 30).")
    preguntas = t.get("preguntas")
    if not isinstance(preguntas, list) or not 3 <= len(preguntas) <= 60:
        e.append("preguntas: entre 3 y 60.")
        preguntas = []
    ids = set()
    for k, p in enumerate(preguntas):
        donde = f"pregunta {k + 1}"
        if not isinstance(p, dict):
            e.append(f"{donde}: no es un objeto.")
            continue
        if set(p) - {"id", "tipo", "enunciado", "opciones", "correcta", "explicacion", "dificultad"}:
            e.append(f"{donde}: campos desconocidos.")
        if not re.fullmatch(r"p[0-9]{1,3}", str(p.get("id", ""))) or p.get("id") in ids:
            e.append(f"{donde}: id como «p1», sin repetir.")
        ids.add(p.get("id"))
        if p.get("tipo") not in TIPOS:
            e.append(f"{donde}: tipo debe ser alternativas, vf o completar.")
        if not _texto(p.get("enunciado"), 300):
            e.append(f"{donde}: enunciado de 1 a 300 caracteres.")
        if not _texto(p.get("explicacion"), 500):
            e.append(f"{donde}: explicación de 1 a 500 caracteres.")
        if p.get("dificultad") not in (1, 2, 3):
            e.append(f"{donde}: dificultad 1, 2 o 3.")
        if p.get("tipo") == "alternativas":
            op = p.get("opciones")
            if not (isinstance(op, list) and 3 <= len(op) <= 5 and all(_texto(o, 120) for o in op) and len(set(op)) == len(op)):
                e.append(f"{donde}: de 3 a 5 opciones distintas.")
            elif not (isinstance(p.get("correcta"), int) and 0 <= p["correcta"] < len(op)):
                e.append(f"{donde}: correcta es el número (desde 0) de la opción correcta.")
        elif p.get("tipo") == "vf":
            if not isinstance(p.get("correcta"), bool) or "opciones" in p:
                e.append(f"{donde}: en verdadero o falso, correcta es true o false y no lleva opciones.")
        elif p.get("tipo") == "completar":
            c = p.get("correcta")
            if not (isinstance(c, list) and 1 <= len(c) <= 4 and all(_texto(x, 40) for x in c)) or "opciones" in p:
                e.append(f"{donde}: en completar, correcta es la lista de respuestas aceptadas (1 a 4 palabras cortas).")
            elif "___" not in p.get("enunciado", ""):
                e.append(f"{donde}: el enunciado de completar lleva ___ donde va la respuesta.")
    tarjetas = t.get("tarjetas", [])
    if not isinstance(tarjetas, list) or len(tarjetas) > 40 or not all(
            isinstance(c, dict) and _texto(c.get("frente"), 150) and _texto(c.get("reverso"), 300) and set(c) <= {"frente", "reverso"}
            for c in tarjetas):
        e.append("tarjetas: lista de {frente, reverso} (máx. 40).")
    return e


def nombre_curso(c):
    return NOMBRE_CURSO.get(c, c)
