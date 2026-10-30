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
os.environ["REPASA_DATOS"] = os.path.join(TMP, "Repasa", ".repasa")  # la config de nucleo (pieza), en la misma carpeta temporal
os.environ["PRUEBA_TEMA_FALSO"] = os.path.join(DATOS, "independencia-de-chile.json")
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
with open(os.environ["PRUEBA_TEMA_FALSO"], encoding="utf-8") as f:
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


    def test_datos(self):
        for valor, esperado in self.C["datos"]["perfil"]:
            self.assertEqual(datos.perfil_valido(valor), esperado, valor)
        for valor, esperado in self.C["datos"]["prueba"]:
            self.assertEqual(datos.prueba_valida(valor), esperado, valor)


class Escritorio(unittest.TestCase):
    """Lo que usan las apps de escritorio: estado.py, guardar.py y los pedidos con un archivo de entrada (nada como argumento)."""

    def setUp(self):
        shutil.rmtree(datos.BASE, ignore_errors=True)

    def entrada(self, d):
        ruta = os.path.join(TMP, "entrada.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        return ruta

    def test_estado_y_guardar(self):
        e = correr("estado.py")
        self.assertTrue(e["ok"])
        self.assertEqual((e["perfiles"], e["temas"], e["progreso"], e["pruebas"]), ([], [], {}, []))
        self.assertEqual(sorted(t["id"] for t in e["catalogo"]), ["fracciones", "independencia-de-chile", "sistema-digestivo", "sujeto-y-predicado"])
        self.assertEqual(stat.S_IMODE(os.stat(datos.BASE).st_mode), 0o700, "~/Repasa solo para la persona")
        perfil = {"id": "martina", "nombre": "  Martina  ", "curso": "6b", "avatar": "🦊", "extra": "no"}
        self.assertTrue(correr("guardar.py", "perfil", self.entrada({"perfil": perfil}))["ok"])
        self.assertFalse(correr("guardar.py", "perfil", self.entrada({"perfil": {**perfil, "id": "../x"}}))["ok"])
        self.assertTrue(correr("guardar.py", "progreso", self.entrada({"perfil": "martina", "progreso": {"puntos": 10}}))["ok"])
        self.assertFalse(correr("guardar.py", "progreso", self.entrada({"perfil": "../../x", "progreso": {}}))["ok"])
        prueba = {"id": "p1", "perfil": "martina", "ramo": "historia", "temas": ["independencia-de-chile"], "fecha": "2026-10-30"}
        self.assertTrue(correr("guardar.py", "pruebas", self.entrada({"pruebas": [prueba, {"id": "mala"}]}))["ok"])
        self.assertFalse(correr("guardar.py", "otra", self.entrada({}))["ok"])
        datos.escribir_json(os.path.join(datos.TEMAS, TEMA["id"], "tema.json"), TEMA)
        datos.escribir_json(os.path.join(datos.TEMAS, "roto", "tema.json"), {"formato": 1})
        e = correr("estado.py")
        self.assertEqual(e["perfiles"], [{"id": "martina", "nombre": "Martina", "curso": "6b", "avatar": "🦊"}])
        self.assertEqual(e["progreso"], {"martina": {"puntos": 10}})
        self.assertEqual(e["pruebas"], [prueba])
        self.assertEqual([t["id"] for t in e["temas"]], [TEMA["id"]], "un tema que no valida no llega a la interfaz")
        self.assertNotIn(TEMA["id"], [t["id"] for t in e["catalogo"]], "lo ya agregado no se ofrece de nuevo")
        archivo = os.path.join(datos.BASE, "perfiles.json")
        self.assertEqual(stat.S_IMODE(os.stat(archivo).st_mode), 0o600)

    def test_pedido_crear_y_explicar(self):
        raro = os.path.join(TMP, "nota.txt")
        with open(raro, "w", encoding="utf-8") as f:
            f.write("x")
        r = correr("crear_tema.py", "pedido", self.entrada({"curso": "6b", "ramo": "historia", "texto": "", "archivos": [FOTO, raro, "/no/existe.jpg"]}))
        self.assertTrue(r["ok"], r)
        self.assertNotEqual(r["tema"]["titulo"], "Sin material", "la foto llegó a la IA")
        self.assertFalse(correr("crear_tema.py", "pedido", self.entrada({"curso": "6b", "ramo": "historia", "texto": " ", "archivos": [raro]}))["ok"])
        datos.escribir_json(os.path.join(datos.TEMAS, TEMA["id"], "tema.json"), TEMA)
        r = correr("explicar.py", self.entrada({"tema": TEMA["id"], "pregunta": "p4", "respondio": "Chacabuco"}))
        self.assertTrue(r["ok"], r)
        self.assertFalse(correr("explicar.py", self.entrada({"tema": "../x", "pregunta": "p1"}))["ok"])


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
        # Solo fotos y PDF llegan al material (igual que motor/datos.js): una página web, no.
        raro = os.path.join(TMP, "pagina.html")
        with open(raro, "w", encoding="utf-8") as f:
            f.write("<script>alert(1)</script>")
        g3 = correr("crear_tema.py", "guardar", ruta, raro, FOTO)
        self.assertEqual(g3["tema"]["fuente"], ["material-1.jpg"])
        self.assertEqual(os.listdir(os.path.join(datos.TEMAS, g3["tema"]["id"], "material")), ["material-1.jpg"])

    def test_respuesta_mala_de_la_ia_no_se_usa(self):
        r = correr("crear_tema.py", "6b", "auto", "La Patria Vieja…", env={"PRUEBA_IA_MALA": "1"})
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


class Piezas(unittest.TestCase):
    """Repasa usa las piezas nucleo, ia e i18n de Pieza sin mover los datos de la familia."""

    def test_app_json_respeta_la_carpeta_de_siempre(self):
        import nucleo
        a = nucleo.app()
        self.assertEqual((a["id"], a["nombre"], a["datos"]), ("repasa", "Repasa", "visible"), "~/Repasa/.repasa, como siempre")
        self.assertEqual(os.path.realpath(nucleo.carpeta_datos()), os.path.realpath(datos.INTERNO))
        self.assertEqual(os.path.realpath(datos.RECURSOS), RAIZ)

    def test_config_solo_lo_que_dice_app_json(self):
        shutil.rmtree(datos.BASE, ignore_errors=True)
        os.makedirs(datos.INTERNO)
        with open(os.path.join(datos.INTERNO, "config.json"), "w", encoding="utf-8") as f:
            json.dump({"ia": "codex", "idioma_ui": "fr", "bienvenida": True, "otra": "<b>x</b>", "ultimo_perfil": "martina"}, f)
        c = datos.config()
        self.assertEqual(c, {"ia": "codex", "idioma_ui": "", "bienvenida": True, "ultimo_perfil": "martina"})
        self.assertEqual(stat.S_IMODE(os.stat(datos.BASE).st_mode), 0o700, "~/Repasa sigue solo para la cuenta de la persona")

    def test_escribir_siempre_privado(self):
        ruta = os.path.join(datos.BASE, "perfiles.json")
        datos.escribir_json(ruta, [])
        os.chmod(ruta, 0o644)
        datos.escribir_json(ruta, [])
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600, "lo de los niños queda 0600 aunque antes fuera otra cosa")

    def test_app_json_va_dentro_de_la_app(self):
        with open(os.path.join(RAIZ, "herramientas", "empaquetar.sh"), encoding="utf-8") as f:
            self.assertIn('cp "$RAIZ/app.json" "$CODIGO/app.json"', f.read())
        with open(os.path.join(RAIZ, "piezas.json"), encoding="utf-8") as f:
            self.assertEqual(set(json.load(f)["piezas"]), {"nucleo", "ia", "i18n"})


class Seguridad(unittest.TestCase):
    """Content-Security-Policy de la interfaz y de la página pública (docs/), lo que recibe la IA y cómo se arma el HTML."""

    def _con_ia(self, id_ia, nombre, archivos=()):
        """Corre ia.ejecutar (pieza «ia») con un CLI falso que anota sus argumentos, su entorno y los archivos de su carpeta."""
        import ia
        carpeta = tempfile.mkdtemp(dir=TMP)
        anotado = os.path.join(carpeta, "anotado.json")
        ruta = os.path.join(carpeta, nombre)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write("#!" + sys.executable + "\nimport json, os, sys\n"
                    "if '--help' in sys.argv: print('--strict-mcp-config --allowedTools --disallowedTools --tools --safe-mode --setting-sources'); sys.exit(0)\n"
                    f"json.dump({{'argv': sys.argv[1:], 'env': dict(os.environ), 'archivos': os.listdir('.')}}, open({anotado!r}, 'w'))\n"
                    "print('listo')\n")
        os.chmod(ruta, 0o755)
        antes_path = os.environ["PATH"]
        os.environ["PATH"] = carpeta + os.pathsep + antes_path
        os.environ["REPASA_SECRETO_PRUEBA"] = "no-debe-llegar"
        ia._ayuda.clear()  # cada CLI falso responde su propio --help
        try:
            r = ia.ejecutar("PEDIDO-SECRETO de la familia", ia=id_ia, timeout=60, archivos=archivos)
        finally:
            os.environ["PATH"] = antes_path
            del os.environ["REPASA_SECRETO_PRUEBA"]
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(anotado, encoding="utf-8") as f:
            return json.load(f)

    def test_ia_no_recibe_variables_de_repasa(self):
        for id_ia, nombre in (("claude", "claude"), ("codex", "codex"), ("gemini", "agy")):
            x = self._con_ia(id_ia, nombre)
            self.assertFalse([k for k in x["env"] if k.startswith("REPASA_")], f"{id_ia}: las variables REPASA_* no llegan a la IA")
        x = self._con_ia("claude", "claude")
        self.assertEqual((x["env"].get("CLAUDE_CODE_DISABLE_CLAUDE_MDS"), x["env"].get("CLAUDE_CODE_DISABLE_AUTO_MEMORY")), ("1", "1"),
                         "Claude corre sin la memoria de la persona")
        self.assertEqual(x["argv"][x["argv"].index("--disallowedTools") + 1], "*", "sin material, ninguna herramienta")
        self.assertIn("--safe-mode", x["argv"])
        self.assertEqual(x["argv"][x["argv"].index("--setting-sources") + 1], "user", "nunca la configuración de un proyecto")

    def test_con_material_claude_solo_lee(self):
        x = self._con_ia("claude", "claude", archivos=[FOTO])
        self.assertEqual(x["argv"][x["argv"].index("--allowedTools") + 1], "Read,Glob,Grep", "solo leer (las copias en la carpeta temporal)")
        self.assertNotIn("--add-dir", x["argv"], "con material no se agrega ninguna carpeta: solo la temporal con las copias")
        prohibidas = x["argv"][x["argv"].index("--disallowedTools") + 1].split(",")
        for h in ("Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "Task"):
            self.assertIn(h, prohibidas)
        self.assertIn("material-1.jpg", x["archivos"])

    def test_ia_corre_en_carpeta_temporal_y_sin_pedido_en_argumentos(self):
        for id_ia, nombre in (("claude", "claude"), ("codex", "codex"), ("gemini", "agy")):
            x = self._con_ia(id_ia, nombre, archivos=[FOTO])
            self.assertFalse(any("PEDIDO-SECRETO" in a for a in x["argv"]), f"{id_ia}: el pedido nunca va en los argumentos")
            self.assertTrue(any(a.startswith("material-1") for a in x["archivos"]), f"{id_ia}: ve la copia del material")
            self.assertLessEqual(set(x["archivos"]), {"material-1.jpg", "instrucciones.md", "respuesta.txt"},
                                 f"{id_ia}: corre en una carpeta temporal con solo las copias (nunca en ~/Repasa ni en el código)")

    def test_probar_con_archivo_de_entrada(self):
        """La app de Mac prueba la IA con `ia.py probar <entrada {ia}> <salida>` (pieza «ia»), nunca con la IA como argumento."""
        r = correr("ia.py", "probar", self.entrada({"ia": "claude"}))
        self.assertEqual(r, {"ia": "claude", "ok": True})
        r = correr("ia.py", "probar", self.entrada({"ia": "otra"}))
        self.assertEqual((r["ok"], r["codigo"]), (False, "desconocida"))
        r = correr("ia.py", "probar", self.entrada({"ia": "codex"}), env={"PATH": BIN_FALSO + os.pathsep + "/usr/bin:/bin"})
        self.assertEqual((r["ok"], r["codigo"]), (False, "no_instalada"), "sin el CLI, lo dice con su código")
        self.assertIn("ChatGPT (Codex)", r["error"])

    def test_ia_vieja_nunca_corre_sin_protecciones(self):
        carpeta = tempfile.mkdtemp(dir=TMP)
        marca = os.path.join(carpeta, "corrio")
        with open(os.path.join(carpeta, "claude"), "w", encoding="utf-8") as f:
            f.write(f"#!{sys.executable}\nimport sys\nif '--help' in sys.argv: print('-p --print'); sys.exit(0)\n"
                    f"open({marca!r}, 'w').write('x'); print('listo')\n")
        os.chmod(os.path.join(carpeta, "claude"), 0o755)
        r = correr("ia.py", "probar", self.entrada({"ia": "claude"}), env={"PATH": carpeta + os.pathsep + "/usr/bin:/bin"})
        self.assertEqual((r["ok"], r["codigo"]), (False, "actualizar"), "pide actualizarla en vez de correrla sin protecciones")
        self.assertFalse(os.path.exists(marca), "un CLI que no conoce las protecciones nunca recibe el pedido")

    def entrada(self, d):
        ruta = os.path.join(TMP, "entrada-ia.json")
        with open(ruta, "w", encoding="utf-8") as f:
            json.dump(d, f)
        return ruta

    def test_pedido_a_antigravity_va_en_archivo(self):
        x = self._con_ia("gemini", "agy")
        self.assertFalse(any("PEDIDO-SECRETO" in a for a in x["argv"]), "el pedido nunca va en los argumentos (los ve cualquier programa)")
        self.assertIn("instrucciones.md", x["archivos"])

    def test_T_escapa_los_valores(self):
        """T() y Thtml() son los de la pieza «i18n» (ui/i18n.js): T escapa la frase y sus valores; Thtml solo con HTML del código."""
        import re
        with open(os.path.join(RAIZ, "ui", "app.js"), encoding="utf-8") as f:
            js = f.read()
        if not shutil.which("node"):
            self.skipTest("falta node")
        self.assertIn("const { T, Thtml, tr, frase } = i18n;", js, "app.js usa T/Thtml/tr/frase de la pieza, no unas propias")
        self.assertNotRegex(js, r"function (T|Thtml|tr)\(", "nada de T/Thtml/tr propios: son los de ui/i18n.js")
        with open(os.path.join(RAIZ, "ui", "index.html"), encoding="utf-8") as f:
            html = f.read()
        self.assertLess(html.index('<script src="i18n.js">'), html.index('<script src="app.js">'), "i18n.js se carga antes que app.js")
        prueba = ("const { T, Thtml } = require(process.argv[1]).crear({ documento: {} });"
                  "console.log(T('¡Hola, {n}! **{x}**', { n: '<img src=x onerror=alert(1)>', x: 'a&b' }));"
                  "console.log(Thtml('¡Hola, {n}!', { n: '<span>Ana</span>' }));")
        r = subprocess.run(["node", "-e", prueba, os.path.join(RAIZ, "ui", "i18n.js")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout.strip().splitlines(), ["¡Hola, &lt;img src=x onerror=alert(1)&gt;! <b>a&amp;b</b>", "¡Hola, <span>Ana</span>!"])
        self.assertNotRegex(js, r"esc\((T|frase)\(", "T ya escapa: no escapar dos veces")
        for m in re.finditer(r"Thtml\(", js):
            linea = js[js.rindex("\n", 0, m.start()) + 1:m.start()]
            if linea.lstrip().startswith("//") or js[m.start() - 2:m.start()] == "{ ":
                continue  # comentarios y la línea que la toma de la pieza
            self.assertIn("esc(", js[m.end():js.index(")", js.index("}", m.end()))], "Thtml solo con lo de la persona pasado por esc()")

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
