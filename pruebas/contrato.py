"""Contrato del puente interfaz ↔ apps: que ninguna plataforma se quede atrás. Solo biblioteca estándar.

Uso: python3 pruebas/contrato.py
Revisa:
1. Cada acción que manda la interfaz (host.enviar en ui/app.js) existe en el anfitrión del celular (movil/host/host.js), en la vista
   previa (simular() en ui/app.js) y, cuando existan, en la app de Mac (app/**/Ventana.swift) y en la de Windows/Linux (escritorio/).
2. Cada función de la interfaz que llama el anfitrión del celular (window.Repasa.<funcion>) existe en ui/app.js.
3. Cada método nativo que llama el anfitrión (llamar("Plugin", "metodo")) existe en el plugin de iOS (Swift) y de Android (Kotlin o
   Java), y en el Capacitor falso de las pruebas (pruebas/capacitor_falso.js), para que lo probado sea lo que existe.
"""
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer(*partes):
    with open(os.path.join(RAIZ, *partes), encoding="utf-8") as f:
        return f.read()


APP = leer("ui", "app.js")
HOST = leer("movil", "host", "host.js")
FALSO = leer("pruebas", "capacitor_falso.js")
problemas = []

# Acciones nuevas del celular que las apps de escritorio todavía no tienen (se agregan cuando cada app las implemente).
SOLO_MOVIL = {"guardarCopia": "copia cifrada (celular, fase 1)", "traerCopia": "copia cifrada (celular, fase 1)",
              "temaAMano": "en escritorio: crear_tema.py amano", "agregarDelCatalogo": "en escritorio: crear_tema.py guardar temas/<id>.json"}

# 1) Acciones
acciones = set(re.findall(r'host\.enviar\("(\w+)"', APP))
simular = APP[APP.index("function simular("):]
simular = simular[:simular.index("\n  }\n")]
en_simular = set(re.findall(r'case "(\w+)"', simular))
en_host = set(re.findall(r"^  (?:async )?(\w+)(?:\(|: |,$)", HOST[HOST.index("const ACCIONES = {"):HOST.index("\n};", HOST.index("const ACCIONES = {"))], re.M))
for a in sorted(acciones - en_host):
    problemas.append(f"La acción «{a}» no está en movil/host/host.js (ACCIONES).")
for a in sorted(acciones - en_simular):
    problemas.append(f"La acción «{a}» no está simulada en simular() (ui/app.js).")
for nombre, patron in (("Mac (Ventana.swift)", "app/**/Ventana.swift"), ("Windows/Linux (escritorio/)", "escritorio/src/**/*.js")):
    archivos = glob.glob(os.path.join(RAIZ, patron), recursive=True)
    if not archivos:
        continue  # esa app todavía no existe en el repo
    codigo = "\n".join(open(f, encoding="utf-8").read() for f in archivos)
    for a in sorted(acciones - set(SOLO_MOVIL)):
        if not re.search(rf'["\']{a}["\']|\b{a}\s*[:(]', codigo):
            problemas.append(f"La acción «{a}» no está en la app de {nombre}.")

# 2) Funciones de la interfaz que llama el celular
interfaz = APP[APP.index("window.Repasa = {"):APP.index("// ───────────── Vista previa")]
en_interfaz = set(re.findall(r"^    (?:async )?(\w+)\(", interfaz, re.M))
for f in sorted(set(re.findall(r"A\(\)\.(\w+)", HOST)) - en_interfaz):
    problemas.append(f"movil/host/host.js llama window.Repasa.{f}, que no existe en ui/app.js.")

# 3) Métodos nativos
PLUGINS = {
    "IaLocal": ("movil/plugins/ia-local/ios/**/*.swift", "movil/plugins/ia-local/android/**/*.kt"),
    "Carpeta": ("movil/plugins/carpeta/ios/**/*.swift", "movil/plugins/carpeta/android/**/*.kt"),
    "Filesystem": ("movil/node_modules/@capacitor/filesystem/ios/**/*.swift", "movil/node_modules/@capacitor/filesystem/android/**/*.*"),
    "Camera": ("movil/node_modules/@capacitor/camera/ios/**/*.swift", "movil/node_modules/@capacitor/camera/android/**/*.java"),
}
llamadas = set(re.findall(r'llamar\("(\w+)", "(\w+)"', HOST))
falso = FALSO[FALSO.index("const P = {"):]
for plugin, metodo in sorted(llamadas):
    if plugin not in PLUGINS:
        problemas.append(f"movil/host/host.js usa el plugin «{plugin}», que el contrato no conoce.")
        continue
    for plataforma, patron in zip(("iOS", "Android"), PLUGINS[plugin]):
        archivos = glob.glob(os.path.join(RAIZ, patron), recursive=True)
        if not archivos:
            if "node_modules" in patron:
                continue  # plugins oficiales: se revisan solo si están instalados (npm ci en movil/)
            problemas.append(f"No encuentro el plugin {plugin} de {plataforma} ({patron}).")
            continue
        codigo = "\n".join(open(f, encoding="utf-8", errors="ignore").read() for f in archivos)
        if plataforma == "iOS":
            ok = re.search(rf'CAPPluginMethod\(name: "{metodo}"', codigo) and re.search(rf"func {metodo}\(_ call: CAPPluginCall\)", codigo)
        else:
            ok = re.search(rf"@PluginMethod[^\n]*\n\s*(?:public )?(?:fun|void) {metodo}\(", codigo)
        if not ok:
            problemas.append(f"{plugin}.{metodo} no existe en el plugin de {plataforma}.")
    if not re.search(rf"\b{metodo}\b", falso[falso.index(f"{plugin}: {{"):]):
        problemas.append(f"{plugin}.{metodo} no está en pruebas/capacitor_falso.js.")

if problemas:
    print("✗ Contrato:\n  " + "\n  ".join(problemas))
    sys.exit(1)
print(f"✓ Contrato: {len(acciones)} acciones de la interfaz, {len(llamadas)} métodos nativos, celular y vista previa al día")
