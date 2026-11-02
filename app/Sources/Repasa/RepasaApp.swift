import AppKit
import PiezaActualizaciones
import PiezaHost

/// Repasa para Mac, sobre la pieza «host-mac» (target `PiezaHost`): la ventana con la interfaz de ui/, el puente con sus guardas
/// (solo el marco principal con un archivo de ui/; la ventana nunca sale de ui/), config e idioma desde app.json, los menús en el
/// idioma elegido, la apariencia de config.tema, guardar al salir y las acciones declaradas en app.json → acciones.json (guardar
/// perfil, progreso y pruebas en la fila, tema a mano, del catálogo, explicar, probar la IA: solo corren un script, con sus datos
/// validados y su límite de tiempo). Aquí queda lo propio de Repasa: el material del tema (Material.swift), la copia cifrada
/// (Copia.swift), los enlaces de Repasa y las actualizaciones (pieza «actualizaciones»).
/// Los datos de la familia viven en ~/Repasa, fuera de la app: actualizar nunca borra nada.
@main
enum RepasaApp {
    @MainActor static func main() {
        // La ventana de siempre (mismo tamaño, mismo nombre para recordar su lugar), sin menú Ayuda: los enlaces de Repasa están
        // en «Acerca de», dentro de Para adultos. El estado lo lee estado.py en la fila (ver `estado`), nunca a medio guardar.
        Host.arrancar(.init(ancho: 1180, alto: 800, minAncho: 420, minAlto: 560, sitio: "https://repasa-app.github.io/repasa/",
                            codigo: "https://github.com/repasa-app/repasa", menuAyuda: false, estadoScript: nil)) { p in
            Rutas.prepararCarpeta()
            // Fotos o PDF arrastrados para un tema que no se guardó la vez anterior.
            try? FileManager.default.removeItem(at: Rutas.temporal)

            p.estado = { base, listo in estado(base, listo) }
            p.menus = { m in menus(m) }
            p.alCambiarConfig = { _, _ in ajustarMenus() }
            // Host.arrancar instala los menús justo después de este bloque: se ajustan apenas termina el arranque.
            Task { @MainActor in ajustarMenus() }

            // Pieza «actualizaciones»: solo los Releases de este repo (Repasa-macOS.zip + .sha256). Instalación de desarrollo:
            // build.sh deja la ruta del checkout en ~/Repasa/.repasa/desarrollo y empaquetar.sh escribe su avance en REPASA_PROGRESO.
            // El host atiende buscarActualizacion y actualizar (nunca con un script corriendo: la IA armando un tema), revisa al
            // abrir y cada 6 horas recién con el idioma elegido y suma `actualizacion` al estado. La interfaz la muestra solo en
            // «Para adultos», nunca en la pantalla de los niños ni con una alerta del sistema.
            Actualizaciones.configurar(.init(repo: "repasa-app/repasa", nombre: "Repasa",
                archivoDesarrollo: Host.datos.appendingPathComponent("desarrollo"), variableProgreso: Host.prefijo + "PROGRESO"))
            p.actualizaciones = .init(revisar: Actualizaciones.revisar, revisarCadaRato: Actualizaciones.revisarCadaRato,
                seguir: Actualizaciones.seguir, instalar: Actualizaciones.instalar, aviso: Actualizaciones.aviso,
                disponible: { Actualizaciones.disponible })

            // Es para niños: la app solo abre el sitio y el repositorio de Repasa (lo mismo que el anfitrión del celular).
            p.registrar("abrirEnlace") { d in
                if let u = URL(string: d["url"] as? String ?? ""), enlaceNuestro(u) { NSWorkspace.shared.open(u) }
            }
            p.registrar("abrirCarpeta") { _ in abrirCarpeta() }
            Material.registrar(p)
            Copia.registrar(p)
        }
    }

    /// Hacia la interfaz con un diccionario (así los literales mezclados, `["ok": false, "error": …]`, tienen su tipo).
    @MainActor static func responder(_ funcion: String, _ datos: [String: Any]) { Puente.shared.llamar(funcion, datos) }

    /// Los únicos enlaces que abre la app: el sitio y el repositorio de Repasa.
    static func enlaceNuestro(_ u: URL) -> Bool {
        guard u.scheme == "https", u.user == nil, u.password == nil, u.port == nil else { return false }
        return (u.host == "repasa-app.github.io" && u.path.hasPrefix("/repasa/")) || (u.host == "github.com" && u.path.hasPrefix("/repasa-app/"))
    }

    @MainActor static func abrirCarpeta() {
        Rutas.prepararCarpeta()
        NSWorkspace.shared.open(Rutas.base)
    }

    static func hoy() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }

    // MARK: Estado

    /// Lo del host (versión, idioma, config, actualización) + lo que hay en ~/Repasa (bin/estado.py: perfiles, temas, progreso,
    /// pruebas, catálogo y las IA del adulto), leído en la fila: un estado nunca se lee a medio guardar.
    @MainActor static func estado(_ base: [String: Any], _ listo: @escaping @MainActor ([String: Any]) -> Void) {
        Fila.agregar { fin in
            Procesador.correrJSON("estado.py", [], limite: 60) { datos in
                fin()
                var e = base
                for (k, v) in datos where k != "ok" && k != "error" && k != "codigo" && k != "texto" && k != "valores" { e[k] = v }
                e["hoy"] = hoy()
                e["carpeta"] = Rutas.base.path.replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~")
                e["capacidades"] = ["copia": true, "camara": false]
                listo(e)
            }
        }
    }

    // MARK: Menús (los de siempre: Acerca de, Para adultos ⌘, la carpeta, Ocultar, Salir; Edición; Ventana con Cerrar ⌘W)

    /// El host pone el de la app (Acerca de, Ajustes, Ocultar, Salir) y Ventana; aquí va Edición y, para `ajustarMenus`, el ítem
    /// de la carpeta (se arma de nuevo, en el idioma elegido, cada vez que el host rearma los menús).
    @MainActor private static var itemCarpeta: NSMenuItem?

    @MainActor static func menus(_ m: Menus) -> [NSMenuItem] {
        itemCarpeta = m.nativo("Abrir la carpeta de Repasa") { abrirCarpeta() }
        return [m.edicion()]
    }

    /// Lo que el host todavía no deja elegir (pendiente en Pieza): «Ajustes…» se llama «Para adultos…» (lo atiende la interfaz con
    /// window.Repasa.menu({accion: "ajustes"}), nunca en medio de la bienvenida), la carpeta va debajo, y Ventana tiene «Cerrar» ⌘W.
    @MainActor static func ajustarMenus() {
        guard let principal = NSApp.mainMenu, let app = principal.items.first?.submenu,
              let i = app.items.firstIndex(where: { $0.representedObject as? String == "ajustes" }) else { return }
        app.item(at: i)?.title = Idioma.t("Para adultos…")
        if let c = itemCarpeta, c.menu == nil { app.insertItem(c, at: i + 1) }
        if let ventana = NSApp.windowsMenu, !ventana.items.contains(where: { $0.action == #selector(NSWindow.performClose(_:)) }) {
            ventana.addItem(withTitle: Idioma.t("Cerrar"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        }
    }
}

// MARK: - Rutas de ~/Repasa (compartidas con bin/datos.py)

enum Rutas {
    /// Datos de la familia: fuera de la app, así actualizar no borra nada. La carpeta interna (~/Repasa/.repasa: config, temporal,
    /// desarrollo) es `Host.datos` (app.json → "datos": "visible").
    static var base: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Repasa") }
    static var temas: URL { base.appendingPathComponent("temas") }
    /// Fotos o PDF arrastrados a «Nuevo tema» mientras el tema no se guarda (se borran al abrir la app).
    @MainActor static var temporal: URL { Host.datos.appendingPathComponent("temporal") }

    /// ~/Repasa solo para la cuenta de la persona (0700): hay nombres de niños y su avance. El host crea ~/Repasa/.repasa con los
    /// permisos de siempre para la carpeta de arriba: aquí se cierra.
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

enum Disco {
    /// Escritura atómica; el archivo queda solo para la persona (0600).
    static func escribir(_ url: URL, _ datos: Data) -> Bool {
        let fm = FileManager.default
        try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        do { try datos.write(to: url, options: .atomic) } catch { return false }
        try? fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        return true
    }

    /// Lo que pesa un archivo, sin leerlo (0 si no existe).
    static func tamano(_ url: URL) -> Int {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
    }
}
