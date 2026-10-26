import Foundation
import Capacitor
import UIKit
import Vision
#if canImport(FoundationModels)
import FoundationModels
#endif

/// La IA del propio iPhone para Repasa. Texto: Apple Foundation Models (iOS 26 o más nuevo, con Apple Intelligence activado).
/// Fotos del cuaderno: Vision (VNRecognizeTextRequest), que existe en todos los iPhone. Todo corre en el teléfono: sin red, sin
/// cuentas y sin llaves. Lo que responde el modelo lo valida el motor JS (motor/crear_tema.js) antes de usarlo, como en el computador.
///
/// JS: IaLocal.disponible() → {texto, ocr, motivo, plataforma, modelo, contexto}
///     IaLocal.preparar()   → {}   (en iOS el sistema prepara el modelo solo)
///     IaLocal.leerTexto({ruta})  → {texto}   ruta: file:// dentro de la app
///     IaLocal.preguntar({prompt, maxTokens, temperatura}) → {texto}
///     Errores con código: NO_DISPONIBLE, FILTRO, CONTEXTO, IDIOMA, FOTO, PEDIDO, IA.
@objc(IaLocalPlugin)
public class IaLocalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IaLocalPlugin"
    public let jsName = "IaLocal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "disponible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preparar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "leerTexto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preguntar", returnType: CAPPluginReturnPromise)
    ]

    /// Lo mismo que el sistema le dice a cada app: el modelo de Apple tiene una ventana de 4.096 tokens (pedido + respuesta).
    private static let contexto = 4096
    private static let instrucciones = """
        Eres un profesor chileno cercano y muy claro que ayuda a estudiantes de 10 a 18 años a repasar. \
        Usas solo lo que dice el material que te pasan y sigues exactamente el formato que se te pide, sin agregar nada más.
        """

    @objc func disponible(_ call: CAPPluginCall) {
        var r: [String: Any] = ["plataforma": "ios", "modelo": "apple", "ocr": true, "texto": false, "motivo": "version", "contexto": Self.contexto]
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let (lista, motivo) = Self.estadoDelModelo()
            r["texto"] = lista
            r["motivo"] = motivo
        }
        #endif
        call.resolve(r)
    }

    @objc func preparar(_ call: CAPPluginCall) {
        call.resolve([:])
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func estadoDelModelo() -> (Bool, String) {
        switch SystemLanguageModel.default.availability {
        case .available:
            return (true, "")
        case .unavailable(let razon):
            switch razon {
            case .deviceNotEligible: return (false, "dispositivo")
            case .appleIntelligenceNotEnabled: return (false, "desactivada")
            case .modelNotReady: return (false, "descargando")
            @unknown default: return (false, "otro")
            }
        @unknown default:
            return (false, "otro")
        }
    }
    #endif

    @objc func preguntar(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"), !prompt.isEmpty else {
            return call.reject("Falta el pedido.", "PEDIDO")
        }
        let maxTokens = max(1, min(call.getInt("maxTokens") ?? 800, 3000))
        let temperatura = max(0, min(call.getDouble("temperatura") ?? 0.3, 1))
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            guard case .available = SystemLanguageModel.default.availability else {
                return call.reject("La IA de este teléfono no está disponible.", "NO_DISPONIBLE")
            }
            Task {
                do {
                    // Una sesión nueva por pedido: el motor manda todo lo necesario y así el contexto no se acumula.
                    let sesion = LanguageModelSession(instructions: Self.instrucciones)
                    let opciones = GenerationOptions(temperature: temperatura, maximumResponseTokens: maxTokens)
                    let respuesta = try await sesion.respond(to: prompt, options: opciones)
                    call.resolve(["texto": respuesta.content])
                } catch let error as LanguageModelSession.GenerationError {
                    switch error {
                    case .guardrailViolation: call.reject("Los filtros de la IA no dejaron responder.", "FILTRO")
                    case .exceededContextWindowSize: call.reject("El pedido es muy largo para la IA del teléfono.", "CONTEXTO")
                    case .unsupportedLanguageOrLocale: call.reject("La IA del teléfono no entiende este idioma.", "IDIOMA")
                    default: call.reject(error.localizedDescription, "IA")
                    }
                } catch {
                    call.reject(error.localizedDescription, "IA")
                }
            }
            return
        }
        #endif
        call.reject("La IA de este teléfono no está disponible.", "NO_DISPONIBLE")
    }

    @objc func leerTexto(_ call: CAPPluginCall) {
        guard let ruta = call.getString("ruta"), let url = Self.archivoDeLaApp(ruta) else {
            return call.reject("Falta la foto.", "FOTO")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let imagen = UIImage(contentsOfFile: url.path), let cg = imagen.cgImage else {
                return call.reject("No pude abrir la foto.", "FOTO")
            }
            let pedido = VNRecognizeTextRequest()
            pedido.recognitionLevel = .accurate
            pedido.usesLanguageCorrection = true
            pedido.recognitionLanguages = ["es-ES", "en-US"]
            let manejador = VNImageRequestHandler(cgImage: cg, orientation: Self.orientacion(imagen.imageOrientation), options: [:])
            do {
                try manejador.perform([pedido])
                call.resolve(["texto": Self.enOrdenDeLectura(pedido.results ?? [])])
            } catch {
                call.reject("No pude leer la foto.", "FOTO")
            }
        }
    }

    /// Solo archivos dentro de la app (las fotos que la app misma guardó): nada de rutas a otras partes del teléfono.
    private static func archivoDeLaApp(_ ruta: String) -> URL? {
        let url = ruta.hasPrefix("file://") ? URL(string: ruta) : URL(fileURLWithPath: ruta)
        guard let limpia = url?.standardizedFileURL.resolvingSymlinksInPath() else { return nil }
        let casa = URL(fileURLWithPath: NSHomeDirectory()).standardizedFileURL.resolvingSymlinksInPath().path
        return limpia.path.hasPrefix(casa + "/") ? limpia : nil
    }

    /// Vision entrega los trozos de texto sin un orden garantizado: se arman líneas (de arriba hacia abajo) y, dentro de cada una,
    /// de izquierda a derecha. En Vision, y crece hacia arriba.
    private static func enOrdenDeLectura(_ observaciones: [VNRecognizedTextObservation]) -> String {
        let trozos = observaciones.compactMap { o -> (caja: CGRect, texto: String)? in
            guard let t = o.topCandidates(1).first?.string, !t.isEmpty else { return nil }
            return (o.boundingBox, t)
        }.sorted { $0.caja.midY > $1.caja.midY }
        var lineas: [[(caja: CGRect, texto: String)]] = []
        for t in trozos {
            if let ultima = lineas.last?.last, abs(ultima.caja.midY - t.caja.midY) < min(ultima.caja.height, t.caja.height) * 0.5 {
                lineas[lineas.count - 1].append(t)
            } else {
                lineas.append([t])
            }
        }
        return lineas.map { linea in linea.sorted { $0.caja.minX < $1.caja.minX }.map { $0.texto }.joined(separator: " ") }.joined(separator: "\n")
    }

    private static func orientacion(_ o: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch o {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
