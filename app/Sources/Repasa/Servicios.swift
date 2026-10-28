import AppKit

// MARK: - Rutas y configuración (compartidas con bin/datos.py)

enum Rutas {
    /// Datos de la familia: fuera de la app, así actualizar no borra nada.
    static var base: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Repasa") }
    static var interno: URL { base.appendingPathComponent(".repasa") }
    static var config: URL { interno.appendingPathComponent("config.json") }
    static var temas: URL { base.appendingPathComponent("temas") }
    /// Fotos o PDF arrastrados a «Nuevo tema» mientras el tema no se guarda (se borran al abrir la app).
    static var temporal: URL { interno.appendingPathComponent("temporal") }
    /// Código (bin/, ui/, temas/): dentro de Repasa.app.
    static var recursos: URL { Bundle.main.resourceURL!.appendingPathComponent("repasa") }
    static var python: URL { Bundle.main.resourceURL!.appendingPathComponent("python/bin/python3") }

    /// ~/Repasa solo para la cuenta de la persona (0700): hay nombres de niños y su avance.
    static func prepararCarpeta() {
        let fm = FileManager.default
        try? fm.createDirectory(at: base, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try? fm.setAttributes([.posixPermissions: 0o700], ofItemAtPath: base.path)
    }

    /// Una ruta relativa a ~/Repasa que puede entrar o salir de una copia (igual que RUTA_PERMITIDA en motor/copia.js).
    static let patronCopia = #"^(perfiles\.json|pruebas\.json|progreso/[a-z0-9-]{1,80}\.json|temas/[a-z0-9-]{2,60}/tema\.json|temas/[a-z0-9-]{2,60}/material/material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf))$"#

    static func permitidaEnCopia(_ ruta: String) -> Bool {
        !ruta.contains("..") && ruta.range(of: patronCopia, options: .regularExpression) != nil
    }

    static func cumple(_ texto: String, _ patron: String) -> Bool {
        texto.range(of: patron, options: .regularExpression) != nil
    }
}

enum Archivos {
    static func leerJSON(_ url: URL) -> [String: Any] {
        guard let d = try? Data(contentsOf: url), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return [:] }
        return j
    }

    /// Escritura atómica; el archivo queda solo para la persona (0600).
    static func escribir(_ url: URL, _ datos: Data) -> Bool {
        let fm = FileManager.default
        try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        do { try datos.write(to: url, options: .atomic) } catch { return false }
        try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        return true
    }

    static func escribirJSON(_ url: URL, _ valor: Any) {
        if let d = try? JSONSerialization.data(withJSONObject: valor, options: [.prettyPrinted, .sortedKeys]) { _ = escribir(url, d) }
    }

    /// Lo que pesa un archivo, sin leerlo (0 si no existe).
    static func tamano(_ url: URL) -> Int {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
    }
}

enum Config {
    static func leer() -> [String: Any] { Archivos.leerJSON(Rutas.config) }

    /// Solo claves conocidas con valores conocidos: lo que manda la interfaz no puede escribir cualquier cosa.
    static func guardar(_ cambios: [String: Any]) {
        var d = leer()
        if let ia = cambios["ia"] as? String, ["claude", "codex", "gemini"].contains(ia) { d["ia"] = ia }
        if let idioma = cambios["idioma_ui"] as? String, idioma == "es" || idioma == "en" { d["idioma_ui"] = idioma }
        if let b = cambios["bienvenida"] as? Bool { d["bienvenida"] = b }
        if let p = cambios["ultimo_perfil"] as? String, Rutas.cumple(p, "^[a-z0-9-]{1,80}$") { d["ultimo_perfil"] = p }
        Archivos.escribirJSON(Rutas.config, d)
    }

    static func texto(_ clave: String) -> String { (leer()[clave] as? String) ?? "" }
}

// MARK: - Idioma (las claves son el texto en español, igual que en ui/idiomas)

enum Idioma {
    nonisolated(unsafe) private static var cache: (codigo: String, textos: [String: String])?

    static var codigo: String {
        let elegido = Config.texto("idioma_ui")
        if !elegido.isEmpty { return elegido }
        return Locale.preferredLanguages.first?.hasPrefix("es") == true ? "es" : "en"
    }

    /// Ya hay idioma: lo eligió (bienvenida o Para adultos) o hizo la bienvenida antes (no se le vuelve a preguntar).
    static var elegido: Bool { !Config.texto("idioma_ui").isEmpty || Config.leer()["bienvenida"] as? Bool == true }

    static func t(_ texto: String) -> String {
        let c = codigo
        guard c != "es" else { return texto }
        if cache?.codigo != c {
            let j = Archivos.leerJSON(Rutas.recursos.appendingPathComponent("ui/idiomas/\(c).json"))
            cache = (c, j["textos"] as? [String: String] ?? [:])
        }
        return cache?.textos[texto] ?? texto
    }
}

// MARK: - La IA de un adulto (se detecta y se prueba, no se configura a mano)

@MainActor
enum IA {
    static let conocidas: [(id: String, nombre: String, comandos: [String])] = [
        ("claude", "Claude", ["claude"]),
        ("codex", "ChatGPT (Codex)", ["codex"]),
        ("gemini", "Gemini", ["agy", "gemini"]),
    ]

    /// La app no hereda el PATH de la terminal: se buscan los CLI donde suelen quedar (lo mismo que bin/ia.py).
    nonisolated static func dirs() -> [String] {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        var d = ["/opt/homebrew/bin", "/usr/local/bin", "\(home)/.local/bin", "\(home)/.claude/local", "\(home)/.codex/bin",
                 "\(home)/.npm-global/bin", "\(home)/.volta/bin", "\(home)/.bun/bin", "/usr/bin"]
        let nvm = "\(home)/.nvm/versions/node"
        let versiones = ((try? FileManager.default.contentsOfDirectory(atPath: nvm)) ?? []).sorted { $0.compare($1, options: .numeric) == .orderedDescending }
        d += versiones.map { "\(nvm)/\($0)/bin" }
        return d
    }

    static func buscar(_ comandos: [String]) -> String? {
        for c in comandos {
            if let r = dirs().map({ "\($0)/\(c)" }).first(where: { FileManager.default.isExecutableFile(atPath: $0) }) { return r }
        }
        return nil
    }

    static var paraJS: [[String: Any]] {
        conocidas.map { ["id": $0.id, "nombre": $0.nombre, "instalada": buscar($0.comandos) != nil] }
    }

    /// Prueba real: le pide una palabra. Así sabemos que está instalada y con la sesión iniciada. Sin herramientas ni MCP.
    static func probar(_ id: String, _ fin: @escaping @MainActor (Bool, String) -> Void) {
        guard let ia = conocidas.first(where: { $0.id == id }), let ruta = buscar(ia.comandos) else { fin(false, Idioma.t("No está instalada.")); return }
        let pedido = "Responde solo con la palabra: listo"
        let esAgy = (ruta as NSString).lastPathComponent == "agy"
        let args: [String]
        switch id {
        case "codex": args = ["exec", "--skip-git-repo-check", "-s", "read-only", "-"]
        case "gemini" where esAgy: args = ["--output-format", "text", "--sandbox", "-p", pedido]
        case "gemini": args = ["-p", "Responde a las instrucciones de arriba.", "-o", "text"]
        default: args = ["-p", "--output-format", "text", "--strict-mcp-config", "--disallowedTools", "*"]
        }
        let p = Process(), salida = Pipe(), error = Pipe(), entrada = Pipe()
        p.executableURL = URL(fileURLWithPath: ruta)
        p.arguments = args
        p.environment = Procesador.entorno(paraIA: true)
        p.currentDirectoryURL = FileManager.default.temporaryDirectory
        p.standardInput = entrada; p.standardOutput = salida; p.standardError = error
        p.terminationHandler = { pr in
            let texto = String(data: salida.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: error.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let estado = pr.terminationStatus
            Task { @MainActor in
                let ok = estado == 0 && !texto.isEmpty
                fin(ok, ok ? texto.trimmingCharacters(in: .whitespacesAndNewlines) : String(err.suffix(300)))
            }
        }
        do { try p.run() } catch { fin(false, error.localizedDescription); return }
        entrada.fileHandleForWriting.write(pedido.data(using: .utf8)!)
        try? entrada.fileHandleForWriting.close()
        DispatchQueue.main.asyncAfter(deadline: .now() + 90) { if p.isRunning { p.terminate() } }
    }
}

// MARK: - Scripts de bin/ (contrato: el último argumento es la ruta del JSON de salida)

@MainActor
enum Procesador {
    /// El entorno de los scripts y de la IA: nada que venga de afuera con nombre REPASA_* (p. ej. una carpeta o un modo de prueba
    /// puesto por otro programa) y el PATH donde suelen quedar los CLI de IA.
    nonisolated static func entorno(paraIA: Bool = false) -> [String: String] {
        var env = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("REPASA_") }
        env["PATH"] = (IA.dirs() + ["/bin", "/usr/sbin", "/sbin"]).joined(separator: ":")
        if !paraIA {
            env["REPASA_RECURSOS"] = Bundle.main.resourceURL!.appendingPathComponent("repasa").path
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONDONTWRITEBYTECODE"] = "1"  // nada de __pycache__ dentro de la app (rompería su firma)
        }
        return env
    }

    static func correrJSON(_ script: String, _ args: [String], fin: @escaping @MainActor ([String: Any]) -> Void) {
        let salida = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-\(UUID().uuidString).json")
        let p = Process()
        p.executableURL = Rutas.python
        p.arguments = [Rutas.recursos.appendingPathComponent("bin/\(script)").path] + args + [salida.path]
        p.environment = entorno()
        p.standardInput = FileHandle.nullDevice
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        p.terminationHandler = { _ in
            Task { @MainActor in
                let r = Archivos.leerJSON(salida)
                try? FileManager.default.removeItem(at: salida)
                fin(r.isEmpty ? ["ok": false, "error": Idioma.t("No pude terminar. Intenta de nuevo.")] : r)
            }
        }
        do { try p.run() } catch { fin(["ok": false, "error": error.localizedDescription]) }
    }

    /// Igual que correrJSON, pero lo que manda la interfaz va en un archivo de entrada (nada de armar comandos con su texto):
    /// `script <args…> <entrada.json> <salida.json>`.
    static func conEntrada(_ script: String, _ args: [String], _ datos: [String: Any], fin: @escaping @MainActor ([String: Any]) -> Void) {
        let entrada = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-entrada-\(UUID().uuidString).json")
        guard let d = try? JSONSerialization.data(withJSONObject: datos), Archivos.escribir(entrada, d) else {
            fin(["ok": false, "error": Idioma.t("No pude terminar. Intenta de nuevo.")])
            return
        }
        correrJSON(script, args + [entrada.path]) { r in
            try? FileManager.default.removeItem(at: entrada)
            fin(r)
        }
    }

    // MARK: Una cosa a la vez con los archivos de ~/Repasa

    /// Lo que lee o escribe ~/Repasa (guardar progreso, perfiles, pruebas, leer el estado, juntar una copia) va en fila: así un
    /// estado nunca se lee a medio guardar y dos «guardar progreso» seguidos no se pisan. Lo que espera a la IA no entra en la fila.
    private static var fila: [@MainActor (@escaping @MainActor () -> Void) -> Void] = []
    private static var ocupada = false

    static func enFila(_ trabajo: @escaping @MainActor (_ listo: @escaping @MainActor () -> Void) -> Void) {
        fila.append(trabajo)
        if !ocupada { siguiente() }
    }

    private static func siguiente() {
        guard !fila.isEmpty else { ocupada = false; return }
        ocupada = true
        let trabajo = fila.removeFirst()
        trabajo { siguiente() }
    }

    /// conEntrada, en la fila.
    static func guardarEnFila(_ script: String, _ args: [String], _ datos: [String: Any], fin: @escaping @MainActor ([String: Any]) -> Void = { _ in }) {
        enFila { listo in
            conEntrada(script, args, datos) { r in
                fin(r)
                listo()
            }
        }
    }
}
