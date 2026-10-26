// swift-tools-version: 5.9
// La IA del propio iPhone para Repasa (lo usa Capacitor con Swift Package Manager; ver movil/README.md).
import PackageDescription

let package = Package(
    name: "RepasaIaLocal",
    platforms: [.iOS(.v14)],
    products: [
        .library(name: "RepasaIaLocal", targets: ["IaLocalPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")
    ],
    targets: [
        .target(
            name: "IaLocalPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/IaLocalPlugin")
    ]
)
