"""Genera los datos FICTICIOS de la vista previa (ui/demo.json, ui/demo/cuaderno.jpg) y de las pruebas.

Uso: python3 herramientas/generar_demo.py     (necesita Pillow solo para la foto de cuaderno; la app no usa esto)
Los perfiles (Martina, Diego) son inventados. Los temas son contenidos escolares generales, revisados a mano.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "bin"))
import temas  # noqa: E402


def P(i, tipo, enunciado, correcta, explicacion, dificultad=1, opciones=None):
    p = {"id": f"p{i}", "tipo": tipo, "enunciado": enunciado, "correcta": correcta, "explicacion": explicacion, "dificultad": dificultad}
    if opciones:
        p["opciones"] = opciones
    return p


INDEPENDENCIA = {
    "formato": 1, "id": "independencia-de-chile", "titulo": "La Independencia de Chile", "ramo": "historia", "curso": "6b",
    "resumen": "Entre 1810 y 1818 Chile pasó de ser una colonia de España a ser un país independiente. Todo partió el 18 de septiembre de 1810 con la Primera Junta Nacional de Gobierno, que gobernaba en nombre del rey Fernando VII, que estaba preso por Napoleón. Ese período se llama Patria Vieja. En 1814 los patriotas perdieron la batalla de Rancagua y los españoles volvieron a gobernar: fue la Reconquista. Bernardo O'Higgins y José de San Martín organizaron en Mendoza el Ejército de los Andes, cruzaron la cordillera y ganaron la batalla de Chacabuco en 1817. Así empezó la Patria Nueva. En 1818 se proclamó la independencia, y la batalla de Maipú la aseguró.",
    "conceptos": [{"termino": "Patria Vieja", "definicion": "De 1810 a 1814: los primeros gobiernos criollos, desde la Primera Junta hasta la derrota de Rancagua."},
                  {"termino": "Reconquista", "definicion": "De 1814 a 1817: los españoles vuelven a gobernar Chile."},
                  {"termino": "Patria Nueva", "definicion": "Desde 1817: después de Chacabuco, con O'Higgins como Director Supremo."},
                  {"termino": "Ejército de los Andes", "definicion": "El ejército que se formó en Mendoza y cruzó la cordillera para liberar Chile."}],
    "preguntas": [
        P(1, "alternativas", "¿Qué se formó el 18 de septiembre de 1810?", 0, "Ese día se formó la Primera Junta Nacional de Gobierno, y por eso celebramos el 18.", 1,
          ["La Primera Junta Nacional de Gobierno", "El Congreso Nacional", "El Ejército de los Andes"]),
        P(2, "vf", "La Primera Junta gobernaba en nombre del rey Fernando VII.", True, "Sí: el rey estaba preso por Napoleón y la Junta decía gobernar en su nombre mientras volvía.", 2),
        P(3, "alternativas", "¿Cómo se llama el período entre 1810 y 1814?", 0, "Patria Vieja: los primeros años de gobierno criollo, antes de Rancagua.", 1,
          ["Patria Vieja", "Patria Nueva", "Reconquista"]),
        P(4, "completar", "En 1814 los patriotas perdieron la batalla de ___.", ["Rancagua"], "La derrota de Rancagua terminó con la Patria Vieja y dio paso a la Reconquista.", 2),
        P(5, "alternativas", "¿Dónde se organizó el Ejército de los Andes?", 1, "Se organizó en Mendoza, al otro lado de la cordillera, en Argentina.", 2,
          ["Santiago", "Mendoza", "Lima"]),
        P(6, "vf", "La batalla de Chacabuco fue en 1817.", True, "Sí, en febrero de 1817. Con ese triunfo empezó la Patria Nueva.", 1),
        P(7, "alternativas", "¿Qué batalla aseguró la independencia en 1818?", 2, "Maipú, en abril de 1818, aseguró la independencia que se había proclamado ese año.", 2,
          ["Rancagua", "Chacabuco", "Maipú"]),
        P(8, "vf", "La Reconquista fue el período en que Chile ya era independiente.", False, "Al revés: en la Reconquista los españoles volvieron a gobernar Chile.", 1),
        P(9, "completar", "El período que empezó después de Chacabuco se llama Patria ___.", ["Nueva"], "Patria Nueva: desde 1817, con O'Higgins como Director Supremo.", 1),
        P(10, "alternativas", "¿Quiénes lideraron el Ejército de los Andes?", 0, "Bernardo O'Higgins y José de San Martín.", 2,
          ["Bernardo O'Higgins y José de San Martín", "José Miguel Carrera y Manuel Rodríguez", "Arturo Prat y Carlos Condell"]),
    ],
    "tarjetas": [{"frente": "18 de septiembre de 1810", "reverso": "Primera Junta Nacional de Gobierno"},
                 {"frente": "1814", "reverso": "Derrota de Rancagua: empieza la Reconquista"},
                 {"frente": "1817", "reverso": "Batalla de Chacabuco: empieza la Patria Nueva"},
                 {"frente": "1818", "reverso": "Proclamación de la Independencia y batalla de Maipú"},
                 {"frente": "¿Quién fue Director Supremo en la Patria Nueva?", "reverso": "Bernardo O'Higgins"}],
    "autor": "Repasa (ejemplo)", "creado": "2026-10-20",
}

DIGESTIVO = {
    "formato": 1, "id": "sistema-digestivo", "titulo": "El sistema digestivo", "ramo": "ciencias", "curso": "5b",
    "resumen": "El sistema digestivo transforma lo que comemos en nutrientes que el cuerpo puede usar. En la boca, los dientes trituran la comida y la saliva la humedece. Por el esófago, un tubo, baja al estómago, donde los jugos gástricos la siguen deshaciendo. En el intestino delgado los nutrientes pasan a la sangre, que los lleva a todo el cuerpo. En el intestino grueso se absorbe el agua y se forman los desechos, que salen del cuerpo. El hígado ayuda produciendo la bilis.",
    "conceptos": [{"termino": "Digestión", "definicion": "Transformar los alimentos en nutrientes que el cuerpo puede usar."},
                  {"termino": "Esófago", "definicion": "Tubo que lleva el alimento de la boca al estómago."},
                  {"termino": "Intestino delgado", "definicion": "Donde los nutrientes pasan a la sangre."},
                  {"termino": "Intestino grueso", "definicion": "Donde se absorbe el agua y se forman los desechos."}],
    "preguntas": [
        P(1, "alternativas", "¿Dónde empieza la digestión?", 0, "Empieza en la boca: los dientes trituran la comida y la saliva la humedece.", 1, ["En la boca", "En el estómago", "En el intestino"]),
        P(2, "completar", "El tubo que lleva la comida al estómago se llama ___.", ["esófago", "esofago"], "El esófago conecta la boca con el estómago.", 1),
        P(3, "alternativas", "¿Dónde pasan los nutrientes a la sangre?", 1, "En el intestino delgado los nutrientes pasan a la sangre.", 2, ["En el estómago", "En el intestino delgado", "En el esófago"]),
        P(4, "vf", "En el intestino grueso se absorbe el agua.", True, "Sí: ahí se absorbe el agua y se forman los desechos.", 2),
        P(5, "vf", "La saliva sirve para triturar la comida.", False, "La saliva humedece la comida; los que la trituran son los dientes.", 2),
        P(6, "alternativas", "¿Qué órgano produce la bilis?", 2, "El hígado produce la bilis, que ayuda a digerir las grasas.", 3, ["El estómago", "El corazón", "El hígado"]),
        P(7, "completar", "En el estómago, los jugos ___ siguen deshaciendo la comida.", ["gástricos", "gastricos"], "Los jugos gástricos del estómago deshacen la comida.", 2),
        P(8, "vf", "La sangre lleva los nutrientes a todo el cuerpo.", True, "Sí: los nutrientes viajan por la sangre a todas las células.", 1),
    ],
    "tarjetas": [{"frente": "Boca", "reverso": "Los dientes trituran y la saliva humedece"}, {"frente": "Estómago", "reverso": "Los jugos gástricos deshacen la comida"},
                 {"frente": "Intestino delgado", "reverso": "Los nutrientes pasan a la sangre"}, {"frente": "Intestino grueso", "reverso": "Se absorbe el agua"}],
    "autor": "Repasa (ejemplo)", "creado": "2026-10-18",
}

FRACCIONES = {
    "formato": 1, "id": "fracciones", "titulo": "Fracciones: comparar y sumar", "ramo": "matematica", "curso": "6b",
    "resumen": "Una fracción dice cuántas partes tomas de un entero dividido en partes iguales: el numerador (arriba) son las partes que tomas y el denominador (abajo) en cuántas partes se divide. Dos fracciones son equivalentes si representan lo mismo, como 1/2 y 2/4. Para sumar fracciones con el mismo denominador, sumas los numeradores y dejas el denominador igual: 1/5 + 2/5 = 3/5. Si tienen el mismo denominador, es mayor la que tiene el numerador más grande.",
    "conceptos": [{"termino": "Numerador", "definicion": "El número de arriba: cuántas partes tomas."}, {"termino": "Denominador", "definicion": "El número de abajo: en cuántas partes iguales se divide el entero."},
                  {"termino": "Fracciones equivalentes", "definicion": "Fracciones distintas que representan la misma cantidad, como 1/2 y 2/4."}],
    "preguntas": [
        P(1, "alternativas", "¿Cuánto es 1/5 + 2/5?", 1, "Con el mismo denominador, sumas arriba: 1 + 2 = 3, y queda 3/5.", 1, ["3/10", "3/5", "2/5"]),
        P(2, "alternativas", "¿Qué fracción es equivalente a 1/2?", 2, "4/8: multiplicas 1 y 2 por 4.", 1, ["1/4", "2/3", "4/8"]),
        P(3, "vf", "3/7 es mayor que 5/7.", False, "Con el mismo denominador, gana el numerador más grande: 5/7 es mayor.", 1),
        P(4, "completar", "En 3/4, el número 4 se llama ___.", ["denominador"], "El de abajo es el denominador: el entero se dividió en 4 partes.", 1),
        P(5, "alternativas", "Si una pizza tiene 8 trozos y te comes 2, ¿qué fracción comiste?", 0, "2 de 8 trozos: 2/8, que es lo mismo que 1/4.", 2, ["2/8", "8/2", "2/6"]),
        P(6, "vf", "2/3 y 4/6 son equivalentes.", True, "Sí: 4/6 es 2/3 multiplicando arriba y abajo por 2.", 2),
        P(7, "alternativas", "¿Cuánto es 7/9 − 4/9?", 0, "Restas arriba y dejas el denominador: 7 − 4 = 3, queda 3/9.", 2, ["3/9", "3/0", "11/9"]),
        P(8, "completar", "1/3 + 1/3 + 1/3 = ___", ["1", "3/3", "un entero", "uno"], "Tres tercios forman un entero: 3/3 = 1.", 3),
    ],
    "tarjetas": [{"frente": "Sumar con el mismo denominador", "reverso": "Sumas los numeradores y dejas el denominador"}, {"frente": "¿Cuál es mayor, 2/9 o 5/9?", "reverso": "5/9"}],
    "autor": "Repasa (ejemplo)", "creado": "2026-10-15",
}

ORACION = {
    "formato": 1, "id": "sujeto-y-predicado", "titulo": "Sujeto y predicado", "ramo": "lenguaje", "curso": "6b",
    "resumen": "Casi todas las oraciones tienen dos partes. El sujeto es de quién o de qué se habla, y el predicado es lo que se dice del sujeto. En «Los niños juegan en el parque», el sujeto es «Los niños» y el predicado es «juegan en el parque». La palabra más importante del sujeto es el núcleo del sujeto, que suele ser un sustantivo («niños»). La más importante del predicado es el núcleo del predicado, que es el verbo («juegan»). Para encontrar el sujeto, pregúntale al verbo: ¿quiénes juegan?",
    "conceptos": [{"termino": "Sujeto", "definicion": "De quién o de qué se habla en la oración."}, {"termino": "Predicado", "definicion": "Lo que se dice del sujeto."},
                  {"termino": "Núcleo del predicado", "definicion": "El verbo, la palabra más importante del predicado."}],
    "preguntas": [
        P(1, "alternativas", "En «Mi abuela cocina empanadas», ¿cuál es el sujeto?", 0, "Pregúntale al verbo: ¿quién cocina? Mi abuela.", 1, ["Mi abuela", "cocina empanadas", "empanadas"]),
        P(2, "alternativas", "En «El perro ladra fuerte», ¿cuál es el núcleo del predicado?", 1, "El núcleo del predicado es el verbo: ladra.", 1, ["perro", "ladra", "fuerte"]),
        P(3, "vf", "El predicado es lo que se dice del sujeto.", True, "Sí: el sujeto es de quién se habla y el predicado, lo que se dice de él.", 1),
        P(4, "completar", "El núcleo del sujeto suele ser un ___.", ["sustantivo"], "Un sustantivo, como «niños» o «abuela».", 2),
        P(5, "alternativas", "En «Llegaron mis primos», ¿cuál es el sujeto?", 2, "¿Quiénes llegaron? Mis primos. El sujeto también puede ir al final.", 3, ["Llegaron", "Llegaron mis", "mis primos"]),
        P(6, "vf", "Para encontrar el sujeto, le preguntamos al verbo «¿quién?».", True, "Sí: ¿quién o quiénes hacen la acción del verbo?", 1),
    ],
    "tarjetas": [{"frente": "Sujeto", "reverso": "De quién o de qué se habla"}, {"frente": "Núcleo del predicado", "reverso": "El verbo"}],
    "autor": "Repasa (ejemplo)", "creado": "2026-10-12",
}

TEMAS = [INDEPENDENCIA, DIGESTIVO, FRACCIONES, ORACION]


def progreso_martina():
    cajas = {"independencia-de-chile/p1": 3, "independencia-de-chile/p2": 1, "independencia-de-chile/p3": 2, "independencia-de-chile/p6": 4,
             "sistema-digestivo/p1": 5, "sistema-digestivo/p2": 4, "sistema-digestivo/p3": 2, "sistema-digestivo/p4": 3,
             "fracciones/p1": 3, "fracciones/p2": 2, "fracciones/p3": 1, "sujeto-y-predicado/p1": 4, "sujeto-y-predicado/p2": 3}
    proximas = {1: "2026-10-25", 2: "2026-10-25", 3: "2026-10-27", 4: "2026-10-30", 5: "2026-11-05"}
    preguntas = {k: {"caja": c, "proxima": proximas[c], "aciertos": c + 1, "errores": 1 if c < 3 else 0, "ultima": "2026-10-24"} for k, c in cajas.items()}
    return {"preguntas": preguntas, "puntos": 320, "racha": 4, "ultimo_dia": "2026-10-24",
            "sesiones": [{"fecha": f"2026-10-{d}", "preguntas": n, "aciertos": a} for d, n, a in [(18, 10, 7), (21, 12, 9), (22, 10, 8), (23, 8, 7), (24, 12, 10)]]}


def foto_cuaderno(ruta):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 900, 1200
    img = Image.new("RGB", (W, H), (248, 246, 238))
    d = ImageDraw.Draw(img)
    for y in range(140, H, 46):
        d.line([(0, y), (W, y)], fill=(186, 206, 232), width=2)
    d.line([(110, 0), (110, H)], fill=(232, 150, 150), width=3)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf", 30)
        t = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf", 38)
    except OSError:
        f = t = ImageFont.load_default()
    d.text((130, 82), "Historia — Independencia de Chile", font=t, fill=(40, 60, 140))
    lineas = ["1810: 18 de sept. Primera Junta Nacional de Gobierno", "   (en nombre de Fernando VII) → Patria Vieja", "1814: derrota de Rancagua → Reconquista",
              "   los españoles vuelven a gobernar", "Ejército de los Andes (Mendoza):", "   O'Higgins y San Martín cruzan la cordillera",
              "1817: batalla de Chacabuco → Patria Nueva", "   O'Higgins Director Supremo", "1818: se proclama la Independencia", "   batalla de Maipú (abril) la asegura",
              "", "¡Prueba el viernes! estudiar fechas ★"]
    for k, l in enumerate(lineas):
        d.text((130, 150 + k * 46 - 34), l, font=f, fill=(30, 40, 90) if "★" not in l else (190, 40, 40))
    img = img.rotate(-1.4, expand=False, fillcolor=(90, 80, 70))
    img.save(ruta, quality=82)


def main():
    for t in TEMAS:
        assert not temas.validar(t), (t["id"], temas.validar(t))
    demo = {"version": "0.1.0", "hoy": "2026-10-25", "carpeta": "~/Repasa", "config": {"ia": "claude", "bienvenida": True},
            "ias": [{"id": "claude", "nombre": "Claude", "instalada": True}, {"id": "codex", "nombre": "ChatGPT (Codex)", "instalada": True},
                    {"id": "gemini", "nombre": "Gemini", "instalada": False}],
            "perfiles": [{"id": "martina", "nombre": "Martina", "curso": "6b", "avatar": "🦊"}, {"id": "diego", "nombre": "Diego", "curso": "1m", "avatar": "🐼"}],
            "temas": TEMAS, "progreso": {"martina": progreso_martina(), "diego": {"preguntas": {}, "puntos": 0, "racha": 0, "sesiones": []}},
            "pruebas": [{"id": "prueba-historia", "perfil": "martina", "ramo": "historia", "temas": ["independencia-de-chile"], "fecha": "2026-10-30"}]}
    with open(os.path.join(RAIZ, "ui", "demo.json"), "w", encoding="utf-8") as f:
        json.dump(demo, f, ensure_ascii=False, indent=1)
        f.write("\n")
    for t in TEMAS[:1]:
        with open(os.path.join(RAIZ, "pruebas", "datos", t["id"] + ".json"), "w", encoding="utf-8") as f:
            json.dump(t, f, ensure_ascii=False, indent=1)
    foto_cuaderno(os.path.join(RAIZ, "ui", "demo", "cuaderno.jpg"))
    import shutil
    shutil.copy(os.path.join(RAIZ, "ui", "demo", "cuaderno.jpg"), os.path.join(RAIZ, "pruebas", "datos", "cuaderno.jpg"))
    print(f"✓ demo: {len(TEMAS)} temas, {sum(len(t['preguntas']) for t in TEMAS)} preguntas")


if __name__ == "__main__":
    main()
