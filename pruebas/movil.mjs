// La app del celular de punta a punta en un navegador, con el anfitrión del teléfono (movil/host) y un Capacitor falso
// (pruebas/capacitor_falso.js: archivos en memoria, una foto ficticia y una IA falsa). Nada toca archivos reales ni la red.
// Uso: node pruebas/movil.mjs   (necesita Playwright, como pruebas/interfaz.mjs)
// Revisa: primer uso en un teléfono vacío; foto → texto (OCR) → IA del teléfono → tema validado y guardado con su foto;
// «No entendí» con la IA del teléfono; tema a mano; catálogo; teléfono sin IA; copia cifrada que se guarda y se trae a otro teléfono.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const WEB = fs.mkdtempSync(path.join(os.tmpdir(), "repasa-www-"));
execFileSync(process.execPath, [path.join(RAIZ, "movil", "armar.mjs"), "--salida", WEB], { stdio: "ignore" });
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const servidor = http.createServer((q, r) => {
  const ruta = path.join(WEB, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!ruta.startsWith(WEB) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": tipos[path.extname(ruta)] || "application/octet-stream" }); fs.createReadStream(ruta).pipe(r);
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}/index.html`;
const FALSO = fs.readFileSync(path.join(RAIZ, "pruebas", "capacitor_falso.js"), "utf8");
const demo = fs.readFileSync(path.join(RAIZ, "ui", "demo.json"), "utf8");
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };
const navegador = await chromium.launch();
// Cualquier bloqueo de la Content-Security-Policy es un error: la interfaz tiene que funcionar entera con ella.
const abrirPagina = navegador.newPage.bind(navegador);
navegador.newPage = async (opciones) => {
  const p = await abrirPagina(opciones);
  p.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) falla("CSP: " + m.text().slice(0, 200)); });
  return p;
};

/** Un teléfono: `semilla` = datos de demo.json (o nada: teléfono nuevo); `antes` corre antes de la página (p. ej. sin IA). */
async function telefono({ semilla = true, antes = null, consulta = "" } = {}) {
  const p = await navegador.newPage({ viewport: { width: 390, height: 844 }, locale: "es-CL" });
  p.on("pageerror", (e) => falla("error de JavaScript: " + e.message));
  if (semilla) await p.addInitScript((d) => { window._semilla = JSON.parse(d); }, demo);
  if (antes) await p.addInitScript(antes);
  await p.addInitScript(FALSO);
  await p.goto(BASE + consulta);
  await p.waitForFunction(() => window.Repasa && document.querySelector(".barra"));
  return p;
}
const archivos = (p) => p.evaluate(() => [...window._fs.keys()].sort());
const leer = (p, r) => p.evaluate((r) => { const x = window._fs.get("Repasa/" + r); return x ? JSON.parse(x.data) : null; }, r);
async function paso(nombre, f) {
  const antes = errores.length;
  try { await f(); } catch (e) { falla(`${nombre}: ${e.message.split("\n")[0]}`); }
  if (errores.length === antes) console.log("  ✓ " + nombre);
}

await paso("Teléfono nuevo: idioma primero, la IA del teléfono, perfil y a estudiar", async () => {
  const p = await telefono({ semilla: false });
  await p.waitForSelector("[data-idioma]");
  if (await p.$(".perfiles")) falla("se ve algo antes de elegir el idioma");
  await p.click('[data-idioma="es"]');
  await p.click('[data-bv="2"]');
  const ia = await p.textContent(".pz-dialogo");
  if (!ia.includes("Apple Intelligence") || !ia.includes("IA del propio teléfono")) falla("el paso de la IA no habla de la IA del teléfono: " + ia.slice(0, 200));
  if (/Claude|Codex|instalarla/.test(ia)) falla("en el teléfono se ofrecen IA de computador");
  await p.click('[data-accion="bv-fin"]');
  await p.click('[data-accion="nuevo-perfil"]');
  await p.fill("#nombre-perfil", "Martina");
  await p.click('[data-accion="guardar-perfil"]');
  await p.waitForSelector(".saludo");
  await p.waitForFunction(() => window._fs.has("Repasa/perfiles.json"), null, { timeout: 3000 }).catch(async () => falla("archivos: " + (await archivos(p)).join(", ")));
  const perfiles = await leer(p, "perfiles.json"), config = await leer(p, ".repasa/config.json");
  if (perfiles?.[0]?.nombre !== "Martina" || !/^martina-[a-z0-9]+$/.test(perfiles[0].id)) falla("no guardó el perfil: " + JSON.stringify(perfiles));
  if (config?.idioma_ui !== "es" || config?.bienvenida !== true) falla("no guardó idioma y bienvenida: " + JSON.stringify(config));
  await p.close();
});

await paso("Foto del cuaderno → texto → IA del teléfono → tema guardado con su foto", async () => {
  const p = await telefono({ consulta: "?perfil=martina" });
  await p.click('.accion-inferior [data-accion="nuevo-tema"]');
  await p.click('[data-accion="elegir-material"][data-origen="camara"]');
  await p.waitForSelector(".archivo");
  await p.click('[data-accion="elegir-material"][data-origen="galeria"]');
  await p.waitForFunction(() => document.querySelectorAll(".archivo").length === 3);
  await p.click('[data-accion="crear-tema"]');
  await p.waitForSelector('[data-accion="guardar-tema"]', { timeout: 5000 });
  const pedidos = await p.evaluate(() => window._pedidosIA);
  if (!pedidos.some((x) => x.includes("[foto-") || x.includes("La Primera Junta. Rancagua"))) falla("la IA no recibió el texto leído de las fotos");
  if (pedidos.some((x) => /Martina|martina/.test(x))) falla("la IA vio el nombre del perfil");
  await p.click('[data-accion="guardar-tema"]');
  await p.waitForSelector(".cab-tema");
  const t = await leer(p, "temas/la-patria-vieja/tema.json");
  if (!t || t.autor !== "ia" || t.curso !== "6b" || t.preguntas.length < 3 || JSON.stringify(t.fuente) !== '["material-1.jpg","material-2.jpg","material-3.jpg"]') falla("tema guardado: " + JSON.stringify(t)?.slice(0, 300));
  const lista = await archivos(p);
  if (!lista.includes("Repasa/temas/la-patria-vieja/material/material-3.jpg")) falla("no guardó las fotos con el tema");
  if (lista.some((x) => x.includes(".repasa/temporal/") || x.includes(".tmp-"))) falla("quedaron temporales: " + lista.filter((x) => /temporal|tmp-/.test(x)));
  await p.click('[data-pestana="material"]');
  const src = await p.getAttribute(".material img", "src");
  if (!src?.includes("/temas/la-patria-vieja/material/material-1.jpg")) falla("la foto del material no apunta al archivo guardado: " + src);
  await p.close();
});

await paso("«No entendí» con la IA del teléfono (texto limpio, sin HTML)", async () => {
  const p = await telefono({ consulta: "?perfil=martina" });
  await p.click('[data-tema="independencia-de-chile"]');
  await p.click("[data-practicar]");
  for (let i = 0; i < 12 && !(await p.$('[data-accion="no-entendi"]')); i++) {
    if (await p.$("#respuesta:not([disabled])")) { await p.fill("#respuesta", "zzz"); await p.keyboard.press("Enter"); }
    else if (await p.$('[data-responder="false"]:not([disabled])')) await p.click('[data-responder="false"]');
    else await p.click('[data-responder]:not([disabled])');
    if (!(await p.$('[data-accion="no-entendi"]'))) await p.click("#siguiente");
  }
  await p.click('[data-accion="no-entendi"]');
  await p.waitForFunction(() => document.querySelector(".retro .otra")?.textContent.includes("carrera de postas"));
  const html = await p.innerHTML(".retro .otra");
  if (/<b>|##|\*\*/.test(html)) falla("la explicación trae Markdown o HTML: " + html);
  await p.close();
});

await paso("Tema a mano (sin IA): problemas en palabras simples, después se guarda", async () => {
  const p = await telefono({ consulta: "?perfil=martina" });
  await p.click('.accion-inferior [data-accion="nuevo-tema"]');
  await p.click('[data-modo="mano"]');
  await p.fill("#mano-titulo", "Fracciones de mi cuaderno");
  await p.fill("#mano-preguntas", "¿Cuánto es 1/2 + 1/2?\n* 1\n- 2\n\nSin marcar");
  await p.click('[data-accion="revisar-a-mano"]');
  await p.waitForSelector(".problemas");
  const problemas = await p.textContent(".problemas");
  if (!problemas.includes("Pregunta 1:") || !problemas.includes("Pregunta 2:")) falla("los problemas no se ven por pregunta: " + problemas);
  if ((await p.inputValue("#mano-titulo")) !== "Fracciones de mi cuaderno") falla("se perdió lo escrito al mostrar los problemas");
  await p.fill("#mano-preguntas", "¿Cuánto es 1/2 + 1/2?\n* 1\n- 2\n- 1/4\n\n2/4 es igual a 1/2.\n* Verdadero\n\nEl número de abajo se llama ___.\n* denominador");
  await p.fill("#mano-conceptos", "Numerador: el número de arriba.");
  await p.click('[data-accion="revisar-a-mano"]');
  await p.waitForSelector('[data-accion="guardar-tema"]');
  await p.click('[data-accion="guardar-tema"]');
  await p.waitForSelector(".cab-tema");
  const t = await leer(p, "temas/fracciones-de-mi-cuaderno/tema.json");
  if (!t || t.preguntas.length !== 3 || t.tarjetas.length !== 1 || t.autor || t.fuente) falla("tema a mano: " + JSON.stringify(t)?.slice(0, 300));
  await p.close();
});

await paso("Catálogo incluido: agregar un tema de ejemplo", async () => {
  const p = await telefono({ consulta: "?perfil=martina", antes: () => { window._semilla.temas = window._semilla.temas.slice(0, 1); } });
  await p.click('.accion-inferior [data-accion="nuevo-tema"]');
  await p.click('[data-modo="catalogo"]');
  const ids = await p.$$eval("[data-catalogo]", (b) => b.map((x) => x.dataset.catalogo));
  if (ids.includes("independencia-de-chile") || !ids.includes("fracciones")) falla("el catálogo debe mostrar solo lo que falta: " + ids);
  await p.click('[data-catalogo="fracciones"]');
  await p.waitForSelector(".cab-tema");
  if (!(await leer(p, "temas/fracciones/tema.json"))) falla("no guardó el tema del catálogo");
  await p.close();
});

await paso("Teléfono sin IA: lo dice claro y deja crear a mano o del catálogo", async () => {
  const p = await telefono({ consulta: "?perfil=martina", antes: () => { window._ia = { texto: false, ocr: true, motivo: "dispositivo", plataforma: "ios", contexto: 4096 }; } });
  await p.click('.accion-inferior [data-accion="nuevo-tema"]');
  const txt = await p.textContent(".pz-dialogo");
  if (!txt.includes("no tiene IA propia") || !txt.includes("iPhone 15 Pro")) falla("no explica por qué no hay IA: " + txt.slice(0, 200));
  if (await p.$('[data-accion="crear-tema"]')) falla("muestra «Armar mi repaso» sin IA");
  await p.click('.botones-foto [data-modo="mano"]');
  await p.waitForSelector("#mano-titulo");
  await p.click('[data-accion="cerrar"]');
  await p.click('[data-accion="adultos"]');
  await p.click('[data-pz-probar-ia="telefono"]');
  await p.waitForFunction(() => document.querySelector(".pz-dialogo")?.textContent.includes("iPhone 15 Pro"));
  await p.close();
});

await paso("Copia cifrada: se guarda sin dejar ver nada y se trae a otro teléfono", async () => {
  const p = await telefono({ consulta: "?perfil=martina" });
  await p.click('[data-accion="adultos"]');
  await p.fill("#frase-copia", "corta");
  await p.click('[data-accion="guardar-copia"]');
  await p.waitForFunction(() => document.querySelector(".estado-copia")?.textContent.includes("12 caracteres"));
  await p.fill("#frase-copia", "pino lluvia tetera azul");
  await p.click('[data-accion="guardar-copia"]');
  await p.waitForFunction(() => document.querySelector(".estado-copia")?.textContent.includes("Copia guardada"), null, { timeout: 15000 });
  const exportado = await p.evaluate(() => window._exportado);
  if (!/^Repasa-copia-\d{4}-\d{2}-\d{2}\.repasa$/.test(exportado?.nombre || "")) falla("nombre del archivo: " + exportado?.nombre);
  if (/Martina|martina|Diego|independencia|Patria/.test(exportado.texto)) falla("la copia deja ver nombres o temas");
  if ((await p.inputValue("#frase-copia")) !== "") falla("la frase quedó escrita después de guardar");
  await p.close();
  // Otro teléfono, vacío: con la frase equivocada no abre; con la correcta junta todo.
  const q = await telefono({ semilla: false, antes: (t) => { window._exportado = { texto: t }; }, consulta: "" });
  await q.evaluate((t) => { window._exportado = { texto: t }; }, exportado.texto);
  await q.waitForSelector("[data-idioma]");
  await q.click('[data-idioma="es"]');
  await q.click('[data-accion="bv-fin"]');
  await q.click('[data-accion="adultos"]');
  await q.fill("#frase-copia", "pino lluvia tetera roja");
  await q.click('[data-accion="traer-copia"]');
  await q.waitForFunction(() => document.querySelector(".estado-copia")?.textContent.includes("La frase no es la correcta"), null, { timeout: 15000 });
  if ((await leer(q, "perfiles.json"))) falla("con la frase equivocada se escribió algo");
  await q.fill("#frase-copia", "pino lluvia tetera azul");
  await q.click('[data-accion="traer-copia"]');
  await q.waitForFunction(() => document.querySelector(".estado-copia")?.textContent.includes("Nada se borró"), null, { timeout: 15000 });
  const perfiles = await leer(q, "perfiles.json"), temas = (await archivos(q)).filter((x) => x.endsWith("tema.json"));
  if (perfiles?.length !== 2 || temas.length !== 4) falla(`después de traer la copia: ${perfiles?.length} perfiles, ${temas.length} temas`);
  if (await leer(q, ".repasa/config.json").then((c) => c?.ia_frase || c?.frase)) falla("la frase quedó guardada en los ajustes");
  await q.click('[data-accion="cerrar"]');
  if ((await q.$$("[data-perfil]")).length !== 2) falla("la interfaz no se actualizó con los perfiles traídos");
  await q.close();
});

await paso("Cancelar la cámara no rompe nada", async () => {
  const p = await telefono({ consulta: "?perfil=martina", antes: () => { window._camaraCancela = true; } });
  await p.click('.accion-inferior [data-accion="nuevo-tema"]');
  await p.click('[data-accion="elegir-material"][data-origen="camara"]');
  await p.waitForTimeout(200);
  if (await p.$(".archivo")) falla("apareció una foto después de cancelar");
  await p.close();
});

await navegador.close();
servidor.close();
fs.rmSync(WEB, { recursive: true, force: true });
if (errores.length) { console.log(`\n✗ ${errores.length} problemas en la app del celular`); process.exit(1); }
console.log("✓ App del celular OK");
