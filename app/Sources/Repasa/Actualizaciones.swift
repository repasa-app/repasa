import AppKit

/// Versiones nuevas de Repasa, dentro de la app (en «Para adultos», nunca una alerta del sistema ni algo en la pantalla de los niños):
/// se revisa al abrir y cada 6 horas. Instalación normal: el Release de GitHub (`Repasa-macOS.zip` + `.sha256`). Instalación de
/// desarrollo (la armó build.sh desde un checkout de git, que deja su ruta en ~/Repasa/.repasa/desarrollo, fuera de la app para no
/// romper su firma): git pull + empaquetar. Los datos viven en ~/Repasa, fuera de la app: actualizar no borra nada.
@MainActor
enum Actualizaciones {
    static var version: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
    static let repo = "repasa-app/repasa"
    static let sinConexion = "sin-conexion"

    /// Solo se descarga desde los Releases de este repo en github.com (GitHub redirige luego a su almacenamiento, por https).
    static func esDescargaNuestra(_ u: URL) -> Bool {
        u.scheme == "https" && u.host == "github.com" && u.path.hasPrefix("/\(repo)/releases/download/") && u.query == nil && u.user == nil
            && u.port == nil && !u.path.contains("..")
    }

    /// Texto entre comillas simples para bash: nada de lo que va adentro (rutas, URL, textos) se interpreta como código.
    static func comillas(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }
    private static var zip: URL?, huella: URL?
    private(set) static var disponible: [String: Any] = ["hay": false]

    /// Checkout de desarrollo desde el que se compiló esta app (o nil si es una instalación normal).
    static var checkout: URL? {
        guard let t = try? String(contentsOf: Rutas.interno.appendingPathComponent("desarrollo"), encoding: .utf8) else { return nil }
        let u = URL(fileURLWithPath: t.trimmingCharacters(in: .whitespacesAndNewlines))
        return FileManager.default.fileExists(atPath: u.appendingPathComponent(".git").path) ? u : nil
    }

    private static func git(_ args: [String], en: URL, _ fin: @escaping @MainActor (Bool, String) -> Void) {
        let p = Process(), salida = Pipe()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        p.arguments = args
        p.currentDirectoryURL = en
        p.standardOutput = salida
        p.standardError = FileHandle.nullDevice
        p.terminationHandler = { pr in
            let t = String(data: salida.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let ok = pr.terminationStatus == 0
            Task { @MainActor in fin(ok, t) }
        }
        do { try p.run() } catch { fin(false, "") }
    }

    /// Revisa si hay versión nueva: (hay, detalle). Si no pudo consultar, detalle = sinConexion.
    static func revisar(_ fin: @escaping @MainActor (Bool, String) -> Void) {
        let terminar: @MainActor (Bool, String) -> Void = { hay, detalle in
            // desarrollo: las notas son los commits nuevos del checkout (la pieza «componentes» lo dice así solo con esta marca).
            disponible = ["hay": hay, "detalle": hay ? detalle : "", "desarrollo": checkout != nil]
            fin(hay, detalle)
        }
        if let raiz = checkout {
            git(["fetch", "--quiet", "origin", "main"], en: raiz) { ok, _ in
                guard ok else { terminar(false, sinConexion); return }
                git(["rev-list", "--count", "HEAD..origin/main"], en: raiz) { _, n in
                    guard (Int(n.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0) > 0 else { terminar(false, ""); return }
                    git(["log", "--format=%s", "-n", "3", "HEAD..origin/main"], en: raiz) { _, log in
                        terminar(true, log.split(separator: "\n").map { "• " + $0 }.joined(separator: "\n"))
                    }
                }
            }
            return
        }
        var pedido = URLRequest(url: URL(string: "https://api.github.com/repos/\(repo)/releases/latest")!)
        pedido.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        pedido.setValue("Repasa/\(version)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: pedido) { datos, respuesta, _ in
            let codigo = (respuesta as? HTTPURLResponse)?.statusCode ?? 0
            let o = datos.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            let tag = (o["tag_name"] as? String ?? "").trimmingCharacters(in: CharacterSet(charactersIn: "v"))
            let assets = o["assets"] as? [[String: Any]] ?? []
            let url = { (n: String) in (assets.first { $0["name"] as? String == n }?["browser_download_url"] as? String).flatMap(URL.init(string:)) }
            let z = url("Repasa-macOS.zip"), h = url("Repasa-macOS.zip.sha256")
            let notas = (o["body"] as? String ?? "").split(separator: "\n").prefix(4).joined(separator: "\n")
            Task { @MainActor in
                guard codigo == 200 || codigo == 404 else { terminar(false, sinConexion); return }  // 404: aún no hay versiones
                guard !tag.isEmpty, tag.compare(version, options: .numeric) == .orderedDescending,
                      let z, let h, esDescargaNuestra(z), esDescargaNuestra(h) else { terminar(false, ""); return }
                zip = z; huella = h
                terminar(true, Idioma.t("Versión") + " \(tag)\n" + notas)
            }
        }.resume()
    }

    /// Al abrir y cada 6 horas. Solo avisa si hay algo (sin volver a mandar todo el estado a la interfaz).
    static func revisarCadaRato() {
        let avisar: @MainActor (Bool, String) -> Void = { hay, detalle in
            if hay { Ventana.shared.llamar("actualizacionRevisada", ["hay": true, "detalle": detalle, "desarrollo": checkout != nil]) }
        }
        revisar(avisar)
        Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { _ in
            Task { @MainActor in revisar(avisar) }
        }
    }

    // MARK: Instalar, con avance por pasos ("paso|texto" en un archivo que se lee cada segundo)

    static let archivoEstado = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("repasa-actualizar.estado")
    static let archivoProgreso = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("repasa-actualizar.progreso")
    private static var reloj: Timer?

    static func seguir(_ avisar: @escaping @MainActor ([String: Any]) -> Void) {
        reloj?.invalidate()
        reloj = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                let estado = ((try? String(contentsOf: archivoEstado, encoding: .utf8)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let partes = estado.split(separator: "|", maxSplits: 1).map(String.init)
                guard partes.count == 2 else { return }
                var d: [String: Any] = ["paso": partes[0], "texto": partes[1], "total": 3]
                if partes[0] == "2", let log = try? String(contentsOf: archivoProgreso, encoding: .utf8),
                   let m = log.matches(of: #/\[(\d+)/(\d+)\]/#).last, let n = Double(m.1), let t = Double(m.2), t > 0 {
                    d["pct"] = Int(n / t * 100)
                }
                avisar(d)
                if partes[0] == "error" { reloj?.invalidate(); reloj = nil }
            }
        }
    }

    /// Los textos van en español (son las claves de ui/idiomas): la interfaz los muestra en el idioma elegido.
    static func instalar(_ fin: @escaping @MainActor (Bool, String) -> Void) {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-actualizacion")
        let guion = tmp.appendingPathComponent("actualizar.sh")
        try? FileManager.default.removeItem(at: tmp)
        try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        let pid = ProcessInfo.processInfo.processIdentifier
        let e = archivoEstado.path, prog = archivoProgreso.path
        let t1 = "Descargando la versión nueva…", t2 = "Preparando la versión nueva…"
        let t3 = "Instalando: Repasa se cerrará y volverá a abrirse sola"
        let tErrBajar = "No pude descargar la versión nueva. Revisa tu conexión e intenta de nuevo."
        let tErrArmar = "No pude preparar la versión nueva. Repasa sigue igual que antes; intenta de nuevo más tarde."
        try? FileManager.default.removeItem(at: archivoProgreso)
        try? "1|\(t1)".write(to: archivoEstado, atomically: true, encoding: .utf8)
        let texto: String
        if let raiz = checkout {
            // Todo lo variable va con comillas(): ni una ruta ni un texto se interpreta como código.
            texto = """
            #!/bin/bash
            export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin
            cd \(comillas(raiz.path)) || exit 1
            echo \(comillas("1|" + t1)) > \(comillas(e))
            git pull --ff-only || { echo \(comillas("error|" + tErrBajar)) > \(comillas(e)); exit 1; }
            echo \(comillas("2|" + t2)) > \(comillas(e))
            REPASA_PROGRESO=\(comillas(prog)) bash ./herramientas/empaquetar.sh || { echo \(comillas("error|" + tErrArmar)) > \(comillas(e)); exit 1; }
            echo \(comillas("3|" + t3)) > \(comillas(e))
            sleep 1.5
            osascript -e 'tell application id "app.repasa.mac" to quit' 2>/dev/null || true
            while kill -0 \(pid) 2>/dev/null; do sleep 0.5; done
            APP="$HOME/Applications/Repasa.app"
            rm -rf "$APP" && ditto dist/Repasa.app "$APP"
            rm -f \(comillas(e)) \(comillas(prog))
            open "$APP"
            """
        } else {
            guard let zip, let huella, esDescargaNuestra(zip), esDescargaNuestra(huella) else {
                fin(false, "No encontré la descarga de la versión nueva.")
                return
            }
            let app = Bundle.main.bundlePath
            let anterior = app + ".anterior"
            texto = """
            #!/bin/bash
            # Baja la versión nueva, verifica su huella, espera a que Repasa se cierre, la reemplaza y la abre.
            # Todo lo variable va con comillas(): ni una URL ni un texto se interpreta como código.
            export PATH=/usr/bin:/bin:/usr/sbin:/sbin
            cd \(comillas(tmp.path)) || exit 1
            echo \(comillas("1|" + t1)) > \(comillas(e))
            curl -fsSL --proto '=https' --proto-redir '=https' \(comillas(zip.absoluteString)) -o Repasa-macOS.zip && curl -fsSL --proto '=https' --proto-redir '=https' \(comillas(huella.absoluteString)) -o Repasa-macOS.zip.sha256 || { echo \(comillas("error|" + tErrBajar)) > \(comillas(e)); exit 1; }
            echo \(comillas("2|" + t2)) > \(comillas(e))
            [ "$(shasum -a 256 Repasa-macOS.zip | cut -d' ' -f1)" = "$(cut -d' ' -f1 Repasa-macOS.zip.sha256)" ] || { echo \(comillas("error|" + tErrBajar)) > \(comillas(e)); exit 1; }
            ditto -x -k Repasa-macOS.zip nueva || { echo \(comillas("error|" + tErrArmar)) > \(comillas(e)); exit 1; }
            [ -d nueva/Repasa.app ] || { echo \(comillas("error|" + tErrArmar)) > \(comillas(e)); exit 1; }
            xattr -dr com.apple.quarantine nueva/Repasa.app 2>/dev/null || true
            echo \(comillas("3|" + t3)) > \(comillas(e))
            sleep 1.5
            osascript -e 'tell application id "app.repasa.mac" to quit' 2>/dev/null || true
            while kill -0 \(pid) 2>/dev/null; do sleep 0.5; done
            rm -rf \(comillas(anterior)); mv \(comillas(app)) \(comillas(anterior))
            ditto nueva/Repasa.app \(comillas(app)) && rm -rf \(comillas(anterior)) || mv \(comillas(anterior)) \(comillas(app))
            rm -f \(comillas(e))
            open \(comillas(app))
            """
        }
        do { try texto.write(to: guion, atomically: true, encoding: .utf8) } catch { fin(false, error.localizedDescription); return }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = ["-c", "nohup /bin/bash \(comillas(guion.path)) > \(comillas(NSTemporaryDirectory() + "repasa-actualizar.log")) 2>&1 &"]
        do { try p.run(); fin(true, "") } catch { fin(false, error.localizedDescription) }
    }
}
