// Ícono de la app de Mac (app/Repasa.icns) a partir del logo (ui/favicon.svg), con la cuadrícula de íconos de macOS: el dibujo
// ocupa 824 de 1024 px, centrado, con aire alrededor. El .icns se arma aquí mismo (PNG por tamaño), sin herramientas de Apple.
// Uso (solo cuando cambia el logo): PLAYWRIGHT=/ruta/a/playwright node herramientas/icono_mac.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const logo = fs.readFileSync(path.join(RAIZ, "ui", "favicon.svg"), "utf8").replace("<svg ", '<svg width="100%" height="100%" ');

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
async function png(lado) {
  const dibujo = Math.round(lado * 824 / 1024), margen = (lado - dibujo) / 2;
  await pagina.setViewportSize({ width: lado, height: lado });
  await pagina.setContent(`<html><body style="margin:0;width:${lado}px;height:${lado}px;overflow:hidden;background:transparent">
    <div style="position:absolute;left:${margen}px;top:${margen}px;width:${dibujo}px;height:${dibujo}px">${logo}</div></body></html>`);
  return pagina.screenshot({ omitBackground: true });
}
// Tipos del formato ICNS (cada uno guarda un PNG): 16, 32, 64, 128, 256, 512 y 1024 px (los @2x reusan los tamaños).
const TIPOS = [["icp4", 16], ["icp5", 32], ["ic11", 32], ["icp6", 64], ["ic12", 64], ["ic07", 128], ["ic13", 256], ["ic08", 256], ["ic14", 512], ["ic09", 512], ["ic10", 1024]];
const hechos = {};
const partes = [];
for (const [tipo, lado] of TIPOS) {
  hechos[lado] ??= await png(lado);
  const cabeza = Buffer.alloc(8);
  cabeza.write(tipo, 0, "ascii");
  cabeza.writeUInt32BE(hechos[lado].length + 8, 4);
  partes.push(cabeza, hechos[lado]);
}
const cuerpo = Buffer.concat(partes), cabeza = Buffer.alloc(8);
cabeza.write("icns", 0, "ascii");
cabeza.writeUInt32BE(cuerpo.length + 8, 4);
fs.writeFileSync(path.join(RAIZ, "app", "Repasa.icns"), Buffer.concat([cabeza, cuerpo]));
await navegador.close();
console.log(`✓ app/Repasa.icns (${TIPOS.length} tamaños)`);
