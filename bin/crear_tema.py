"""Crear un tema de repaso con la IA, a partir de fotos del cuaderno, un PDF o texto. Solo biblioteca estándar.

  crear_tema.py <curso> <ramo> "<texto o vacío>" <archivo1> [archivo2 …] <salida.json>     no guarda nada: devuelve el tema
  crear_tema.py pedido <entrada.json> <salida.json>                                         lo mismo, con {curso, ramo, texto, archivos}
                                                                                            en un archivo (así lo llaman las apps)
  crear_tema.py amano <entrada.json> <salida.json>                                          tema escrito a mano (ver lineas.py), sin IA
  crear_tema.py guardar <tema.json> [archivo1 …] <salida.json>                              lo guarda en ~/Repasa/temas/<id>/

La IA ve solo copias del material, con la cuenta del adulto. Lo que responde se valida (temas.validar); si no cumple, no se usa.
"""
import json
import os
import re
import shutil
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos  # noqa: E402
import ia  # noqa: E402
import lineas  # noqa: E402
import temas  # noqa: E402

EJEMPLO = {
    "formato": 1, "id": "fracciones-equivalentes", "titulo": "Fracciones equivalentes", "ramo": "matematica", "curso": "5b",
    "resumen": "Dos fracciones son equivalentes cuando representan la misma parte de un entero. Por ejemplo, 1/2 y 2/4: si partes una pizza en 2 y te comes 1, comes lo mismo que si la partes en 4 y te comes 2. Para encontrar una equivalente, multiplica o divide el numerador y el denominador por el mismo número.",
    "conceptos": [{"termino": "Numerador", "definicion": "El número de arriba: cuántas partes tomas."},
                  {"termino": "Denominador", "definicion": "El número de abajo: en cuántas partes iguales se divide el entero."}],
    "preguntas": [
        {"id": "p1", "tipo": "alternativas", "enunciado": "¿Qué fracción es equivalente a 1/2?", "opciones": ["2/3", "3/6", "1/4"], "correcta": 1,
         "explicacion": "3/6 es 1/2 multiplicando arriba y abajo por 3.", "dificultad": 1},
        {"id": "p2", "tipo": "vf", "enunciado": "2/4 y 4/8 son fracciones equivalentes.", "correcta": True,
         "explicacion": "Las dos son iguales a 1/2.", "dificultad": 1},
        {"id": "p3", "tipo": "completar", "enunciado": "El número de abajo de una fracción se llama ___.", "correcta": ["denominador"],
         "explicacion": "El denominador dice en cuántas partes iguales se divide el entero.", "dificultad": 2}],
    "tarjetas": [{"frente": "¿Cómo encuentro una fracción equivalente?", "reverso": "Multiplico o divido arriba y abajo por el mismo número."}],
}


def prompt(curso, ramo, texto, hay_archivos):
    material = ("Lee TODO el material de esta carpeta (archivos material-1, material-2…: fotos del cuaderno, guías o PDF)"
                + (" y también este texto:\n" + texto if texto else ".")) if hay_archivos else "Este es el material:\n" + texto
    return f"""Eres un profesor chileno cercano y muy claro. Un estudiante de {temas.nombre_curso(curso)} necesita repasar
{temas.RAMOS.get(ramo, ramo) if ramo != "auto" else "una materia del colegio"} para una prueba. {material}

Con ese material arma un tema de repaso en JSON, con EXACTAMENTE este formato (ejemplo de otro tema):
{json.dumps(EJEMPLO, ensure_ascii=False, indent=1)}

Reglas:
- Usa SOLO lo que está en el material. No inventes fechas, nombres ni datos; si algo no se lee bien, déjalo fuera.
- Lenguaje para {temas.nombre_curso(curso)}: frases cortas, ejemplos de la vida diaria, sin tecnicismos innecesarios.
- resumen: «explicado fácil», de 3 a 8 frases. conceptos: los términos clave (hasta 12).
- preguntas: entre 10 y 20, variadas (alternativas, vf y completar), de dificultad 1 a 3, como las de una prueba. En alternativas,
  las opciones incorrectas son creíbles pero claramente incorrectas. En completar, «correcta» lista las formas aceptadas de la
  respuesta (1 palabra o 2) y el enunciado lleva ___. La explicación dice por qué, en una o dos frases.
- tarjetas: entre 5 y 12, para memorizar.
- ramo: {"elige el que corresponda entre " + ", ".join(temas.RAMOS) if ramo == "auto" else ramo}. curso: {curso}. id: el título en minúsculas con guiones.
- Contenido apropiado para su edad. Nada de datos personales aunque aparezcan en el material (nombres de compañeros, del colegio).

Responde SOLO con el JSON, sin explicaciones."""


def leer_json_ia(texto):
    m = re.search(r"\{.*\}", texto or "", re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


def completar(t, curso, ramo, hoy):
    """Lo que no se le deja a la IA: formato, curso, ramo pedido, id desde el título, autor y fecha. Igual que motor/crear_tema.js."""
    t.setdefault("formato", 1)
    t["curso"] = curso
    if ramo != "auto":
        t["ramo"] = ramo
    t["id"] = datos.id_de(str(t.get("titulo") or t.get("id") or "tema"))
    t["autor"] = "ia"
    t["creado"] = hoy
    return t


def a_mano(d, hoy):
    """Un tema escrito por un adulto, sin IA: título, ramo, curso, resumen (opcional), conceptos y preguntas en texto simple.
    Igual que temaAMano en motor/crear_tema.js."""
    d = d if isinstance(d, dict) else {}
    idioma = d.get("idioma") if d.get("idioma") in lineas.TEXTOS else "es"
    titulo = str(d.get("titulo") or "").strip()
    if not titulo:
        return {"ok": False, "error": "Escribe un título.", "problemas": []}
    conceptos = lineas.leer_conceptos(d.get("conceptos"))
    leidas = lineas.leer_preguntas(d.get("preguntas"), idioma)
    resumen = str(d.get("resumen") or "").strip() or " ".join(f"{c['termino']}: {c['definicion']}" for c in conceptos)[:3000].strip() or titulo
    t = {"formato": 1, "id": datos.id_de(titulo), "titulo": titulo, "ramo": d.get("ramo"), "curso": d.get("curso"), "resumen": resumen,
         "conceptos": conceptos, "preguntas": leidas["preguntas"], "tarjetas": lineas.tarjetas_de(conceptos, idioma), "creado": hoy}
    problemas = leidas["problemas"] + temas.validar(t)
    if problemas:
        return {"ok": False, "error": problemas[0], "problemas": problemas}
    return {"ok": True, "tema": t}


def crear(curso, ramo, texto, archivos):
    if curso not in temas.CURSOS:
        return {"ok": False, "error": "Curso no válido."}
    if not archivos and not texto.strip():
        return {"ok": False, "error": "Agrega una foto, un PDF o pega el texto que hay que estudiar."}
    respuesta, error = ia.preguntar(prompt(curso, ramo, texto.strip()[:20000], bool(archivos)), timeout=900, archivos=archivos)
    if error:
        return {"ok": False, "error": error}
    t = leer_json_ia(respuesta)
    if isinstance(t, dict):
        completar(t, curso, ramo, time.strftime("%Y-%m-%d"))
    problemas = temas.validar(t) if isinstance(t, dict) else ["no devolvió un tema"]
    if problemas:
        return {"ok": False, "error": f"Lo que armó {ia.nombre()} no sirve todavía ({problemas[0]}). Inténtalo de nuevo o con una foto más clara."}
    return {"ok": True, "tema": t}


EXT_MATERIAL = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif", ".pdf")


def guardar(tema, archivos):
    problemas = temas.validar(tema)
    if problemas:
        return {"ok": False, "error": " ".join(problemas[:2])}
    base, n = tema["id"], 2
    while os.path.exists(os.path.join(datos.TEMAS, tema["id"])):
        tema["id"], n = f"{base}-{n}", n + 1
    carpeta = os.path.join(datos.TEMAS, tema["id"])
    os.makedirs(os.path.join(carpeta, "material"))
    nombres = []
    # Solo fotos y PDF (lo mismo que EXT_MATERIAL en motor/datos.js): un .html o un .svg no llega a la carpeta del tema.
    archivos = [a for a in archivos if os.path.splitext(a)[1].lower() in EXT_MATERIAL]
    for k, a in enumerate(archivos):
        destino = f"material-{k + 1}{os.path.splitext(a)[1].lower()}"
        shutil.copy2(a, os.path.join(carpeta, "material", destino))
        nombres.append(destino)
    if nombres:
        tema["fuente"] = nombres
    datos.escribir_json(os.path.join(carpeta, "tema.json"), tema)
    return {"ok": True, "tema": tema}


if __name__ == "__main__":
    a = sys.argv[1:]
    try:
        if len(a) == 3 and a[0] == "pedido":
            # El texto de la persona llega en un archivo, nunca como argumento (se vería en la lista de procesos).
            d = datos.leer_json(a[1], None)
            d = d if isinstance(d, dict) else {}
            archivos = [x for x in d.get("archivos") or [] if isinstance(x, str) and os.path.isfile(x)
                        and os.path.splitext(x)[1].lower() in EXT_MATERIAL]
            r = crear(str(d.get("curso") or ""), str(d.get("ramo") or "auto"), str(d.get("texto") or ""), archivos[:20])
        elif len(a) == 3 and a[0] == "amano":
            r = a_mano(datos.leer_json(a[1], None), time.strftime("%Y-%m-%d"))
        elif len(a) >= 3 and a[0] == "guardar":
            r = guardar(datos.leer_json(a[1], None), a[2:-1])
        elif len(a) >= 4:
            r = crear(a[0], a[1], a[2], a[3:-1])
        else:
            print(__doc__)
            sys.exit(2)
    except (OSError, ValueError) as e:
        r = {"ok": False, "error": str(e)}
    datos.escribir_json(a[-1], r)
    print(json.dumps({k: v for k, v in r.items() if k != "tema"}, ensure_ascii=False))
