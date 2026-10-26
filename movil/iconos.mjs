// Íconos y pantallas de carga de la app del celular a partir del logo (ui/favicon.svg), para no mostrar los de Capacitor.
// Uso (solo cuando cambia el logo): PLAYWRIGHT=/ruta/a/playwright node movil/iconos.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const logo = fs.readFileSync(path.join(AQUI, "..", "ui", "favicon.svg"), "utf8");
const dibujo = logo.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "").replace(/<rect[^>]*\/>/, ""); // el libro, sin el fondo
const AZUL = "#2f5bea", PAPEL = "#f7f5ef";
const svg = (contenido, fondo = "none") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%">${fondo}${contenido}</svg>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
async function png(destino, ancho, alto, html, transparente = false) {
  await pagina.setViewportSize({ width: ancho, height: alto });
  await pagina.setContent(`<html><body style="margin:0;width:${ancho}px;height:${alto}px;overflow:hidden;background:${transparente ? "transparent" : PAPEL}">${html}</body></html>`);
  await pagina.screenshot({ path: path.join(AQUI, destino), omitBackground: transparente });
}
const centrado = (lado, ancho, alto, contenido) => `<div style="position:absolute;left:${(ancho - lado) / 2}px;top:${(alto - lado) / 2}px;width:${lado}px;height:${lado}px">${contenido}</div>`;

// iOS: un cuadrado sin esquinas (el sistema las redondea) y la pantalla de carga.
await png("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024, svg(dibujo, `<rect width="64" height="64" fill="${AZUL}"/>`));
for (const n of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"])
  await png(`ios/App/App/Assets.xcassets/Splash.imageset/${n}`, 2732, 2732, centrado(420, 2732, 2732, logo));

// Android: ícono adaptable (dibujo en la zona segura de 66/108) + ícono clásico y redondo, y pantallas de carga.
const DENSIDADES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(DENSIDADES)) {
  const lado = Math.round(108 * f), base = Math.round(48 * f);
  await png(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, lado, lado, centrado(Math.round(lado * 0.62), lado, lado, svg(dibujo)), true);
  await png(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, base, base, logo.replace("<svg ", '<svg width="100%" height="100%" '), true);
  await png(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, base, base, svg(dibujo, `<circle cx="32" cy="32" r="32" fill="${AZUL}"/>`), true);
}
const PANTALLAS = { "drawable/splash.png": [480, 320], ...Object.fromEntries(Object.entries({ mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] })
  .flatMap(([d, [a, b]]) => [[`drawable-port-${d}/splash.png`, [a, b]], [`drawable-land-${d}/splash.png`, [b, a]]])) };
for (const [ruta, [a, b]] of Object.entries(PANTALLAS)) await png(`android/app/src/main/res/${ruta}`, a, b, centrado(Math.round(Math.min(a, b) * 0.28), a, b, logo));
fs.writeFileSync(path.join(AQUI, "android/app/src/main/res/values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${AZUL.toUpperCase()}</color>\n</resources>\n`);
await navegador.close();
console.log("✓ Íconos y pantallas de carga");
