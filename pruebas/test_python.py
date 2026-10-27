"""Pruebas del motor en Python. Nunca tocan datos reales ni llaman a una IA de verdad: usan una carpeta temporal (REPASA_CARPETA)
y una IA falsa en el PATH (pruebas/ia_falsa.py, instalada como «claude»).

Uso: python3 pruebas/test_python.py
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, "pruebas", "datos")
TMP = tempfile.mkdtemp(prefix="repasa-pruebas-")
os.environ["REPASA_CARPETA"] = os.path.join(TMP, "Repasa")
os.environ["REPASA_TEMA_FALSO"] = os.path.join(DATOS, "independencia-de-chile.json")
BIN_FALSO = os.path.join(TMP, "bin")
os.makedirs(BIN_FALSO)
destino = os.path.join(BIN_FALSO, "claude")
shutil.copy(os.path.join(RAIZ, "pruebas", "ia_falsa.py"), destino)
os.chmod(destino, os.stat(destino).st_mode | stat.S_IEXEC)
os.environ["PATH"] = BIN_FALSO + os.pathsep + os.environ["PATH"]
sys.path.insert(0, os.path.join(RAIZ, "bin"))

import crear_tema  # noqa: E402
import datos  # noqa: E402
import lineas  # noqa: E402
import temas  # noqa: E402

FOTO = os.path.join(DATOS, "cuaderno.jpg")
with open(os.environ["REPASA_TEMA_FALSO"], encoding="utf-8") as f:
    TEMA = json.load(f)


def correr(script, *args, env=None):
    salida = os.path.join(TMP, "salida.json")
    r = subprocess.run([sys.executable, os.path.join(RAIZ, "bin", script), *args, salida], capture_output=True, text=True, env={**os.environ, **(env or {})})
    assert r.returncode == 0, r.stderr
    with open(salida, encoding="utf-8") as f:
        return json.load(f)


class Temas(unittest.TestCase):
    def test_temas_de_ejemplo_validos(self):
        with open(os.path.join(RAIZ, "ui", "demo.json"), encoding="utf-8") as f:
            demo = json.load(f)
        for t in demo["temas"]:
            self.assertEqual(temas.validar(t), [], t["id"])
        for n in os.listdir(os.path.join(RAIZ, "temas")):
            if n.endswith(".json"):
                with open(os.path.join(RAIZ, "temas", n), encoding="utf-8") as f:
                    t = json.load(f)
                self.assertEqual(temas.validar(t), [], n)
                self.assertEqual(t["id"] + ".json", n)

    def test_validar_rechaza_lo_raro(self):
        malo = json.loads(json.dumps(TEMA))
        malo.update({"id": "X X", "ramo": "astrologia", "curso": "9z", "script": "1", "titulo": "<b>hola</b>"})
        malo["preguntas"][0]["correcta"] = 7
        malo["preguntas"][1]["opciones"] = ["a", "b"]
        malo["preguntas"][3]["enunciado"] = "Sin espacio para completar"
        texto = " ".join(temas.validar(malo))
        for parte in ("id:", "ramo", "curso", "Campos desconocidos", "titulo", "pregunta 1", "pregunta 2", "pregunta 4"):
            self.assertIn(parte, texto)
        self.assertTrue(temas.validar("no"))

    def test_id_de(self):
        self.assertEqual(datos.id_de("La Independencia de Chile!"), "la-independencia-de-chile")
        self.assertEqual(datos.id_de("¿¿??"), "tema")


class Casos(unittest.TestCase):
    """Los casos compartidos con el motor JS (pruebas/casos.json): Python y JS tienen que dar exactamente lo mismo."""
    with open(os.path.join(RAIZ, "pruebas", "casos.json"), encoding="utf-8") as f:
        C = json.load(f)

    def test_validar(self):
        for nombre, t, esperado in self.C["validar"]:
            self.assertEqual(temas.validar(t), esperado, nombre)

    def test_id_de(self):
        for texto, esperado in self.C["id_de"]:
            self.assertEqual(datos.id_de(texto), esperado, texto)

    def test_lineas_y_conceptos(self):
        for texto, idioma, esperado in self.C["lineas"]:
            self.assertEqual(lineas.leer_preguntas(texto, idioma), esperado)
        for texto, idioma, conceptos, tarjetas in self.C["conceptos"]:
            self.assertEqual(lineas.leer_conceptos(texto), conceptos)
            self.assertEqual(lineas.tarjetas_de(conceptos, idioma), tarjetas)

    def test_a_mano(self):
        for d, hoy, esperado in self.C["a_mano"]:
            self.assertEqual(crear_tema.a_mano(d, hoy), esperado, d.get("titulo"))


class Crear(unittest.TestCase):
    def setUp(self):
        shutil.rmtree(datos.BASE, ignore_errors=True)

    def test_crear_con_foto_y_guardar(self):
        r = correr("crear_tema.py", "6b", "historia", "", FOTO)
        self.assertTrue(r["ok"], r)
        t = r["tema"]
        self.assertNotEqual(t["titulo"], "Sin material", "la IA recibió una copia de la foto")
        self.assertEqual((t["curso"], t["ramo"], t["autor"]), ("6b", "historia", "ia"))
        self.assertFalse(os.path.exists(datos.TEMAS), "crear no guarda nada")
        ruta = os.path.join(TMP, "tema.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(t, f, ensure_ascii=False)
        g = correr("crear_tema.py", "guardar", ruta, FOTO)
        self.assertTrue(g["ok"], g)
        carpeta = os.path.join(datos.TEMAS, g["tema"]["id"])
        self.assertTrue(os.path.exists(os.path.join(carpeta, "material", "material-1.jpg")))
        self.assertEqual(g["tema"]["fuente"], ["material-1.jpg"])
        g2 = correr("crear_tema.py", "guardar", ruta)  # mismo título: no pisa el anterior
        self.assertNotEqual(g2["tema"]["id"], g["tema"]["id"])

    def test_respuesta_mala_de_la_ia_no_se_usa(self):
        r = correr("crear_tema.py", "6b", "auto", "La Patria Vieja…", env={"REPASA_IA_MALA": "1"})
        self.assertFalse(r["ok"])
        self.assertIn("no sirve", r["error"])

    def test_a_mano_por_linea_de_comandos(self):
        entrada = os.path.join(TMP, "a_mano.json")
        d = json.loads(json.dumps(Casos.C["a_mano"][0][0]))
        with open(entrada, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        r = correr("crear_tema.py", "amano", entrada)
        self.assertTrue(r["ok"], r)
        self.assertEqual(temas.validar(r["tema"]), [])
        self.assertFalse(os.path.exists(datos.TEMAS), "a mano tampoco guarda nada")

    def test_sin_material(self):
        r = correr("crear_tema.py", "6b", "historia", "  ")
        self.assertFalse(r["ok"])


class Explicar(unittest.TestCase):
    def test_explicar_limpia_el_texto(self):
        shutil.rmtree(datos.BASE, ignore_errors=True)
        datos.escribir_json(os.path.join(datos.TEMAS, TEMA["id"], "tema.json"), TEMA)
        r = correr("explicar.py", TEMA["id"], "p4", "Chacabuco")
        self.assertTrue(r["ok"], r)
        self.assertNotIn("<", r["texto"])
        self.assertNotIn("#", r["texto"])
        self.assertNotIn("**", r["texto"])
        self.assertFalse(correr("explicar.py", "../etc", "p1", "")["ok"])
        self.assertFalse(correr("explicar.py", TEMA["id"], "p99", "")["ok"])


class Seguridad(unittest.TestCase):
    """Content-Security-Policy de la interfaz y de la página pública (docs/)."""

    def csp(self, html):
        import re
        m = re.search(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)">', html)
        self.assertTrue(m, "falta la Content-Security-Policy")
        return m.group(1)

    def test_interfaz(self):
        csp = self.csp(open(os.path.join(RAIZ, "ui", "index.html"), encoding="utf-8").read())
        for parte in ("default-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"):
            self.assertIn(parte, csp)
        self.assertNotIn("unsafe-eval", csp)
        self.assertNotIn("script-src", csp, "los scripts solo desde la app misma (default-src 'self'), nunca en línea")

    def test_pagina_publica(self):
        # Cada <script> en línea de docs/ va con su huella en script-src: si cambias uno, pon aquí la huella nueva que pide esta prueba.
        import base64
        import glob
        import hashlib
        import re
        for f in glob.glob(os.path.join(RAIZ, "docs", "*.html")):
            html = open(f, encoding="utf-8").read()
            csp = self.csp(html)
            self.assertNotIn("unsafe-eval", csp)
            self.assertNotRegex(csp, r"script-src[^;]*'unsafe-inline'")
            self.assertNotRegex(html, r"<[^>]+\son[a-z]+=", "sin manejadores en línea (onclick=…): la CSP los bloquea")
            for attrs, cuerpo in re.findall(r"<script([^>]*)>(.*?)</script>", html, re.S):
                if "ld+json" in attrs or "src=" in attrs:
                    continue
                huella = "'sha256-" + base64.b64encode(hashlib.sha256(cuerpo.encode()).digest()).decode() + "'"
                self.assertIn(huella, csp, f"{os.path.basename(f)}: el script en línea cambió; pon {huella} en script-src")


if __name__ == "__main__":
    try:
        unittest.main(verbosity=1)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
