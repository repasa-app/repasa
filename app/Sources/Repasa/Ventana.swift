import AppKit
import UniformTypeIdentifiers
import WebKit

/// Ventana principal: la interfaz web (ui/) dentro de un WKWebView. La interfaz llama `host.enviar(accion, datos)` y la app
/// responde con `window.Repasa.<funcion>(json)`. El contrato lo revisa pruebas/contrato.py.
@MainActor
final class Ventana: NSObject, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    static let shared = Ventana()
    private var ventana: NSWindow?
    private var web: WKWebView?
    private let material = EsquemaMaterial()
    private var lista = false
    /// Archivos que la persona eligió (panel o arrastrar) en esta sesión: crear y guardar un tema solo aceptan estos, nunca una
    /// ruta cualquiera que llegue desde la página.
    private var elegidos = Set<String>()
    /// Temas armándose con la IA: mientras haya uno, no se actualiza la app (cerrarla lo cortaría).
    private var creando = 0
    private var soltados = 0

    static let extensiones = ["jpg", "jpeg", "png", "webp", "heic", "gif", "pdf"]
    static let maximoMaterial = 25 * 1024 * 1024
    static let maximoCopia = 300 * 1024 * 1024

    func mostrar() {
        if ventana == nil { crear() }
        ventana?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func crear() {
        let control = WKUserContentController()
        control.add(self, name: "repasa")
        control.addUserScript(WKUserScript(source: "window.REPASA_HOST = 'mac';", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        // La copia cifrada usa el mismo motor que el celular (ui/escritorio.js + ui/motor/, los copia empaquetar.sh).
        let cargarCopia = "(() => { const s = document.createElement('script'); s.type = 'module'; s.src = 'escritorio.js'; document.head.appendChild(s); })();"
        control.addUserScript(WKUserScript(source: cargarCopia, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let conf = WKWebViewConfiguration()
        conf.userContentController = control
        // Las fotos del material de cada tema: repasa://material/<tema>/<archivo> (solo lectura, solo esa carpeta).
        conf.setURLSchemeHandler(material, forURLScheme: "repasa")
        // La interfaz lee sus traducciones (ui/idiomas/*.json) y el motor (ui/motor/*.js) desde los mismos archivos locales.
        conf.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 800), configuration: conf)
        w.navigationDelegate = self
        let v = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        v.title = "Repasa"
        v.minSize = NSSize(width: 420, height: 560)
        v.contentView = w
        v.delegate = self
        v.isReleasedWhenClosed = false
        v.setFrameAutosaveName("Repasa")
        if !v.setFrameUsingName("Repasa") { v.center() }
        ventana = v
        web = w
        let ui = Rutas.recursos.appendingPathComponent("ui")
        w.loadFileURL(ui.appendingPathComponent("index.html"), allowingReadAccessTo: ui)
    }

    /// Menú → Para adultos (lo mismo que el botón de la interfaz), salvo en medio de la bienvenida.
    @objc func abrirAdultos() {
        mostrar()
        web?.evaluateJavaScript("window.Repasa && window.Repasa._probar(E => { if (E.bv === null) E.adultos = true })")
    }

    @objc func abrirCarpetaDatos() {
        Rutas.prepararCarpeta()
        NSWorkspace.shared.open(Rutas.base)
    }

    // MARK: Hacia la interfaz

    /// Con un diccionario (la mayoría de las respuestas): así los literales mezclados (`["ok": false, "error": …]`) tienen su tipo.
    func llamar(_ funcion: String, _ datos: [String: Any]) { llamar(funcion, datos as Any) }

    func llamar(_ funcion: String, _ datos: Any) {
        guard let web, let d = try? JSONSerialization.data(withJSONObject: datos), let json = String(data: d, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.Repasa && window.Repasa.\(funcion)(\(json))")
    }

    static func hoy() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }

    /// El estado completo: lo que hay en ~/Repasa (lo lee bin/estado.py, en la fila: nunca a medio guardar) más lo de la app.
    func enviarEstado() {
        guard lista else { return }
        Procesador.enFila { listo in
            Procesador.correrJSON("estado.py", []) { datos in
                listo()
                var e = datos
                e.removeValue(forKey: "ok"); e.removeValue(forKey: "error")
                e["hoy"] = Ventana.hoy()
                e["ias"] = IA.paraJS
                e["version"] = Actualizaciones.version
                e["carpeta"] = Rutas.base.path.replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~")
                e["actualizacion"] = Actualizaciones.disponible
                e["capacidades"] = ["copia": true, "camara": false]
                if e["config"] == nil { e["config"] = Config.leer() }
                Ventana.shared.llamar("estado", e)
            }
        }
    }

    // MARK: Navegación: la ventana solo muestra la interfaz que viene dentro de la app

    /// Carpeta ui/ dentro de la app (sin enlaces simbólicos), para comparar rutas.
    private var carpetaUI: String { Rutas.recursos.appendingPathComponent("ui").resolvingSymlinksInPath().path + "/" }

    /// Un enlace, una redirección o un archivo soltado nunca carga otra página dentro de la ventana (esa página tendría el puente
    /// con la app): solo se permiten los archivos de ui/. Un enlace https que la persona toca se abre en su navegador.
    func webView(_ webView: WKWebView, decidePolicyFor accion: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let u = accion.request.url else { return .cancel }
        if u.isFileURL, u.resolvingSymlinksInPath().path.hasPrefix(carpetaUI) { return .allow }
        if u.scheme == "https", accion.navigationType == .linkActivated, Ventana.enlaceNuestro(u) { NSWorkspace.shared.open(u) }
        return .cancel
    }

    /// Los únicos enlaces que abre la app: el sitio y el repositorio de Repasa (lo mismo que el anfitrión del celular).
    static func enlaceNuestro(_ u: URL) -> Bool {
        guard u.scheme == "https", u.user == nil, u.port == nil else { return false }
        return (u.host == "repasa-app.github.io" && u.path.hasPrefix("/repasa/")) || (u.host == "github.com" && u.path.hasPrefix("/repasa-app/"))
    }

    // MARK: Desde la interfaz

    func userContentController(_ c: WKUserContentController, didReceive mensaje: WKScriptMessage) {
        // Solo la interfaz local (el marco principal, un archivo de ui/: la navegación de arriba no deja cargar otra cosa) puede
        // pedirle cosas a la app; una página de internet o un iframe, nunca.
        guard mensaje.frameInfo.isMainFrame, mensaje.frameInfo.securityOrigin.protocol == "file" else { return }
        guard let m = mensaje.body as? [String: Any], let accion = m["accion"] as? String else { return }
        let d = m["datos"] as? [String: Any] ?? [:]
        switch accion {
        case "listo":
            lista = true
            enviarEstado()
        case "config":
            Config.guardar(d)
            if d["idioma_ui"] != nil { Menu.instalar() }
            // Primer uso: recién elegido el idioma, parte lo que esperaba (revisar actualizaciones).
            if Idioma.elegido { RepasaApp.iniciarTareas() }
        case "guardarProgreso":
            Procesador.guardarEnFila("guardar.py", ["progreso"], ["perfil": d["perfil"] as? String ?? "", "progreso": d["progreso"] as? [String: Any] ?? [:]])
        case "guardarPerfil":
            Procesador.guardarEnFila("guardar.py", ["perfil"], ["perfil": d["perfil"] as? [String: Any] ?? [:]])
        case "guardarPruebas":
            Procesador.guardarEnFila("guardar.py", ["pruebas"], ["pruebas": d["pruebas"] as? [Any] ?? []])
        case "elegirMaterial":
            elegirMaterial()
        case "soltarMaterial":
            soltarMaterial(nombre: d["nombre"] as? String ?? "", base64: d["base64"] as? String ?? "")
        case "crearTema":
            let ramo = String((d["ramo"] as? String ?? "auto").filter { $0.isASCII && $0.isLowercase }.prefix(20))
            let curso = String((d["curso"] as? String ?? "").filter { $0.isASCII && ($0.isLowercase || $0.isNumber) }.prefix(4))
            let pedido: [String: Any] = ["curso": curso, "ramo": ramo.isEmpty ? "auto" : ramo, "texto": String((d["texto"] as? String ?? "").prefix(20000)),
                                         "archivos": archivosElegidos(d["archivos"])]
            creando += 1
            Procesador.conEntrada("crear_tema.py", ["pedido"], pedido) { r in
                Ventana.shared.creando -= 1
                Ventana.shared.llamar("temaCreado", r)
            }
        case "temaAMano":
            var entrada: [String: Any] = ["idioma": Idioma.codigo]
            for k in ["titulo", "ramo", "curso", "resumen", "conceptos", "preguntas"] { entrada[k] = String((d[k] as? String ?? "").prefix(30000)) }
            Procesador.conEntrada("crear_tema.py", ["amano"], entrada) { Ventana.shared.llamar("temaCreado", $0) }
        case "agregarDelCatalogo":
            let id = d["id"] as? String ?? ""
            let archivo = Rutas.recursos.appendingPathComponent("temas/\(id).json")
            guard Rutas.cumple(id, "^[a-z0-9-]{2,60}$"), FileManager.default.fileExists(atPath: archivo.path) else {
                return llamar("temaGuardado", ["ok": false, "error": "No encontré ese tema."])
            }
            Procesador.enFila { listo in
                Procesador.correrJSON("crear_tema.py", ["guardar", archivo.path]) { r in
                    listo()
                    Ventana.shared.llamar("temaGuardado", r)
                }
            }
        case "guardarTema":
            guardarTema(d["tema"] as? [String: Any] ?? [:], archivos: archivosElegidos(d["archivos"]))
        case "explicar":
            let entrada: [String: Any] = ["tema": d["tema"] as? String ?? "", "pregunta": d["pregunta"] as? String ?? "",
                                          "respondio": String((d["respondio"] as? String ?? "").prefix(300))]
            Procesador.conEntrada("explicar.py", [], entrada) { Ventana.shared.llamar("explicado", $0) }
        case "probarIA":
            // Pieza «ia»: `ia.py probar <entrada {ia}> <salida>` prueba con las mismas protecciones que al crear un tema (sin
            // herramientas, sin MCP, sin la memoria de la persona, en una carpeta temporal). La IA nunca va como argumento.
            // probarIA {ia} → iaProbada {ia, ok, codigo?, plantilla?, valores?, texto?} (pieza «host-ui»: la misma forma en todas las apps).
            let id = d["ia"] as? String ?? ""
            guard IA.conocidas.contains(where: { $0.id == id }) else {
                llamar("iaProbada", ["ia": id, "ok": false, "texto": Idioma.t("No conozco esa IA.")])
                return
            }
            Procesador.conEntrada("ia.py", ["probar"], ["ia": id]) { r in
                let ok = r["ok"] as? Bool == true
                if ok { Config.guardar(["ia": id]) }
                var respuesta: [String: Any] = ["ia": id, "ok": ok]
                if !ok {
                    // La plantilla y sus valores los traduce la interfaz; `texto` queda por si no vienen.
                    for clave in ["codigo", "plantilla", "valores"] { if let v = r[clave] { respuesta[clave] = v } }
                    respuesta["texto"] = r["error"] as? String ?? Idioma.t("No respondió.")
                }
                Ventana.shared.llamar("iaProbada", respuesta)
            }
        case "abrirEnlace":
            if let u = URL(string: d["url"] as? String ?? ""), Ventana.enlaceNuestro(u) { NSWorkspace.shared.open(u) }
        case "abrirCarpeta":
            abrirCarpetaDatos()
        case "buscarActualizacion":
            Actualizaciones.revisar { hay, detalle in
                Ventana.shared.llamar("actualizacionRevisada", ["hay": hay, "detalle": detalle, "sinConexion": detalle == Actualizaciones.sinConexion])
            }
        case "actualizar":
            // Nunca mientras la IA arma un tema: cerrar la app lo cortaría.
            guard creando == 0 else {
                return llamar("actualizacionProgreso", ["paso": "error", "texto": "Espera a que termine de armar el tema y vuelve a intentarlo."])
            }
            Actualizaciones.seguir { Ventana.shared.llamar("actualizacionProgreso", $0) }
            Actualizaciones.instalar { ok, error in
                if !ok { Ventana.shared.llamar("actualizacionProgreso", ["paso": "error", "texto": error]) }
            }
        case "guardarCopia":
            guardarCopia(frase: d["frase"] as? String ?? "")
        case "traerCopia":
            traerCopia(frase: d["frase"] as? String ?? "")
        default:
            break
        }
    }

    // MARK: Material del tema (fotos o PDF)

    private func elegirMaterial() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = Ventana.extensiones.compactMap { UTType(filenameExtension: $0) }
        panel.message = Idioma.t("Elige las fotos del cuaderno o la guía, o un PDF")
        guard let v = ventana else { return }
        panel.beginSheetModal(for: v) { r in
            guard r == .OK else { return }
            let urls = panel.urls
            Task { @MainActor in
                let lista: [[String: Any]] = urls.prefix(20).compactMap { u -> [String: Any]? in
                    guard Ventana.extensiones.contains(u.pathExtension.lowercased()), Archivos.tamano(u) <= Ventana.maximoMaterial else { return nil }
                    Ventana.shared.elegidos.insert(u.path)
                    return ["ruta": u.path, "nombre": u.lastPathComponent]
                }
                Ventana.shared.llamar("materialElegido", lista as Any)
            }
        }
    }

    /// Una foto o PDF arrastrado a «Nuevo tema»: la interfaz manda el contenido (no hay ruta) y queda en .repasa/temporal/.
    private func soltarMaterial(nombre: String, base64: String) {
        let ext = (nombre as NSString).pathExtension.lowercased()
        guard Ventana.extensiones.contains(ext), base64.count <= Ventana.maximoMaterial / 3 * 4 + 4,
              let datos = Data(base64Encoded: base64), !datos.isEmpty, datos.count <= Ventana.maximoMaterial else { return }
        soltados += 1
        let destino = Rutas.temporal.appendingPathComponent("soltado-\(soltados)-\(UUID().uuidString.prefix(8)).\(ext)")
        guard Archivos.escribir(destino, datos) else { return }
        elegidos.insert(destino.path)
        let visible = String((nombre as NSString).lastPathComponent.prefix(80))
        let elegido: [[String: Any]] = [["ruta": destino.path, "nombre": visible]]
        llamar("materialElegido", elegido as Any)
    }

    /// Solo rutas que la persona eligió en esta sesión y que siguen ahí.
    private func archivosElegidos(_ valor: Any?) -> [String] {
        ((valor as? [Any]) ?? []).compactMap { $0 as? String }.filter { elegidos.contains($0) && FileManager.default.isReadableFile(atPath: $0) }
    }

    private func guardarTema(_ tema: [String: Any], archivos: [String]) {
        let entrada = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-tema-\(UUID().uuidString).json")
        guard let d = try? JSONSerialization.data(withJSONObject: tema), Archivos.escribir(entrada, d) else {
            return llamar("temaGuardado", ["ok": false, "error": Idioma.t("No pude terminar. Intenta de nuevo.")])
        }
        Procesador.enFila { listo in
            Procesador.correrJSON("crear_tema.py", ["guardar", entrada.path] + archivos) { r in
                listo()
                try? FileManager.default.removeItem(at: entrada)
                if r["ok"] as? Bool == true {
                    // Lo arrastrado ya quedó copiado en la carpeta del tema.
                    for a in archivos where a.hasPrefix(Rutas.temporal.path + "/") { try? FileManager.default.removeItem(atPath: a) }
                }
                Ventana.shared.llamar("temaGuardado", r)
            }
        }
    }

    // MARK: Copia cifrada (el cifrado lo hace ui/escritorio.js con el motor del celular; aquí solo se leen y escriben archivos)

    /// Lo que entra en una copia, leído de ~/Repasa: JSON como texto y el material en base64 (o vacío si solo importa que existe).
    private func archivosDeRepasa(conMaterial: Bool) -> [String: Any] {
        let fm = FileManager.default
        var r: [String: Any] = [:]
        func texto(_ rel: String) {
            if let s = try? String(contentsOf: Rutas.base.appendingPathComponent(rel), encoding: .utf8) { r[rel] = ["texto": s] }
        }
        texto("perfiles.json")
        texto("pruebas.json")
        for n in (try? fm.contentsOfDirectory(atPath: Rutas.base.appendingPathComponent("progreso").path)) ?? [] where n.hasSuffix(".json") {
            texto("progreso/\(n)")
        }
        for id in (try? fm.contentsOfDirectory(atPath: Rutas.temas.path)) ?? [] where Rutas.cumple(id, "^[a-z0-9-]{2,60}$") {
            texto("temas/\(id)/tema.json")
            let carpeta = Rutas.temas.appendingPathComponent(id).appendingPathComponent("material")
            for f in (try? fm.contentsOfDirectory(atPath: carpeta.path)) ?? [] {
                let rel = "temas/\(id)/material/\(f)"
                guard Rutas.permitidaEnCopia(rel) else { continue }
                if conMaterial {
                    if let datos = try? Data(contentsOf: carpeta.appendingPathComponent(f)) { r[rel] = ["base64": datos.base64EncodedString()] }
                } else {
                    r[rel] = ["base64": ""]
                }
            }
        }
        return r.filter { Rutas.permitidaEnCopia($0.key) }
    }

    /// Llama a window.RepasaEscritorio.<funcion>(…) con los argumentos como valores (nunca pegados en el código).
    private func escritorio(_ funcion: String, _ argumentos: [String: Any], _ fin: @escaping @MainActor ([String: Any]?) -> Void) {
        guard let web else { fin(nil); return }
        let nombres = ["armar": "archivos, frase, hoy", "traer": "archivos, texto, frase"][funcion] ?? ""
        let js = "if (!window.RepasaEscritorio) return null; return await window.RepasaEscritorio.\(funcion)(\(nombres));"
        web.callAsyncJavaScript(js, arguments: argumentos, in: nil, in: .page) { resultado in
            var r: [String: Any]?
            if case .success(let valor) = resultado { r = valor as? [String: Any] }
            Task { @MainActor in fin(r) }
        }
    }

    private func guardarCopia(frase: String) {
        let hoy = Ventana.hoy()
        Procesador.enFila { listo in
            let archivos = Ventana.shared.archivosDeRepasa(conMaterial: true)
            listo()
            Ventana.shared.escritorio("armar", ["archivos": archivos, "frase": frase, "hoy": hoy]) { r in
                guard let r else { return Ventana.shared.llamar("copiaLista", ["ok": false, "error": Idioma.t("La copia no está lista en esta app todavía. Prueba después de actualizar Repasa.")]) }
                guard r["ok"] as? Bool == true, let texto = r["texto"] as? String else {
                    return Ventana.shared.llamar("copiaLista", ["ok": false, "error": r["error"] as? String ?? "No se pudo guardar la copia."])
                }
                Ventana.shared.elegirDondeGuardar(texto: texto, cantidad: r["cantidad"] as? Int ?? 0, hoy: hoy)
            }
        }
    }

    private func elegirDondeGuardar(texto: String, cantidad: Int, hoy: String) {
        guard let v = ventana else { return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "Repasa-copia-\(hoy).repasa"
        panel.message = Idioma.t("Dónde guardar la copia cifrada")
        if let tipo = UTType(filenameExtension: "repasa") { panel.allowedContentTypes = [tipo] }
        let icloud = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
        if FileManager.default.fileExists(atPath: icloud.path) { panel.directoryURL = icloud }
        panel.beginSheetModal(for: v) { r in
            let destino = r == .OK ? panel.url : nil
            Task { @MainActor in
                guard let destino else { return Ventana.shared.llamar("copiaLista", ["ok": false, "cancelado": true]) }
                let ok = Archivos.escribir(destino, Data(texto.utf8))
                let respuesta: [String: Any] = ok ? ["ok": true, "cantidad": cantidad] : ["ok": false, "error": "No se pudo guardar la copia."]
                Ventana.shared.llamar("copiaLista", respuesta)
            }
        }
    }

    private func traerCopia(frase: String) {
        guard let v = ventana else { return }
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        if let tipo = UTType(filenameExtension: "repasa") { panel.allowedContentTypes = [tipo] }
        panel.message = Idioma.t("Elige la copia de Repasa (archivo .repasa)")
        panel.beginSheetModal(for: v) { r in
            let origen = r == .OK ? panel.url : nil
            Task { @MainActor in Ventana.shared.juntarCopia(origen, frase: frase) }
        }
    }

    private func juntarCopia(_ origen: URL?, frase: String) {
        guard let origen else { return llamar("copiaTraida", ["ok": false, "cancelado": true]) }
        // Una copia con muchas fotos puede ser grande, pero no infinita (igual que el celular).
        guard Archivos.tamano(origen) <= Ventana.maximoCopia, let texto = try? String(contentsOf: origen, encoding: .utf8) else {
            return llamar("copiaTraida", ["ok": false, "error": "No se pudo abrir el archivo."])
        }
        Procesador.enFila { listo in
            let archivos = Ventana.shared.archivosDeRepasa(conMaterial: false)
            Ventana.shared.escritorio("traer", ["archivos": archivos, "texto": texto, "frase": frase]) { r in
                guard let r else {
                    listo()
                    return Ventana.shared.llamar("copiaTraida", ["ok": false, "error": Idioma.t("La copia no está lista en esta app todavía. Prueba después de actualizar Repasa.")])
                }
                guard r["ok"] as? Bool == true else {
                    listo()
                    return Ventana.shared.llamar("copiaTraida", ["ok": false, "error": r["error"] as? String ?? "No se pudo abrir el archivo."])
                }
                // Lo que juntó el motor se revisa otra vez antes de tocar el disco: solo rutas permitidas, dentro de ~/Repasa.
                for x in r["escribir"] as? [[String: Any]] ?? [] {
                    guard let ruta = x["ruta"] as? String, Rutas.permitidaEnCopia(ruta) else { continue }
                    let destino = Rutas.base.appendingPathComponent(ruta)
                    if let t = x["texto"] as? String {
                        _ = Archivos.escribir(destino, Data(t.utf8))
                    } else if let b = x["base64"] as? String, let datos = Data(base64Encoded: b), !datos.isEmpty {
                        _ = Archivos.escribir(destino, datos)
                    }
                }
                listo()
                let resumen: Any = r["resumen"] ?? [String: Any]()
                Ventana.shared.llamar("copiaTraida", ["ok": true, "resumen": resumen])
                Ventana.shared.enviarEstado()
            }
        }
    }
}

/// repasa://material/<tema>/<archivo>: las fotos del material de un tema guardado (ui/app.js, rutaMaterial). Solo lee archivos
/// material-N.<ext> de ~/Repasa/temas/<tema>/material/; cualquier otra cosa no existe.
@MainActor
final class EsquemaMaterial: NSObject, WKURLSchemeHandler {
    private static let tipos = ["jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic",
                                "gif": "image/gif", "pdf": "application/pdf"]

    func webView(_ webView: WKWebView, start tarea: any WKURLSchemeTask) {
        guard let u = tarea.request.url, u.host == "material" else { return tarea.didFailWithError(URLError(.fileDoesNotExist)) }
        let partes = u.pathComponents.filter { $0 != "/" }
        guard partes.count == 2, Rutas.cumple(partes[0], "^[a-z0-9-]{2,60}$"),
              Rutas.cumple(partes[1], #"^material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf)$"#),
              let tipo = EsquemaMaterial.tipos[(partes[1] as NSString).pathExtension.lowercased()] else {
            return tarea.didFailWithError(URLError(.fileDoesNotExist))
        }
        let archivo = Rutas.temas.appendingPathComponent(partes[0]).appendingPathComponent("material").appendingPathComponent(partes[1])
        guard let datos = try? Data(contentsOf: archivo) else { return tarea.didFailWithError(URLError(.fileDoesNotExist)) }
        tarea.didReceive(URLResponse(url: u, mimeType: tipo, expectedContentLength: datos.count, textEncodingName: nil))
        tarea.didReceive(datos)
        tarea.didFinish()
    }

    func webView(_ webView: WKWebView, stop tarea: any WKURLSchemeTask) {}
}
