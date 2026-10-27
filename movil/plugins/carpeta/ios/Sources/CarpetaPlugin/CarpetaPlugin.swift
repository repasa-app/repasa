import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// Guardar y traer la copia cifrada de Repasa con el selector de archivos del sistema: la persona elige dónde (iCloud Drive,
/// Google Drive, En mi iPhone…). Repasa no se conecta a ninguna nube: el sistema guarda el archivo donde la persona dijo.
/// La copia ya viene cifrada desde el motor JS (motor/copia.js); aquí solo se escribe y se lee el texto.
///
/// JS: Carpeta.exportar({nombre, texto}) → {ok}      Carpeta.importar() → {texto}      Cancelar: error con código CANCELADO.
@objc(CarpetaPlugin)
public class CarpetaPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "CarpetaPlugin"
    public let jsName = "Carpeta"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "exportar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importar", returnType: CAPPluginReturnPromise)
    ]

    private static let maximo = 300 * 1024 * 1024 // una copia con muchas fotos puede ser grande, pero no infinita
    private var llamada: CAPPluginCall?
    private var exportando = false
    private var temporal: URL?

    @objc func exportar(_ call: CAPPluginCall) {
        guard let texto = call.getString("texto") else { return call.reject("Falta la copia.", "COPIA") }
        let nombre = Self.nombreSeguro(call.getString("nombre") ?? "Repasa-copia.repasa")
        let carpeta = FileManager.default.temporaryDirectory.appendingPathComponent("repasa-copia-\(UUID().uuidString)", isDirectory: true)
        let url = carpeta.appendingPathComponent(nombre)
        do {
            try FileManager.default.createDirectory(at: carpeta, withIntermediateDirectories: true)
            try texto.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            return call.reject("No se pudo preparar la copia.", "COPIA")
        }
        DispatchQueue.main.async {
            guard self.llamada == nil, let vista = self.bridge?.viewController else {
                try? FileManager.default.removeItem(at: carpeta)
                return call.reject("Ya hay un selector abierto.", "OCUPADO")
            }
            self.llamada = call
            self.exportando = true
            self.temporal = carpeta
            let selector = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            selector.delegate = self
            vista.present(selector, animated: true)
        }
    }

    @objc func importar(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.llamada == nil, let vista = self.bridge?.viewController else { return call.reject("Ya hay un selector abierto.", "OCUPADO") }
            self.llamada = call
            self.exportando = false
            let selector = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.data], asCopy: true)
            selector.allowsMultipleSelection = false
            selector.delegate = self
            vista.present(selector, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = llamada else { return }
        llamada = nil
        if exportando {
            limpiar()
            return call.resolve(["ok": true])
        }
        guard let url = urls.first else { return call.reject("cancelado", "CANCELADO") }
        DispatchQueue.global(qos: .userInitiated).async {
            defer { try? FileManager.default.removeItem(at: url) } // asCopy: es una copia dentro de la app
            // El tamaño puede faltar: se lee con tope igual (nunca más de `maximo` bytes en memoria).
            let tamano = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            guard tamano <= Self.maximo, let manija = try? FileHandle(forReadingFrom: url) else {
                return call.reject("No se pudo abrir el archivo.", "ARCHIVO")
            }
            defer { try? manija.close() }
            guard let datos = try? manija.read(upToCount: Self.maximo + 1), datos.count <= Self.maximo,
                  let texto = String(data: datos, encoding: .utf8) else {
                return call.reject("No se pudo abrir el archivo.", "ARCHIVO")
            }
            call.resolve(["texto": texto])
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        if exportando { limpiar() }
        llamada?.reject("cancelado", "CANCELADO")
        llamada = nil
    }

    private func limpiar() {
        if let t = temporal { try? FileManager.default.removeItem(at: t) }
        temporal = nil
    }

    private static func nombreSeguro(_ nombre: String) -> String {
        let permitido = nombre.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || "._-".unicodeScalars.contains($0) }
        let limpio = String(String.UnicodeScalarView(permitido))
        return limpio.isEmpty || limpio.hasPrefix(".") ? "Repasa-copia.repasa" : limpio
    }
}
