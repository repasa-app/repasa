// Copia cifrada en las apps de escritorio (app/web/escritorio.js), sin navegador: node pruebas/escritorio.mjs
// Arma la misma carpeta que deja empaquetar.sh (escritorio.js junto a motor/) y revisa que una copia hecha en el computador se
// abra en el teléfono y al revés, que la frase equivocada no toque nada, y que solo vuelva para escribir lo que cambió.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import * as datos from "../motor/datos.js";
import * as copia from "../motor/copia.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMA = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "datos", "independencia-de-chile.json"), "utf8"));
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };

const ui = fs.mkdtempSync(path.join(os.tmpdir(), "repasa-escritorio-"));
fs.cpSync(path.join(RAIZ, "motor"), path.join(ui, "motor"), { recursive: true });
fs.copyFileSync(path.join(RAIZ, "app", "web", "escritorio.js"), path.join(ui, "escritorio.js"));
globalThis.window = {};
// Ventana.swift carga ui/cifrado.js (pieza «cifrado», script clásico) antes de escritorio.js: queda en window.PiezaCifrado.
globalThis.PiezaCifrado = createRequire(import.meta.url)(path.join(RAIZ, "ui", "cifrado.js"));
await import(pathToFileURL(path.join(ui, "escritorio.js")).href);
const R = globalThis.window.RepasaEscritorio;
const FRASE = "cuatro palabras de prueba";

// Lo que la app de Mac lee de ~/Repasa (texto para JSON, base64 para el material).
const computador = {
  "perfiles.json": { texto: JSON.stringify([{ id: "martina", nombre: "Martina", curso: "6b", avatar: "🦊" }]) },
  "progreso/martina.json": { texto: JSON.stringify({ puntos: 40, racha: 2, ultimo_dia: "2026-10-20", preguntas: { "independencia-de-chile/p1": { caja: 2, ultima: "2026-10-20" } }, sesiones: [] }) },
  [`temas/${TEMA.id}/tema.json`]: { texto: JSON.stringify({ ...TEMA, fuente: ["material-1.jpg"] }) },
  [`temas/${TEMA.id}/material/material-1.jpg`]: { base64: "/9j/AAAA" },
  ".repasa/config.json": { texto: "{\"ia\": \"claude\"}" }, // nunca entra en una copia
};

{
  const corta = await R.armar(computador, "corta", "2026-10-28");
  if (corta.ok || !corta.error.includes("12 caracteres")) falla("una frase corta no debería servir: " + JSON.stringify(corta));
  const r = await R.armar(computador, FRASE, "2026-10-28");
  if (!r.ok || r.cantidad !== 4) falla("armar: " + JSON.stringify(r).slice(0, 200));
  else if (/Martina|independencia|claude/i.test(r.texto)) falla("la copia deja ver nombres, temas o ajustes");
  else {
    // En el teléfono se abre con el motor de siempre.
    const telefono = new datos.Almacen(datos.adaptadorMemoria());
    const resumen = await copia.juntar(telefono, await copia.abrirCopia(r.texto, FRASE));
    if (resumen.temas !== 1 || resumen.material !== 1 || (await telefono.perfiles())[0]?.nombre !== "Martina") falla("el teléfono no abrió la copia del computador: " + JSON.stringify(resumen));
    else console.log("  ✓ Copia hecha en el computador se abre en el teléfono (sin ajustes ni nada a la vista)");
  }
}

{
  // Una copia del teléfono se trae al computador: junta sin borrar y devuelve solo lo que cambió.
  const telefono = new datos.Almacen(datos.adaptadorMemoria());
  await telefono.guardarPerfil({ id: "diego", nombre: "Diego", curso: "1m", avatar: "🐢" });
  await telefono.guardarProgreso("martina", { puntos: 90, racha: 3, ultimo_dia: "2026-10-27", preguntas: { "independencia-de-chile/p1": { caja: 4, ultima: "2026-10-27" } }, sesiones: [] });
  await telefono.escribirJSON(`temas/${TEMA.id}/tema.json`, { ...TEMA, fuente: ["material-1.jpg"] });
  await telefono.a.escribirBase64(`temas/${TEMA.id}/material/material-1.jpg`, "OTRA");
  const { texto } = await copia.armarCopia(telefono, FRASE, "2026-10-28");
  const mala = await R.traer({ ...computador }, texto, "otra frase cualquiera");
  if (mala.ok || mala.error !== "La frase no es la correcta.") falla("frase equivocada: " + JSON.stringify(mala));
  const otra = await R.traer({ ...computador }, "{\"repasa\":\"otra\"}", FRASE);
  if (otra.ok || otra.error !== "Ese archivo no es una copia de Repasa.") falla("no es una copia: " + JSON.stringify(otra));
  const danada = await R.traer({ ...computador }, texto.slice(0, -40), FRASE);
  if (danada.ok || !/dañado/.test(danada.error)) falla("archivo dañado: " + JSON.stringify(danada));
  // Una copia hecha con el cifrado de antes de la pieza (pruebas/datos/antes/) se trae igual al computador.
  const antes = await R.traer({}, fs.readFileSync(path.join(RAIZ, "pruebas", "datos", "antes", "copia-v1.repasa"), "utf8"), "pino lluvia tetera azul");
  if (!antes.ok || antes.resumen.temas !== 1 || antes.resumen.progreso !== 1) falla("copia de antes en el computador: " + JSON.stringify(antes).slice(0, 200));
  else console.log("  ✓ Una copia hecha antes de la pieza «cifrado» se trae al computador");
  const sinMaterial = { ...computador, [`temas/${TEMA.id}/material/material-1.jpg`]: { base64: "" } };
  const r = await R.traer(sinMaterial, texto, FRASE);
  const rutas = (r.escribir || []).map((x) => x.ruta).sort();
  if (!r.ok) falla("traer: " + JSON.stringify(r));
  else if (rutas.join() !== "perfiles.json,progreso/martina.json") falla("traer debería escribir solo perfiles y progreso: " + rutas.join());
  else {
    const perfiles = JSON.parse(r.escribir.find((x) => x.ruta === "perfiles.json").texto).map((p) => p.id).sort();
    const prog = JSON.parse(r.escribir.find((x) => x.ruta === "progreso/martina.json").texto);
    if (perfiles.join() !== "diego,martina" || prog.puntos !== 90 || prog.preguntas["independencia-de-chile/p1"].caja !== 4) falla("no juntó bien: " + JSON.stringify({ perfiles, prog }));
    else console.log("  ✓ Copia del teléfono se trae al computador: junta, no pisa fotos y devuelve solo lo que cambió");
  }
  const raro = await R.traer({ "../../.ssh/id_rsa": { texto: "x" }, ...computador }, texto, FRASE);
  if ((raro.escribir || []).some((x) => !copia.RUTA_PERMITIDA.test(x.ruta))) falla("traer devolvió una ruta fuera de las permitidas");
}

fs.rmSync(ui, { recursive: true, force: true });
if (errores.length) { console.log(`\n✗ ${errores.length} problemas`); process.exit(1); }
console.log("✓ Copia en el escritorio OK");
