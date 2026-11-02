import AppKit
import PiezaHost
import WebKit

/// La copia cifrada: la misma del celular. El cifrado lo hace ui/escritorio.js con el motor JS (ui/motor/, los copia
/// empaquetar.sh) sobre la pieza «cifrado» (ui/cifrado.js, script clásico: window.PiezaCifrado, que se carga primero). Aquí solo se
/// leen y escriben archivos de ~/Repasa; los datos van a `RepasaEscritorio.armar/traer` como argumentos (`callAsyncJavaScript`),
/// nunca pegados en el código, y lo que vuelve para escribir se revisa otra vez (`Rutas.permitidaEnCopia`). Propio de Repasa:
/// queda registrado en el host.
@MainActor
enum Copia {
    static let maximo = 300 * 1024 * 1024

    static func registrar(_ p: Puente) {
        p.alConfigurarWeb = { conf in
            let cargar = "(() => { const c = document.createElement('script'); c.src = 'cifrado.js'; c.onload = () => { const s = document.createElement('script'); s.type = 'module'; s.src = 'escritorio.js'; document.head.appendChild(s); }; document.head.appendChild(c); })();"
            conf.userContentController.addUserScript(WKUserScript(source: cargar, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        p.registrar("guardarCopia") { d in guardar(p, frase: d["frase"] as? String ?? "") }
        p.registrar("traerCopia") { d in traer(p, frase: d["frase"] as? String ?? "") }
    }

    /// Lo que entra en una copia, leído de ~/Repasa: JSON como texto y el material en base64 (o vacío si solo importa que existe).
    private static func archivosDeRepasa(conMaterial: Bool) -> [String: Any] {
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

    /// window.RepasaEscritorio.<funcion>(…) con los argumentos como valores.
    private static func escritorio(_ p: Puente, _ funcion: String, _ argumentos: [String: Any], _ fin: @escaping @MainActor ([String: Any]?) -> Void) {
        guard let web = p.web else { return fin(nil) }
        let nombres = ["armar": "archivos, frase, hoy", "traer": "archivos, texto, frase"][funcion] ?? ""
        let js = "if (!window.RepasaEscritorio) return null; return await window.RepasaEscritorio.\(funcion)(\(nombres));"
        web.callAsyncJavaScript(js, arguments: argumentos, in: nil, in: .page) { resultado in
            var r: [String: Any]?
            if case .success(let valor) = resultado { r = valor as? [String: Any] }
            Task { @MainActor in fin(r) }
        }
    }

    private static let noLista = "La copia no está lista en esta app todavía. Prueba después de actualizar Repasa."

    /// Leer ~/Repasa va en la fila del host; cifrar, en el WebView. Mientras tanto la app está «ocupada» (no se cierra ni se
    /// actualiza a medio armar).
    private static func guardar(_ p: Puente, frase: String) {
        let hoy = RepasaApp.hoy()
        p.ocupar()
        Fila.agregar { listo in
            let archivos = archivosDeRepasa(conMaterial: true)
            listo()
            escritorio(p, "armar", ["archivos": archivos, "frase": frase, "hoy": hoy]) { r in
                guard let r else { p.soltar(); return RepasaApp.responder("copiaLista", ["ok": false, "error": Idioma.t(noLista)]) }
                guard r["ok"] as? Bool == true, let texto = r["texto"] as? String else {
                    p.soltar()
                    return RepasaApp.responder("copiaLista", ["ok": false, "error": r["error"] as? String ?? "No se pudo guardar la copia."])
                }
                elegirDondeGuardar(p, texto: texto, cantidad: r["cantidad"] as? Int ?? 0, hoy: hoy)
            }
        }
    }

    /// «Guardar como» del host, en iCloud Drive si la persona lo tiene. El archivo queda solo para la persona (`privado`: 0600).
    /// `guardarArchivo` distingue cancelar de un error (una copia más grande que el máximo, o que no se pudo escribir ahí).
    private static func elegirDondeGuardar(_ p: Puente, texto: String, cantidad: Int, hoy: String) {
        let icloud = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
        let desde = FileManager.default.fileExists(atPath: icloud.path) ? icloud : nil
        p.guardarArchivo(nombre: "Repasa-copia-\(hoy)", extension: "repasa", datos: Data(texto.utf8), desde: desde, maximo: maximo,
                         mensaje: Idioma.t("Dónde guardar la copia cifrada"), privado: true) { r in
            p.soltar()
            switch r {
            case .guardado: RepasaApp.responder("copiaLista", ["ok": true, "cantidad": cantidad])
            case .cancelado: RepasaApp.responder("copiaLista", ["ok": false, "cancelado": true])
            case .error: RepasaApp.responder("copiaLista", ["ok": false, "error": Idioma.t("No se pudo guardar la copia.")])
            }
        }
    }

    private static func traer(_ p: Puente, frase: String) {
        p.elegirArchivos(extensiones: ["repasa"], mensaje: Idioma.t("Elige la copia de Repasa (archivo .repasa)")) { urls in juntar(p, urls.first, frase: frase) }
    }

    private static func juntar(_ p: Puente, _ origen: URL?, frase: String) {
        guard let origen else { return RepasaApp.responder("copiaTraida", ["ok": false, "cancelado": true]) }
        // Una copia con muchas fotos puede ser grande, pero no infinita (igual que el celular).
        guard Disco.tamano(origen) <= maximo, let texto = try? String(contentsOf: origen, encoding: .utf8) else {
            return RepasaApp.responder("copiaTraida", ["ok": false, "error": "No se pudo abrir el archivo."])
        }
        p.ocupar()
        Fila.agregar { listo in
            let archivos = archivosDeRepasa(conMaterial: false)
            escritorio(p, "traer", ["archivos": archivos, "texto": texto, "frase": frase]) { r in
                defer { p.soltar() }
                guard let r else {
                    listo()
                    return RepasaApp.responder("copiaTraida", ["ok": false, "error": Idioma.t(noLista)])
                }
                guard r["ok"] as? Bool == true else {
                    listo()
                    return RepasaApp.responder("copiaTraida", ["ok": false, "error": r["error"] as? String ?? "No se pudo abrir el archivo."])
                }
                // Lo que juntó el motor se revisa otra vez antes de tocar el disco: solo rutas permitidas, dentro de ~/Repasa.
                for x in r["escribir"] as? [[String: Any]] ?? [] {
                    guard let ruta = x["ruta"] as? String, Rutas.permitidaEnCopia(ruta) else { continue }
                    let destino = Rutas.base.appendingPathComponent(ruta)
                    if let t = x["texto"] as? String {
                        _ = Disco.escribir(destino, Data(t.utf8))
                    } else if let b = x["base64"] as? String, let datos = Data(base64Encoded: b), !datos.isEmpty {
                        _ = Disco.escribir(destino, datos)
                    }
                }
                listo()
                let resumen: Any = r["resumen"] ?? [String: Any]()
                RepasaApp.responder("copiaTraida", ["ok": true, "resumen": resumen])
                p.enviarEstado()
            }
        }
    }
}
