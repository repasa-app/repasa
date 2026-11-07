"""Contrato del puente interfaz ↔ apps: que ninguna plataforma se quede atrás. Solo biblioteca estándar.

Uso: python3 pruebas/contrato.py
Revisa:
1. Cada acción que manda la interfaz (host.enviar en ui/app.js y lo que mandan las piezas de la interfaz: ui/componentes.js) existe en el anfitrión del celular (movil/host/host.js), en la vista
   previa (simular() en ui/app.js) y en la app de escritorio (pieza «host-tauri»: registrada en escritorio/src, del host o
   declarada en acciones.json).
2. Cada función de la interfaz que llaman el anfitrión del celular y la app de escritorio (window.Repasa.<funcion>, también lo
   que responden las acciones declaradas y lo que pide con h.pedir) existe en ui/app.js, cada script de bin/ que llama la app de
   escritorio existe y acciones.json está al día con app.json → «acciones».
3. Cada método nativo que llama el anfitrión (llamar("Plugin", "metodo")) existe en el plugin de iOS (Swift) y de Android (Kotlin o
   Java), y en el Capacitor falso de las pruebas (pruebas/capacitor_falso.js), para que lo probado sea lo que existe.
4. Seguridad de las apps nativas (es para niños): Capacitor sin servidor remoto ni http en claro ni navegación a otros sitios;
   Android sin respaldo automático a la nube, sin tráfico en claro y sin componentes exportados de más; iOS sin excepciones de ATS;
   escritorio con el puente solo para la interfaz local, la ventana sin navegar fuera de ui/, enlaces solo de Repasa y descargas
   solo de los Releases de Repasa.
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
# Escritorio (pieza «host-tauri», Rust): lo que registra Repasa (escritorio/src fuera de pieza/), lo que trae el host (sus
# internas en escritorio/src/pieza/host.rs: listo, config, abrirEnlace, copiar, respuestaPagina y, con la pieza «actualizaciones»,
# buscarActualizacion y actualizar) y lo declarado (acciones.json, lo arma pieza.py).
def sin_comentarios(texto):
    return re.sub(r"^\s*(//|///|//!|\*).*$", "", texto, flags=re.M)


def bloque(texto, inicio):
    """El cuerpo entre llaves que empieza en `inicio` ("" si no está)."""
    i = texto.find(inicio)
    if i < 0:
        return ""
    j = texto.index("{", i)
    n = 0
    for k in range(j, len(texto)):
        n += {"{": 1, "}": -1}.get(texto[k], 0)
        if n == 0:
            return texto[j:k + 1]
    return ""


RUST = {os.path.relpath(f, RAIZ): open(f, encoding="utf-8").read() for f in glob.glob(os.path.join(RAIZ, "escritorio", "src", "*.rs"))}
TODO_RUST = sin_comentarios("\n".join(RUST.values()))
HOST_RS = leer("escritorio", "src", "pieza", "host.rs")
PROCESADOR_RS = leer("escritorio", "src", "pieza", "procesador.rs")
ACT_RS = leer("escritorio", "src", "pieza", "actualizaciones.rs")
APP_JSON = json.loads(leer("app.json"))
DECLARADAS = json.loads(leer("acciones.json"))["acciones"]
registradas_mac = set(re.findall(r'\.registrar\("(\w+)"', TODO_RUST))
del_host_mac = set(re.findall(r'^\s*"(\w+)"(?:\s+if\s[^=]*)?\s*=>', bloque(sin_comentarios(HOST_RS), "fn interna("), re.M))
if not re.search(r"^\s*actualizaciones:\s", TODO_RUST, re.M):
    del_host_mac -= {"buscarActualizacion", "actualizar"}  # el host las atiende solo si recibe la pieza «actualizaciones»
for a in sorted(acciones - registradas_mac - del_host_mac - set(DECLARADAS)):
    problemas.append(f"La acción «{a}» no está en la app de escritorio (ni registrada en escritorio/src, ni del host, ni declarada).")
for n, d in (APP_JSON.get("acciones") or {}).items():
    if {k: v for k, v in d.items() if k != "scriptDeLaApp"} != {k: v for k, v in DECLARADAS.get(n, {}).items() if k != "pieza"}:
        problemas.append(f"acciones.json no está al día con app.json en «{n}»: python3 <pieza>/herramientas/pieza.py acciones .")
for n, d in DECLARADAS.items():
    if not os.path.exists(os.path.join(RAIZ, "bin", d.get("script", ""))):
        problemas.append(f"La acción declarada «{n}» usa bin/{d.get('script')}, que no existe.")
    if n not in acciones:
        problemas.append(f"La acción declarada «{n}» no la manda la interfaz (sácala o ponla en «sin_acciones» de app.json).")
    if n in registradas_mac:
        problemas.append(f"«{n}» está declarada y también registrada en Rust: la registrada gana y la declarada sobra.")
for n in ("guardarPerfil", "guardarProgreso", "guardarPruebas", "agregarDelCatalogo"):
    if (DECLARADAS.get(n) or {}).get("cola") != "escritura":
        problemas.append(f"acciones.json: «{n}» va en la fila (\"cola\": \"escritura\"): un estado nunca se lee a medio guardar.")
for a in sorted(set(SOLO_ESCRITORIO) - acciones):
    problemas.append(f"SOLO_ESCRITORIO tiene «{a}», que la interfaz ya no manda (sácala del contrato).")
# 2) Funciones de la interfaz que llama el celular
interfaz = APP[APP.index("host.responder({"):APP.index("// ───────────── Vista previa")]
en_interfaz = set(re.findall(r"^    (?:async )?(\w+)(?:\(|: \()", interfaz, re.M))
# Lo que la app de escritorio le pide a la página y espera (h.pedir ↔ host.atender, pieza «host-ui»).
atendidas = set(re.findall(r'host\.atender\("(\w+)"', APP))
for f in sorted(set(re.findall(r"A\(\)\.(\w+)", HOST)) - en_interfaz):
    problemas.append(f"movil/host/host.js llama window.Repasa.{f}, que no existe en ui/app.js.")
llamadas_mac = set(re.findall(r'(?:llamar|responder)\((?:h, )?"(\w+)"', TODO_RUST)) | set(re.findall(r'llamar\("(\w+)"', sin_comentarios(HOST_RS)))
llamadas_mac |= {d["responde"] for d in DECLARADAS.values() if d.get("responde")}
if "copiar" not in acciones:
    llamadas_mac.discard("copiado")  # la respuesta de «copiar» (del host), que la interfaz de Repasa no usa
for f in sorted(llamadas_mac - en_interfaz - {"soltados", "archivoCambiado"}):  # del host, solo si la app vigila o deja soltar
    problemas.append(f"La app de escritorio llama window.Repasa.{f}, que no existe en ui/app.js.")
for f in sorted(set(re.findall(r'\.pedir\("(\w+)"', TODO_RUST)) - atendidas):
    problemas.append(f"La app de escritorio le pide «{f}» a la página, pero ui/app.js no lo atiende (host.atender).")
for script in sorted(set(re.findall(r'(?:correr_json|con_entrada)\("(\w+\.py)"', TODO_RUST))):
    if not os.path.exists(os.path.join(RAIZ, "bin", script)):
        problemas.append(f"La app de escritorio llama bin/{script}, que no existe.")

# Probar la IA es `probarIA {ia}` → `iaProbada {ia, …}` en todas las apps (pieza «host-ui»); antes Repasa mandaba {id}. En el escritorio la
# declara la pieza «ia»: la IA va en el archivo de entrada, nunca como argumento.
probar = DECLARADAS.get("probarIA") or {}
if (probar.get("script"), probar.get("args"), probar.get("entrada"), probar.get("responde"), list((probar.get("datos") or {}))) != \
        ("ia.py", ["probar"], "archivo", "iaProbada", ["ia"]) or "probarIA" in registradas_mac:
    problemas.append("acciones.json: probarIA es la de la pieza «ia» (ia.py probar con {ia} en un archivo de entrada → iaProbada).")
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

# Escritorio: lo que ya está endurecido no se pierde sin que alguien lo note (la ventana y el puente los trae «host-tauri»).
for donde, codigo, textos, por_que in [
    ("pieza/host.rs", HOST_RS, ['starts_with(&format!("{}ui/", host.base))', "if !propia || !en_ui", "NewWindowResponse::Deny"],
     "el puente solo para la interfaz de ui/ y la ventana sin navegar fuera ni abrir otras"),
    ("pieza/procesador.rs", PROCESADOR_RS, ["c.env_clear();", "starts_with(&self.prefijo)", '.env("PYTHONDONTWRITEBYTECODE", "1")', "fn matar("],
     "los scripts sin variables REPASA_* de afuera, con límite de tiempo y sin __pycache__ dentro de la app"),
    ("material.rs", RUST.get(os.path.join("escritorio", "src", "material.rs"), ""), ["elegidos_de(&d[\"archivos\"])", 'registrar_medios("material"'],
     "crear y guardar un tema solo con archivos que eligió la persona; el material por <base>material/"),
    ("copia.rs", RUST.get(os.path.join("escritorio", "src", "copia.rs"), ""), ["filter(|r| permitida(r))", 'h.pedir("escritorioArmar"', 'h.pedir("escritorioTraer"',
                                                                         "privado: Some(true)"], "lo que trae una copia solo escribe rutas permitidas y la copia queda 0600"),
    ("main.rs", RUST.get(os.path.join("escritorio", "src", "main.rs"), ""), ['host.registrar("abrirEnlace"', "if enlace_nuestro(u)", "estado_en_fila: true",
                                                                         '"Para adultos…"', 'Actualizaciones::nuevas("repasa-app/repasa", "Repasa")'],
     "enlaces solo de Repasa (también los tocados), el estado en la fila, «Para adultos…» y las actualizaciones solo del repo de Repasa"),
    ("pieza/actualizaciones.rs", ACT_RS, ['x.path().starts_with(&format!("/{repo}/releases/download/"))', "Sha256::new()"],
     "descargas solo de los Releases, con su huella"),
]:
    for texto in textos:
        if texto not in codigo:
            problemas.append(f"escritorio/src/{donde}: falta «{texto}» ({por_que}).")
if re.search(r"WebviewWindowBuilder|invoke_handler|generate_handler", TODO_RUST):
    problemas.append("escritorio/src: la ventana y el puente los pone la pieza «host-tauri» (Repasa no arma otros).")
TAURI = json.loads(leer("escritorio", "tauri.conf.json"))
recursos = (TAURI.get("bundle") or {}).get("resources") or {}
for r in ("app.json", "acciones.json"):
    if recursos.get("../" + r) != "recursos/" + r:
        problemas.append(f"escritorio/tauri.conf.json: {r} va en los recursos de la app (recursos/{r}), lo lee «host-tauri».")
if (TAURI.get("app") or {}).get("withGlobalTauri") is not False:
    problemas.append("escritorio/tauri.conf.json: withGlobalTauri: false (la página no ve la API de Tauri).")
# La IA solo la corre bin/ia.py (pieza «ia»): ningún Rust arma el comando de un CLI de IA por su cuenta.
for archivo, codigo in RUST.items():
    if re.search(r'"--disallowedTools"|"--skip-git-repo-check"|"--strict-mcp-config"', codigo):
        problemas.append(f"{archivo}: arma el comando de una IA; eso lo hace solo bin/ia.py (pieza «ia»).")
# Es para niños: la interfaz no tiene enlaces que se toquen. Desde host-mac 0.3.0 un https tocado en la ventana pasa por el
# abrirEnlace de Repasa (que solo abre los de Repasa); esto queda como defensa extra (y el celular no tiene esa guarda).
for nombre in ["index.html"] + sorted(f for f in os.listdir(os.path.join(RAIZ, "ui")) if f.endswith(".js") and f != "componentes.js"):
    texto = leer("ui", nombre)
    if re.search(r"<a\s[^>]*href|\bhref\s*:", texto):
        problemas.append(f"ui/{nombre}: un enlace <a href> (en Repasa los enlaces van por host.enviar(\"abrirEnlace\"), que solo abre los de Repasa).")
if TAURI.get("identifier") != "app.repasa.mac" or 'identifier "app.repasa.mac"' not in leer("herramientas", "empaquetar.sh"):
    problemas.append("El identificador de la app (app.repasa.mac) no coincide entre tauri.conf.json y la firma de empaquetar.sh.")
if "NSAppTransportSecurity" in leer("escritorio", "Info.plist"):
    problemas.append("escritorio/Info.plist: sin excepciones de App Transport Security.")

if problemas:
    print("✗ Contrato:\n  " + "\n  ".join(problemas))
    sys.exit(1)
print(f"✓ Contrato: {len(acciones)} acciones de la interfaz, {len(llamadas)} métodos nativos, celular, escritorio y vista previa al día")
