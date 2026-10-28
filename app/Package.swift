// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "Repasa",
    platforms: [.macOS("15.0")],
    targets: [
        .executableTarget(name: "Repasa", path: "Sources/Repasa"),
    ]
)
