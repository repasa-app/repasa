// swift-tools-version:5.10
import PackageDescription

// Repasa para Mac: la app nativa genérica de Pieza (host-mac) con la interfaz de ui/ y los scripts de bin/ (Python portátil adentro).
let package = Package(
    name: "Repasa",
    platforms: [.macOS("15.0")],
    targets: [
        .executableTarget(name: "Repasa", dependencies: ["PiezaHost", "PiezaActualizaciones"], path: "Sources/Repasa"),
        // Pieza «host-mac» (de Pieza: no se edita a mano): la ventana, el puente con sus guardas, config e idioma desde app.json,
        // menús, apariencia y las acciones declaradas en acciones.json. Repasa le registra lo suyo en RepasaApp.swift.
        .target(name: "PiezaHost", path: "Sources/PiezaHost"),
        // Pieza «actualizaciones» (de Pieza: no se edita a mano). Repasa la configura con su repo y su nombre.
        .target(name: "PiezaActualizaciones", path: "Sources/PiezaActualizaciones"),
    ]
)
