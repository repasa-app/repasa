import AppKit
import PiezaHost

/// El material de un tema (fotos del cuaderno o un PDF): elegirlo o arrastrarlo, crear el tema con la IA y guardarlo con su
/// material. Crear y guardar un tema solo aceptan archivos que la persona eligió en esta sesión (el panel del sistema o
/// arrastrados), nunca una ruta cualquiera que llegue desde la página. Lo nativo propio de Repasa: queda registrado en el host.
@MainActor
enum Material {
    static let extensiones = ["jpg", "jpeg", "png", "webp", "heic", "gif", "pdf"]
    static let maximo = 25 * 1024 * 1024
    /// crear_tema.py le da a la IA hasta 900 s (ia.preguntar): el host lo corta un poco después.
    static let limiteCrear = 960

    /// Lo que la persona eligió (panel o arrastrar) en esta sesión.
    private static var elegidos = Set<String>()
    private static var soltados = 0

    static func registrar(_ p: Puente) {
        // repasa://material/<tema>/material-N.<ext>: las fotos del material de un tema guardado (ui/app.js, rutaMaterial). Solo
        // archivos material-N.<ext> de ~/Repasa/temas/<tema>/material/; cualquier otra cosa no existe.
        p.registrarMedios("material") { ruta in archivo(ruta) }
        p.registrar("elegirMaterial") { _ in elegir(p) }
        p.registrar("soltarMaterial") { d in soltar(nombre: d["nombre"] as? String ?? "", base64: d["base64"] as? String ?? "") }
        p.registrar("crearTema") { d in crear(d) }
        p.registrar("guardarTema") { d in guardar(d["tema"] as? [String: Any] ?? [:], archivos: elegidosDe(d["archivos"])) }
    }

    static func archivo(_ ruta: String) -> URL? {
        let partes = ruta.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard partes.count == 2, Rutas.cumple(partes[0], "^[a-z0-9-]{2,60}$"),
              Rutas.cumple(partes[1], #"^material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf)$"#) else { return nil }
        return Rutas.temas.appendingPathComponent(partes[0]).appendingPathComponent("material").appendingPathComponent(partes[1])
    }

    private static func elegir(_ p: Puente) {
        p.elegirArchivos(extensiones: extensiones, varios: true) { urls in
            let lista: [[String: Any]] = urls.prefix(20).compactMap { u -> [String: Any]? in
                guard extensiones.contains(u.pathExtension.lowercased()), Disco.tamano(u) <= maximo else { return nil }
                elegidos.insert(u.path)
                return ["ruta": u.path, "nombre": u.lastPathComponent]
            }
            p.llamar("materialElegido", lista)
        }
    }

    /// Una foto o PDF arrastrado a «Nuevo tema»: la interfaz manda el contenido (no hay ruta) y queda en .repasa/temporal/.
    private static func soltar(nombre: String, base64: String) {
        let ext = (nombre as NSString).pathExtension.lowercased()
        guard extensiones.contains(ext), base64.count <= maximo / 3 * 4 + 4,
              let datos = Data(base64Encoded: base64), !datos.isEmpty, datos.count <= maximo else { return }
        soltados += 1
        let destino = Rutas.temporal.appendingPathComponent("soltado-\(soltados)-\(UUID().uuidString.prefix(8)).\(ext)")
        guard Disco.escribir(destino, datos) else { return }
        elegidos.insert(destino.path)
        let elegido: [[String: Any]] = [["ruta": destino.path, "nombre": String((nombre as NSString).lastPathComponent.prefix(80))]]
        Puente.shared.llamar("materialElegido", elegido)
    }

    /// Solo rutas que la persona eligió en esta sesión y que siguen ahí.
    private static func elegidosDe(_ valor: Any?) -> [String] {
        ((valor as? [Any]) ?? []).compactMap { $0 as? String }.filter { elegidos.contains($0) && FileManager.default.isReadableFile(atPath: $0) }
    }

    /// `crear_tema.py pedido <entrada>`: lo que escribió la persona va en el archivo de entrada, nunca como argumento. Fuera de la
    /// fila (espera a la IA); mientras corre, el host no instala una versión nueva (el script cuenta como «algo en curso»).
    private static func crear(_ d: [String: Any]) {
        let ramo = String((d["ramo"] as? String ?? "auto").filter { $0.isASCII && $0.isLowercase }.prefix(20))
        let curso = String((d["curso"] as? String ?? "").filter { $0.isASCII && ($0.isLowercase || $0.isNumber) }.prefix(4))
        let pedido: [String: Any] = ["curso": curso, "ramo": ramo.isEmpty ? "auto" : ramo, "texto": String((d["texto"] as? String ?? "").prefix(20000)),
                                     "archivos": elegidosDe(d["archivos"])]
        Procesador.conEntrada("crear_tema.py", ["pedido"], pedido, limite: limiteCrear) { RepasaApp.responder("temaCreado", $0) }
    }

    /// `crear_tema.py guardar <tema.json> [archivos…]`, en la fila del host (nunca a la vez que otro guardado o que leer el estado).
    private static func guardar(_ tema: [String: Any], archivos: [String]) {
        let entrada = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-tema-\(UUID().uuidString).json")
        guard JSONSerialization.isValidJSONObject(tema), let d = try? JSONSerialization.data(withJSONObject: tema), Disco.escribir(entrada, d) else {
            return RepasaApp.responder("temaGuardado", ["ok": false, "error": Idioma.t("No pude terminar. Intenta de nuevo.")])
        }
        let temporal = Rutas.temporal.path + "/"
        Fila.agregar { listo in
            Procesador.correrJSON("crear_tema.py", ["guardar", entrada.path] + archivos, limite: 120) { r in
                try? FileManager.default.removeItem(at: entrada)
                if r["ok"] as? Bool == true {
                    // Lo arrastrado ya quedó copiado en la carpeta del tema.
                    for a in archivos where a.hasPrefix(temporal) { try? FileManager.default.removeItem(atPath: a) }
                }
                RepasaApp.responder("temaGuardado", r)
                listo()
            }
        }
    }
}
