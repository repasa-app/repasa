// Genera las imágenes de la página y del README (docs/img y docs/) con la interfaz y datos ficticios de ui/demo.json:
// capturas a escritorio y a 390 px (claro y oscuro), logo (sirve de avatar de la organización), apple-touch-icon e imagen para compartir.
// Uso: PLAYWRIGHT=/ruta/a/playwright node herramientas/imagenes.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const servidor = http.createServer((q, r) => {
  const ruta = path.join(RAIZ, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": tipos[path.extname(ruta)] || "application/octet-stream" });
  fs.createReadStream(ruta).pipe(r);
}).listen(0);
const URL_BASE = `http://localhost:${servidor.address().port}`;
const IMG = path.join(RAIZ, "docs", "img");
fs.mkdirSync(IMG, { recursive: true });
const navegador = await chromium.launch();

// Capturas a escritorio y a 390 px, en claro y oscuro: el inicio de un perfil y una pregunta respondida.
const capturas = [];
for (const [esquema, sufijo] of [["light", ""], ["dark", "-oscuro"]]) {
  capturas.push([`app-inicio${sufijo}`, 1280, 800, 1, esquema, []], [`app-pregunta${sufijo}`, 1280, 640, 1, esquema, ['[data-accion="empezar"]', "tecla:2"]],
    [`app-celular${sufijo}`, 390, 844, 2, esquema, []], [`app-pregunta-celular${sufijo}`, 390, 844, 2, esquema, ['[data-accion="empezar"]', "tecla:2"]]);
}
for (const [archivo, ancho, alto, escala, esquema, pasos] of capturas) {
  const p = await navegador.newPage({ viewport: { width: ancho, height: alto }, colorScheme: esquema, deviceScaleFactor: escala });
  await p.goto(`${URL_BASE}/ui/index.html?idioma=es&perfil=martina`);
  await p.waitForSelector(".barra");
  for (const sel of pasos) { if (sel.startsWith("tecla:")) await p.keyboard.press(sel.slice(6)); else await p.click(sel); await p.waitForTimeout(350); }
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(IMG, `${archivo}.png`) });
  await p.close();
}

const svg = fs.readFileSync(path.join(RAIZ, "ui", "favicon.svg"), "utf8");
for (const [lado, destino] of [[512, path.join(IMG, "logo.png")], [180, path.join(RAIZ, "docs", "apple-touch-icon.png")]]) {
  const p = await navegador.newPage({ viewport: { width: lado, height: lado } });
  await p.setContent(`<style>html,body{margin:0;background:#2f5bea}svg{width:${lado}px;height:${lado}px;display:block}</style>${svg.replace('rx="16"', 'rx="0"')}`);
  await p.screenshot({ path: destino });
  await p.close();
}

// Imagen para compartir (1200×630): nombre, frase y una captura con datos ficticios.
const captura = fs.readFileSync(path.join(IMG, "app-inicio.png")).toString("base64");
const p = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(`<style>
  body{margin:0;width:1200px;height:630px;background:#f7f5ef;background-image:linear-gradient(rgba(70,110,200,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(70,110,200,.08) 1px,transparent 1px);background-size:26px 26px;color:#1d2333;font-family:ui-rounded,"SF Pro Rounded","Nunito",-apple-system,"Segoe UI",system-ui,sans-serif;overflow:hidden;position:relative}
  .txt{position:absolute;left:64px;top:70px;width:480px}
  .marca{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:900}
  .marca svg{width:58px;height:58px}
  h1{font-size:54px;line-height:1.04;margin:34px 0 18px;letter-spacing:-.02em;font-weight:900}
  mark{background:linear-gradient(transparent 55%,#ffd84d 55%);color:inherit;padding:0 4px}
  p{font-size:23px;color:#5d6475;margin:0;line-height:1.4}
  .chips{margin-top:28px;display:flex;gap:10px;flex-wrap:wrap}
  .chips span{font-size:17px;font-weight:700;padding:7px 14px;border-radius:99px;border:2px solid #e6e2d6;background:#fffefa}
  .mac{position:absolute;left:590px;top:62px;width:760px;border-radius:20px;box-shadow:0 30px 80px rgba(29,35,51,.18);border:2px solid #e6e2d6}
  .cel{position:absolute;left:955px;top:150px;width:205px;border-radius:30px;border:7px solid #1d2333;box-shadow:0 30px 70px rgba(29,35,51,.3)}
</style>
<div class="txt"><div class="marca">${svg}<span>Repasa</span></div>
<h1>De la foto del cuaderno a la <mark>prueba preparada</mark></h1>
<p>Resumen fácil, preguntas tipo prueba y tarjetas. En el computador y en el celular. 5°&nbsp;básico a 4°&nbsp;medio.</p>
<div class="chips"><span>Gratis</span><span>Código abierto</span><span>Sin cuentas</span></div></div>
<img class="mac" src="data:image/png;base64,${captura}">
<img class="cel" src="data:image/png;base64,${fs.readFileSync(path.join(IMG, "app-pregunta-celular.png")).toString("base64")}">`);
await p.screenshot({ path: path.join(IMG, "compartir.png") });
await navegador.close();
servidor.close();
console.log("✓ Imágenes en docs/img y docs/apple-touch-icon.png");
