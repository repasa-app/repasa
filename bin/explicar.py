"""«No entendí»: la IA explica una pregunta de otra forma, más simple y con un ejemplo. Solo biblioteca estándar.

  explicar.py <tema_id> <pregunta_id> "<lo que respondió el estudiante o vacío>" <salida.json>

La IA solo ve el tema (resumen y esa pregunta). La respuesta se limita a texto plano corto; la interfaz la escapa al mostrarla.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import datos  # noqa: E402
import ia  # noqa: E402
import temas  # noqa: E402


def respuesta_correcta(p):
    if p["tipo"] == "alternativas":
        return p["opciones"][p["correcta"]]
    if p["tipo"] == "vf":
        return "Verdadero" if p["correcta"] else "Falso"
    return p["correcta"][0]


def pedido(t, p, respondio):
    """Lo que ve la IA: el tema (resumen) y esa pregunta, nunca quién pregunta. Igual que motor/explicar.js."""
    return f"""Eres un profesor chileno muy paciente. Un estudiante de {temas.nombre_curso(t['curso'])} no entendió esta pregunta
de {temas.RAMOS[t['ramo']]} sobre «{t['titulo']}».

Lo que dice el tema: {t['resumen']}
Pregunta: {p['enunciado']}
Respuesta correcta: {respuesta_correcta(p)}
{f"El estudiante respondió: {respondio[:100]}" if respondio else ""}

Explícale de OTRA forma, más simple que «{p['explicacion']}»: usa un ejemplo de la vida diaria o una comparación, en 3 a 5 frases
cortas, hablándole de tú y con cariño. Si respondió mal, dile sin retarlo por qué su respuesta no era. Solo texto plano, sin títulos
ni listas ni emojis de más (uno como máximo). No agregues datos que no estén en el tema."""


def limpiar(texto):
    """Solo texto plano corto: sin Markdown ni HTML, hasta 900 caracteres."""
    return re.sub(r"[#*_`<>]", "", texto).strip()[:900]


def explicar(tema_id, pregunta_id, respondio):
    if not re.fullmatch(r"[a-z0-9-]{2,60}", tema_id or ""):
        return {"ok": False, "error": "Tema no válido."}
    t = datos.leer_json(os.path.join(datos.TEMAS, tema_id, "tema.json"), None) or datos.leer_json(os.path.join(datos.INTERNO, "catalogo", tema_id + ".json"), None)
    if not t or temas.validar(t):
        return {"ok": False, "error": "No encontré ese tema."}
    p = next((x for x in t["preguntas"] if x["id"] == pregunta_id), None)
    if not p:
        return {"ok": False, "error": "No encontré esa pregunta."}
    texto, error = ia.preguntar(pedido(t, p, respondio), timeout=180)
    if error:
        return {"ok": False, "error": error}
    return {"ok": True, "texto": limpiar(texto), "pregunta": pregunta_id}


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(2)
    r = explicar(sys.argv[1], sys.argv[2], sys.argv[3])
    datos.escribir_json(sys.argv[4], r)
    print(json.dumps(r, ensure_ascii=False)[:300])
