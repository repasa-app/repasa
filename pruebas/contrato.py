"""Contrato del puente interfaz ↔ apps: que ninguna plataforma se quede atrás. Solo biblioteca estándar.

Uso: python3 pruebas/contrato.py
Revisa:
1. Cada acción que manda la interfaz (host.enviar en ui/app.js y lo que mandan las piezas de la interfaz: ui/componentes.js) existe en el anfitrión del celular (movil/host/host.js), en la vista
   previa (simular() en ui/app.js), en la app de Mac (app/Sources/Repasa/Ventana.swift) y, cuando exista, en la de Windows/Linux
   (escritorio/).
2. Cada función de la interfaz que llaman el anfitrión del celular y la app de Mac (window.Repasa.<funcion>) existe en ui/app.js, y
   cada script de bin/ que llama la app de Mac existe.
3. Cada método nativo que llama el anfitrión (llamar("Plugin", "metodo")) existe en el plugin de iOS (Swift) y de Android (Kotlin o
   Java), y en el Capacitor falso de las pruebas (pruebas/capacitor_falso.js), para que lo probado sea lo que existe.
4. Seguridad de las apps nativas (es para niños): Capacitor sin servidor remoto ni http en claro ni navegación a otros sitios;
   Android sin respaldo automático a la nube, sin tráfico en claro y sin componentes exportados de más; iOS sin excepciones de ATS;
   Mac con el puente solo para la interfaz local, la ventana sin navegar fuera de ui/ y descargas solo de los Releases de Repasa.
"""
import json
import glob
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def leer(*partes):
    with open(os.path.join(RAIZ, *partes), encoding="utf-8") as f:
        return f.read()


APP = leer("ui", "app.js")
# Las piezas de la interfaz (de Pieza) también mandan acciones: probarIA, buscarActualizacion, actualizar, abrirEnlace y config.
PIEZAS_UI = leer("ui", "componentes.js") + leer("ui", "tema.js")
PUENTE = leer("ui", "host.js")
HOST = leer("movil", "host", "host.js")
FALSO = leer("pruebas", "capacitor_falso.js")
problemas = []

# Acciones que la app de Windows/Linux todavía no tiene (se agregan cuando exista). La de Mac las tiene todas.
SOLO_MOVIL = {"guardarCopia": "copia cifrada (celular, fase 1)", "traerCopia": "copia cifrada (celular, fase 1)",
              "temaAMano": "en escritorio: crear_tema.py amano", "agregarDelCatalogo": "en escritorio: crear_tema.py guardar temas/<id>.json"}

# 1) Acciones
acciones = set(re.findall(r'host\.enviar\("(\w+)"', APP)) | set(re.findall(r'\benviar\("(\w+)"', PIEZAS_UI))
simular = APP[APP.index("function simular("):]
simular = simular[:simular.index("\n  }\n")]
en_simular = set(re.findall(r'case "(\w+)"', simular))
# Lo que no está en el switch lo responde PiezaHost.simulacionesComunes() (pieza «host-ui»), si simular() lo usa.
if "COMUNES[accion]" in simular:
    comunes = PUENTE[PUENTE.index("function simulacionesComunes("):PUENTE.index("function crearHost(")]
    en_simular |= set(re.findall(r"^      (\w+): \(d, c\)", comunes, re.M))
# Acciones solo del computador: arrastrar fotos o PDF e instalar una versión nueva (el teléfono no tiene ninguna de las dos).
SOLO_ESCRITORIO = {"soltarMaterial": "arrastrar material a «Nuevo tema»", "actualizar": "instalar una versión nueva"}
en_host = set(re.findall(r"^  (?:async )?(\w+)(?:\(|: |,$)", HOST[HOST.index("const ACCIONES = {"):HOST.index("\n};", HOST.index("const ACCIONES = {"))], re.M))
for a in sorted(acciones - en_host - set(SOLO_ESCRITORIO)):
    problemas.append(f"La acción «{a}» no está en movil/host/host.js (ACCIONES).")
for a in sorted(acciones - en_simular):
    problemas.append(f"La acción «{a}» no está simulada en simular() (ui/app.js).")
MAC = leer("app", "Sources", "Repasa", "Ventana.swift")
casos_mac = set(re.findall(r'"(\w+)"', " ".join(re.findall(r"case ([^:\n]+):", MAC))))
for a in sorted(acciones - casos_mac):
    problemas.append(f"La acción «{a}» no está en la app de Mac (un case en Ventana.swift).")
for a in sorted(set(SOLO_ESCRITORIO) - acciones):
    problemas.append(f"SOLO_ESCRITORIO tiene «{a}», que la interfaz ya no manda (sácala del contrato).")
for patron in ["escritorio/src/**/*.js"]:
    archivos = glob.glob(os.path.join(RAIZ, patron), recursive=True)
    if not archivos:
        continue  # la app de Windows/Linux todavía no existe en el repo
    codigo = "\n".join(open(f, encoding="utf-8").read() for f in archivos)
    for a in sorted(acciones - set(SOLO_MOVIL)):
        if not re.search(rf'["\']{a}["\']|\b{a}\s*[:(]', codigo):
            problemas.append(f"La acción «{a}» no está en la app de Windows/Linux (escritorio/).")

# 2) Funciones de la interfaz que llama el celular
interfaz = APP[APP.index("host.responder({"):APP.index("// ───────────── Vista previa")]
en_interfaz = set(re.findall(r"^    (?:async )?(\w+)(?:\(|: \()", interfaz, re.M))
for f in sorted(set(re.findall(r"A\(\)\.(\w+)", HOST)) - en_interfaz):
    problemas.append(f"movil/host/host.js llama window.Repasa.{f}, que no existe en ui/app.js.")
SWIFT = {os.path.basename(f): open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(RAIZ, "app", "Sources", "Repasa", "*.swift"))}
TODO_SWIFT = "\n".join(SWIFT.values())
for f in sorted(set(re.findall(r'llamar\("(\w+)"', TODO_SWIFT)) - en_interfaz):
    problemas.append(f"La app de Mac llama window.Repasa.{f}, que no existe en ui/app.js.")
for script in sorted(set(re.findall(r'(?:correrJSON|conEntrada|guardarEnFila)\("(\w+\.py)"', TODO_SWIFT))):
    if not os.path.exists(os.path.join(RAIZ, "bin", script)):
        problemas.append(f"La app de Mac llama bin/{script}, que no existe.")

# Probar la IA es `probarIA {ia}` → `iaProbada {ia, …}` en todas las apps (pieza «host-ui»); antes Repasa mandaba {id}.
caso_probar = MAC[MAC.index('case "probarIA":'):MAC.index("case ", MAC.index('case "probarIA":') + 10)]
if 'd["ia"]' not in caso_probar or '"id":' in caso_probar:
    problemas.append("Ventana.swift: probarIA lee d[\"ia\"] y responde iaProbada con «ia» (no «id»).")
host_probar = HOST[HOST.index("async probarIA(d)"):HOST.index("abrirEnlace(d)")]
if "d.id" in host_probar or "{ id:" in host_probar:
    problemas.append("movil/host/host.js: probarIA lee d.ia y responde iaProbada con «ia» (no «id»).")
if re.search(r'enviar\("probarIA", \{ id', APP + PIEZAS_UI):
    problemas.append("La interfaz manda probarIA {id}: va {ia}.")

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

# 4) Seguridad de las apps nativas
CAP = json.loads(leer("movil", "capacitor.config.json"))
servidor = CAP.get("server") or {}
for clave in ("url", "cleartext", "allowNavigation", "hostname"):
    if clave in servidor:
        problemas.append(f"capacitor.config.json: server.{clave} no va (la app sirve sus archivos desde el teléfono, sin red).")
if servidor.get("androidScheme", "https") != "https" or servidor.get("iosScheme", "capacitor") not in ("capacitor", "ionic"):
    problemas.append("capacitor.config.json: el esquema de la app cambió (eso además borra los datos guardados por el WebView).")
if (CAP.get("android") or {}).get("allowMixedContent") or (CAP.get("android") or {}).get("webContentsDebuggingEnabled"):
    problemas.append("capacitor.config.json: android.allowMixedContent y webContentsDebuggingEnabled no van.")
MANIFIESTO = leer("movil", "android", "app", "src", "main", "AndroidManifest.xml")
for atributo in ('android:allowBackup="false"', 'android:fullBackupContent="false"', 'android:usesCleartextTraffic="false"'):
    if atributo not in MANIFIESTO:
        problemas.append(f"AndroidManifest.xml: falta {atributo} (datos de niños: sin respaldo a la nube sin cifrar ni http).")
exportados = re.findall(r'<(activity|service|receiver|provider)\b[^>]*android:name="([^"]+)"[^>]*android:exported="true"', MANIFIESTO)
if [n for _, n in exportados if n != ".MainActivity"]:
    problemas.append(f"AndroidManifest.xml: componentes exportados de más: {exportados}.")
permisos = set(re.findall(r'<uses-permission android:name="([^"]+)"', MANIFIESTO))
for f in glob.glob(os.path.join(RAIZ, "movil", "plugins", "*", "android", "src", "main", "AndroidManifest.xml")):
    permisos |= set(re.findall(r'<uses-permission android:name="([^"]+)"', open(f, encoding="utf-8").read()))
if permisos - {"android.permission.INTERNET"}:
    problemas.append(f"Permisos de Android nuevos (revisar con cuidado antes de agregarlos): {sorted(permisos)}.")
if "NSAppTransportSecurity" in leer("movil", "ios", "App", "App", "Info.plist"):
    problemas.append("Info.plist: sin excepciones de App Transport Security (NSAppTransportSecurity).")

# Mac: lo que ya está endurecido no se pierde sin que alguien lo note.
for archivo, texto, por_que in [
    ("Ventana.swift", "frameInfo.isMainFrame, mensaje.frameInfo.securityOrigin.protocol == \"file\"", "el puente solo para la interfaz local"),
    ("Ventana.swift", "decidePolicyFor", "la ventana no navega fuera de ui/"),
    ("Ventana.swift", "hasPrefix(carpetaUI)", "la ventana no navega fuera de ui/"),
    ("Ventana.swift", "elegidos.contains", "crear y guardar un tema solo con archivos que eligió la persona"),
    ("Ventana.swift", "Rutas.permitidaEnCopia(ruta)", "lo que trae una copia solo escribe rutas permitidas"),
    ("Actualizaciones.swift", "esDescargaNuestra(zip), esDescargaNuestra(huella)", "descargas solo de los Releases de Repasa"),
    ("Actualizaciones.swift", "shasum -a 256", "la versión nueva se verifica con su huella"),
    ("Ventana.swift", "Procesador.conEntrada(\"ia.py\", [\"probar\"], [\"ia\": id])",
     "la prueba de la IA va por bin/ia.py (pieza «ia»), con la IA en un archivo de entrada"),
]:
    if texto not in SWIFT.get(archivo, ""):
        problemas.append(f"app/Sources/Repasa/{archivo}: falta «{texto}» ({por_que}).")
# La IA solo la corre bin/ia.py (pieza «ia»): ningún Swift arma el comando de un CLI de IA por su cuenta.
for archivo, codigo in SWIFT.items():
    if re.search(r'"--disallowedTools"|"--skip-git-repo-check"|"--strict-mcp-config"', codigo):
        problemas.append(f"app/Sources/Repasa/{archivo}: arma el comando de una IA; eso lo hace solo bin/ia.py (pieza «ia»).")
for linea in re.findall(r'"""(.*?)"""', SWIFT.get("Actualizaciones.swift", ""), re.S):
    for interpolado in re.findall(r"\\\(([^)]*(?:\([^)]*\))?[^)]*)\)", linea):
        if not interpolado.startswith("comillas(") and interpolado != "pid":
            problemas.append(f"Actualizaciones.swift: «\\({interpolado})» va en el guion sin comillas().")
PLIST = leer("app", "Info.plist")
if "<string>app.repasa.mac</string>" not in PLIST or 'identifier "app.repasa.mac"' not in leer("herramientas", "empaquetar.sh"):
    problemas.append("El identificador de la app de Mac (app.repasa.mac) no coincide entre Info.plist y la firma de empaquetar.sh.")
if "NSAppTransportSecurity" in PLIST:
    problemas.append("app/Info.plist: sin excepciones de App Transport Security.")

if problemas:
    print("✗ Contrato:\n  " + "\n  ".join(problemas))
    sys.exit(1)
print(f"✓ Contrato: {len(acciones)} acciones de la interfaz, {len(llamadas)} métodos nativos, celular, Mac y vista previa al día")
