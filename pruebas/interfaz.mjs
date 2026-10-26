// Pruebas de la interfaz (ui/) en un navegador real con los datos ficticios de ui/demo.json.
// Uso: node pruebas/interfaz.mjs   (necesita Playwright; PLAYWRIGHT=/ruta/a/playwright si no está instalado aquí)
//      MOVIL=1 node pruebas/interfaz.mjs   lo mismo con la app del celular: www/ armada por movil/armar.mjs, el anfitrión del teléfono
//      (movil/host) y un Capacitor falso (pruebas/capacitor_falso.js) con los datos ficticios de demo.json.
// Revisa: 1) la lógica de ui/app.js da lo mismo que Python (pruebas/casos.json); 2) ninguna vista tira errores de JavaScript
// (español e inglés, escritorio y celular); 3) todo texto tiene traducción en ui/idiomas/en.json; 4) nada se sale de la pantalla a
// ancho de celular; 5) contraste del botón principal; 6) una sesión de repaso de punta a punta. Con CAPTURAS=carpeta guarda capturas.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT || "playwright");
const CAPTURAS = process.env.CAPTURAS || "";
const MOVIL = process.env.MOVIL === "1";
// Con MOVIL=1 se sirve la app del celular tal como queda en el teléfono (sin demo.json: los datos los pone el Capacitor falso).
const WEB = MOVIL ? fs.mkdtempSync(path.join(os.tmpdir(), "repasa-www-")) : path.join(RAIZ, "ui");
if (MOVIL) execFileSync(process.execPath, [path.join(RAIZ, "movil", "armar.mjs"), "--salida", WEB], { stdio: "ignore" });
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };
const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ttf": "font/ttf" };
function servir(q, r, ruta, tipo) {
  // Con rangos (Range), como GitHub Pages: sin esto el navegador no puede adelantar el video.
  const total = fs.statSync(ruta).size, m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || "");
  if (!m) { r.writeHead(200, { "Content-Type": tipo, "Content-Length": total, "Accept-Ranges": "bytes" }); return fs.createReadStream(ruta).pipe(r); }
  const i = m[1] ? Number(m[1]) : 0, f = m[2] ? Number(m[2]) : total - 1;
  r.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${i}-${f}/${total}`, "Content-Length": f - i + 1, "Accept-Ranges": "bytes" });
  fs.createReadStream(ruta, { start: i, end: f }).pipe(r);
}
const servidor = http.createServer((q, r) => {
  const ruta = path.join(WEB, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!ruta.startsWith(WEB) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) { r.writeHead(404); return r.end(); }
  servir(q, r, ruta, tipos[path.extname(ruta)] || "application/octet-stream");
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}/index.html`;
const demo = fs.readFileSync(path.join(RAIZ, "ui", "demo.json"), "utf8");
const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "casos.json"), "utf8"));
const esDato = (t) => demo.includes(t) || /^(Repasa|Claude|ChatGPT \(Codex\)|Gemini|Gemini Nano|Apple Intelligence|English|Español)$/.test(t);

const VISTAS = [
  ["perfiles", "E=>{E.perfil=null}"],
  ["inicio", "E=>{E.perfil='martina';E.vista='inicio'}"],
  ["inicio-sin-prueba", "E=>{E.pruebas=[]}"],
  ["inicio-al-dia", "E=>{E._t=E.temas;E.temas=E.temas.slice(0,1);Object.values(E.progreso.martina.preguntas).forEach(x=>x.proxima='2026-12-01');E.temas[0].preguntas.forEach(p=>E.progreso.martina.preguntas['independencia-de-chile/'+p.id]={caja:3,proxima:'2026-12-01'})}"],
  ["inicio-sin-temas", "E=>{E.perfil='diego'}"],
  ["tema-resumen", "E=>{E.temas=E._t||E.temas;E.perfil='martina';E.vista='tema';E.temaSel='independencia-de-chile';E.pestana='resumen'}"],
  ["tema-conceptos", "E=>{E.pestana='conceptos'}"],
  ["tema-tarjetas", "E=>{E.pestana='tarjetas';E.volteadas={1:true}}"],
  ["tema-material", "E=>{E.pestana='material'}"],
  ["sesion-alternativas", "E=>{E.sesion={claves:['independencia-de-chile/p1','independencia-de-chile/p2','independencia-de-chile/p4'],i:0,aciertos:0,puntos:0}}"],
  ["sesion-bien", "E=>{E.sesion.respuesta=0;E.sesion.correcta=true}"],
  ["sesion-vf-mal", "E=>{E.sesion.i=1;E.sesion.respuesta=false;E.sesion.correcta=false}"],
  ["sesion-explicando", "E=>{E.sesion.explicacion='cargando'}"],
  ["sesion-explicado", "E=>{E.sesion.explicacion='Piensa en una carrera de postas.'}"],
  ["sesion-completar", "E=>{E.sesion.i=2;delete E.sesion.respuesta;delete E.sesion.explicacion}"],
  ["sesion-fin", "E=>{E.sesion.fin=true;E.sesion.aciertos=2;E.sesion.puntos=22}"],
  ["sesion-fin-perfecta", "E=>{E.sesion.aciertos=3}"],
  ["nuevo-tema", "E=>{E.sesion=null;E.vista='inicio';E.nuevo={paso:'elegir',archivos:[{ruta:'/x/cuaderno.jpg',nombre:'cuaderno.jpg'}],texto:'',ramo:'auto',curso:'6b',error:'x'}}"],
  ["nuevo-creando", "E=>{E.nuevo.paso='creando'}"],
  ["nuevo-creando-avance", "E=>{E.nuevo.avance={paso:1,total:2,texto:'leer'}}"],
  ["nuevo-creando-armar", "E=>{E.nuevo.avance={paso:3,total:4,texto:'armar'}}"],
  ["nuevo-vista", "E=>{E.nuevo.paso='vista';E.nuevo.tema=E.temas[1];E.nuevo.avisos=['El material era largo y usé solo la primera parte. Para un tema largo, créalo en dos partes.']}"],
  ["nuevo-mano", "E=>{E.nuevo={paso:'elegir',modo:'mano',archivos:[],texto:'',ramo:'auto',curso:'6b',mano:{titulo:'Mi tema',ramo:'historia',curso:'6b',resumen:'',conceptos:'',preguntas:''}}}"],
  ["nuevo-mano-problemas", "E=>{E.nuevo.problemas=['Bloque 2: marca la respuesta correcta con *.','Bloque 3: en alternativas va una sola correcta (*) y en total de 3 a 5 opciones.','Bloque 4: falta la pregunta.','Bloque 5: no sé qué tipo de pregunta es (agrega opciones con -, ___ para completar, o * Verdadero / * Falso).','preguntas: entre 3 y 60.']}"],
  ["nuevo-mano-sin-titulo", "E=>{E.nuevo.problemas=[];E.nuevo.error='Escribe un título.'}"],
  ["nuevo-mano-vista", "E=>{E.nuevo.error='';E.nuevo.paso='vista';E.nuevo.desde='mano';E.nuevo.tema=E.temas[2]}"],
  ["nuevo-catalogo", "E=>{E.catalogo=[{id:'ejemplo-catalogo',titulo:'Tema de ejemplo',ramo:'ciencias',curso:'6b'}];E.nuevo={paso:'elegir',modo:'catalogo',archivos:[],mano:{}}}"],
  ["nuevo-catalogo-vacio", "E=>{E.catalogo=[]}"],
  ["nuevo-sin-ia", "E=>{E.catalogo=[];E.capacidades={ia:false,iaDetalle:'Este iPhone no tiene Apple Intelligence (hace falta un iPhone 15 Pro o más nuevo).'};E.nuevo={paso:'elegir',modo:'ia',archivos:[],texto:'',ramo:'auto',curso:'6b',mano:{}}}"],
  ["nuevo-error-ia", "E=>{E.capacidades={ia:true,copia:true};E.nuevo.error='La IA del teléfono no quiso responder con este material (sus filtros son estrictos). Prueba con otra foto o escríbelo a mano.'}"],
  ["prueba", "E=>{E.nuevo=null;E.prueba={ramo:'historia',temas:['independencia-de-chile'],fecha:'2026-10-30',id:'prueba-historia'}}"],
  ["perfil-nuevo", "E=>{E.prueba=null;E.perfilEdit={nombre:'',curso:'6b',avatar:'🦉',error:'x'}}"],
  ["adultos", "E=>{E.perfilEdit=null;E.adultos=true}"],
  ["adultos-al-dia", "E=>{E.buscando='alDia'}"],
  ["adultos-copia", "E=>{E.capacidades={ia:true,copia:true};E.copia={frase:'',estado:'guardada',cantidad:7,error:''}}"],
  ["adultos-copia-traida", "E=>{E.copia={frase:'',estado:'traida',resumen:{temas:2,progreso:1},error:''}}"],
  ["adultos-copia-error", "E=>{E.copia={frase:'x',estado:'',error:'La frase no es la correcta.'}}"],
  ["adultos-copia-guardando", "E=>{E.copia={frase:'x',estado:'guardando',error:''}}"],
  ["adultos-ia-no-lista", "E=>{E.copia={frase:'',estado:'',error:''};E.ias=[{id:'telefono',nombre:'La IA de este teléfono',instalada:false,detalle:'Activa Apple Intelligence en Ajustes del iPhone.'},{id:'computador',nombre:'El computador de la casa',instalada:false,detalle:'Muy pronto: el computador de la casa hará el trabajo con su IA, por la carpeta de la familia.'}];E.config.ia='telefono'}"],
  ["vacio", "E=>{E.adultos=false;E.perfiles=[];E.temas=[];E.perfil=null}"],
];
const navegador = await chromium.launch();
const FALSO = fs.readFileSync(path.join(RAIZ, "pruebas", "capacitor_falso.js"), "utf8");
/** Una página nueva; en MOVIL, con el Capacitor falso y los datos de demo.json (como si estuvieran en el teléfono). */
async function nuevaPagina(opciones) {
  const p = await navegador.newPage(opciones);
  if (MOVIL) { await p.addInitScript((d) => { window._semilla = JSON.parse(d); }, demo); await p.addInitScript(FALSO); }
  return p;
}

// 1) Lógica del repaso
{
  const p = await nuevaPagina();
  await p.goto(BASE); await p.waitForFunction(() => window.Repasa);
  const malos = await p.evaluate((c) => {
    const P = window.Repasa._pruebas, m = [], igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const k of c.cajas) { const r = P.actualizarCaja(k.antes, k.correcta, k.hoy); if (!igual(r, k.esperado)) m.push("cajas " + JSON.stringify(r)); }
    for (const [p_, resp, esp] of c.corregir) if (P.esCorrecta(p_, resp) !== esp) m.push(`corregir ${JSON.stringify(resp)} → ${!esp}`);
    for (const [pr, hoy, esp] of c.racha) if (P.actualizarRacha(pr, hoy) !== esp) m.push("racha " + JSON.stringify(pr));
    for (const caso of ["sin_prueba", "con_prueba"]) { const s = c.sesion, k = s[caso]; const r = P.elegirSesion(s.temas, s.progreso, s.hoy, k.pruebas, k.maximo); if (!igual(r, k.esperado)) m.push(caso + " " + JSON.stringify(r)); }
    return m;
  }, casos);
  malos.forEach((x) => falla("lógica del repaso: " + x));
  if (!malos.length) console.log("  ✓ Lógica del repaso (pruebas/casos.json)");
  // 6) Una sesión de punta a punta: elegir perfil, empezar, responder con el teclado, terminar
  await p.click('[data-perfil="martina"]');
  await p.click('[data-accion="empezar"]');
  let n = 0;
  while (await p.$(".pregunta") && n < 20) {
    if (await p.$("#respuesta:not([disabled])")) { await p.fill("#respuesta", "Rancagua"); await p.keyboard.press("Enter"); }
    else await p.keyboard.press("1");
    await p.waitForSelector("#siguiente"); await p.click("#siguiente"); n++;
  }
  const fin = await p.$(".fin");
  const prog = await p.evaluate(() => { let r; window.Repasa._probar((E) => { r = E.progreso.martina; }); return r; });
  if (!fin) falla("la sesión no llegó a la pantalla final");
  else if (!(prog.racha === 5 && prog.ultimo_dia && prog.sesiones.length === 6)) falla("la sesión no actualizó racha y sesiones: " + JSON.stringify({ racha: prog.racha, n: prog.sesiones.length }));
  else console.log(`  ✓ Sesión de punta a punta (${n} preguntas)`);
  await p.close();
}

// 7) Primer uso: lo primero es el idioma, antes de perfiles, ajustes o la IA. Elegir guarda idioma_ui y lo que sigue sale en ese idioma.
{
  const p = await nuevaPagina({ locale: "es-CL" });
  p.on("pageerror", (e) => falla(`error de JavaScript (idioma primero): ${e.message}`));
  // Como la app nativa: se anota lo que la interfaz manda por el puente (en MOVIL lo atiende el anfitrión del teléfono).
  if (!MOVIL) await p.addInitScript(() => { window._enviados = []; window.webkit = { messageHandlers: { repasa: { postMessage: (m) => window._enviados.push(m) } } }; });
  await p.goto(BASE + (MOVIL ? "?bienvenida" : ""));
  await p.waitForFunction(() => window.Repasa);
  const estadoDemo = JSON.parse(demo);
  if (MOVIL) await p.waitForSelector("[data-idioma]");
  else await p.evaluate((e) => window.Repasa.estado({ ...e, config: {} }), estadoDemo);
  const primera = await p.evaluate(() => ({
    titulo: document.querySelector(".dialogo h2")?.textContent || "", opciones: [...document.querySelectorAll("[data-idioma]")].map((b) => b.dataset.idioma),
    foco: document.activeElement?.dataset?.idioma, otros: !!document.querySelector(".perfiles, [data-accion='adultos'], [data-probar]"),
  }));
  if (!/Elige tu idioma/.test(primera.titulo) || !/Choose your language/.test(primera.titulo) || primera.opciones.join() !== "es,en") falla("con la bienvenida pendiente, la primera pantalla no es la de idioma: " + JSON.stringify(primera));
  else if (primera.otros) falla("se ve algo más (perfiles, ajustes o la IA) antes de elegir el idioma");
  else if (primera.foco !== "es") falla("el idioma del sistema (es-CL) no quedó enfocado como sugerido: " + primera.foco);
  else {
    await p.keyboard.press("2"); // 2 = English
    await p.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector(".dialogo h2")?.textContent.includes("Hi, this is Repasa"), null, { timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(100);
    const despues = await p.evaluate(() => ({ titulo: document.querySelector(".dialogo h2")?.textContent, perfiles: document.querySelector(".perfiles h1")?.textContent,
      guardado: window._fs ? JSON.parse(window._fs.get("Repasa/.repasa/config.json")?.data || "{}").idioma_ui === "en" : window._enviados.some((m) => m.accion === "config" && m.datos.idioma_ui === "en") }));
    if (despues.titulo !== "Hi, this is Repasa") falla("después de elegir English, el paso siguiente no salió en inglés: " + despues.titulo);
    else if (!despues.guardado) falla("elegir English no guardó idioma_ui por el puente (config)");
    else if (despues.perfiles !== "Who's studying?") falla("detrás de la bienvenida la pantalla no quedó en inglés: " + despues.perfiles);
    else console.log("  ✓ Primer uso: el idioma va primero y se guarda");
  }
  // Quien ya hizo la bienvenida no vuelve a ver la pantalla de idioma.
  await p.goto(BASE); await p.waitForFunction(() => window.Repasa);
  if (MOVIL) await p.waitForSelector(".perfiles, [data-idioma]");
  else await p.evaluate((e) => window.Repasa.estado({ ...e, config: { bienvenida: true } }), estadoDemo);
  if (await p.$("[data-idioma]") || !(await p.$(".perfiles"))) falla("la pantalla de idioma aparece aunque la bienvenida ya estaba hecha");
  await p.close();
}

// 2–4) Todas las vistas
for (const [idioma, consulta] of [["español", "idioma=es"], ["inglés", "idioma=en"]]) {
  for (const [modo, opciones] of [["escritorio", { viewport: { width: 1360, height: 860 } }], ["celular", { viewport: { width: 390, height: 844 }, colorScheme: "light" }]]) {
    for (const bv of [false, true]) {
      const p = await nuevaPagina(opciones);
      p.on("pageerror", (e) => falla(`error de JavaScript (${idioma}, ${modo}): ${e.message}`));
      await p.addInitScript(() => { window._faltantes = new Set(); });
      await p.goto(BASE + "?" + [consulta, bv ? "bienvenida" : ""].filter(Boolean).join("&"));
      await p.waitForFunction(() => window.Repasa && document.querySelector(".barra"));
      const pasos = bv ? [0, 1, 2].map((n) => [`bienvenida-${n}`, `E=>{E.bv=${n}}`]) : VISTAS;
      for (const [nombre, f] of pasos) {
        await p.evaluate(`window.Repasa._probar(${f})`);
        await p.waitForTimeout(80);
        if (modo === "celular") {
          const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
          if (ancho > 392) falla(`se sale de la pantalla a ancho de celular (${ancho}px) en «${nombre}» (${idioma})`);
        }
        if (CAPTURAS && (idioma === "español" || modo === "escritorio")) await p.screenshot({ path: path.join(CAPTURAS, `${idioma}-${modo}-${nombre}.png`) });
      }
      if (idioma === "inglés") {
        const faltan = [...new Set(await p.evaluate(() => [...window._faltantes]))].filter((t) => !esDato(t));
        if (faltan.length) falla(`${faltan.length} textos sin traducción en ui/idiomas/en.json:\n      ` + faltan.map((t) => JSON.stringify(t)).join("\n      "));
      }
      await p.close();
    }
  }
  console.log(`  ✓ Vistas en ${idioma}`);
}

// 5) Contraste del botón principal
for (const esquema of ["light", "dark"]) {
  const p = await nuevaPagina({ colorScheme: esquema });
  await p.goto(BASE + "?perfil=martina"); await p.click("[data-tema]"); await p.waitForSelector(".boton.principal");
  const c = await p.evaluate(() => {
    const lum = (s) => { const [r, g, b] = s.match(/[\d.]+/g).slice(0, 3).map((x) => { x = x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cs = getComputedStyle(document.querySelector(".boton.principal")); const a = lum(cs.color), b = lum(cs.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  if (c < 4.5) falla(`contraste del botón principal en modo ${esquema}: ${c.toFixed(2)} (mínimo 4.5)`);
  else console.log(`  ✓ Contraste en modo ${esquema === "light" ? "claro" : "oscuro"}: ${c.toFixed(2)}`);
  await p.close();
}
await navegador.close();
servidor.close();
if (MOVIL) fs.rmSync(WEB, { recursive: true, force: true });
if (errores.length) { console.log(`\n✗ ${errores.length} problemas`); process.exit(1); }
console.log(MOVIL ? "✓ Interfaz OK (celular)" : "✓ Interfaz OK");
