// Pruebas del motor JS (motor/), sin navegador ni dependencias: node pruebas/motor.mjs
// 1) Da lo mismo que Python: casos compartidos (pruebas/casos.json) y los pedidos a la IA comparados con bin/*.py en vivo.
// 2) La IA del teléfono (con una IA falsa): crea temas válidos aunque responda desordenado, y no deja pasar lo que no sirve.
// 3) Datos, cifrado, copia cifrada y la carpeta de la fase 2 (frase equivocada, archivos cambiados, juntar sin perder nada).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as temas from "../motor/temas.js";
import * as lineas from "../motor/lineas.js";
import * as crear from "../motor/crear_tema.js";
import * as explicar from "../motor/explicar.js";
import * as datos from "../motor/datos.js";
import * as cifrado from "../motor/cifrado.js";
import * as copia from "../motor/copia.js";
import * as carpeta from "../motor/carpeta.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "casos.json"), "utf8"));
const TEMA = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "datos", "independencia-de-chile.json"), "utf8"));
const errores = [];
const falla = (m) => { errores.push(m); console.log("  ✗ " + m); };
// Igualdad sin importar el orden de las claves (Python y JS pueden ordenar distinto un objeto).
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const bloque = (nombre, f) => { const antes = errores.length; return Promise.resolve(f()).then(() => { if (errores.length === antes) console.log("  ✓ " + nombre); }, (e) => falla(`${nombre}: ${e.stack || e}`)); };
const copiaDe = (x) => JSON.parse(JSON.stringify(x));

// ───────────── 1) Igual que Python ─────────────
await bloque("validar, id_de, lineas, conceptos y a mano dan lo mismo que Python (casos.json)", () => {
  for (const [n, t, esperado] of casos.validar) { const r = temas.validar(t); if (!igual(r, esperado)) falla(`validar «${n}»: ${JSON.stringify(r)} ≠ ${JSON.stringify(esperado)}`); }
  for (const [t, esperado] of casos.id_de) if (temas.idDe(t) !== esperado) falla(`idDe(${JSON.stringify(t)}) = ${temas.idDe(t)} ≠ ${esperado}`);
  for (const [t, idioma, esperado] of casos.lineas) { const r = lineas.leerPreguntas(t, idioma); if (!igual(r, esperado)) falla(`leerPreguntas: ${JSON.stringify(r).slice(0, 300)}`); }
  for (const [t, idioma, c, tj] of casos.conceptos) {
    if (!igual(lineas.leerConceptos(t), c)) falla("leerConceptos: " + JSON.stringify(lineas.leerConceptos(t)));
    if (!igual(lineas.tarjetasDe(c, idioma), tj)) falla("tarjetasDe: " + JSON.stringify(lineas.tarjetasDe(c, idioma)));
  }
  for (const [d, hoy, esperado] of casos.a_mano) { const r = crear.temaAMano(d, hoy); if (!igual(r, esperado)) falla(`temaAMano «${d.titulo}»: ${JSON.stringify(r).slice(0, 300)}`); }
});

await bloque("los pedidos a la IA son los mismos que arma Python", () => {
  const entradas = { crear: [["6b", "historia", "La Patria Vieja…", false], ["1m", "auto", "", true], ["4m", "quimica", "texto con «comillas» y 😀", true]],
    explicar: [["p1", "Mendoza"], ["p4", ""], ["p2", "x".repeat(150) + "😀"]], limpiar: ["## Hola **tú** <b>x</b> `y` _z_ " + "a".repeat(1000)],
    json: ["Aquí está:\n```json\n{\"a\": 1}\n```", "nada", "{roto"], completar: [[{ titulo: "La Independencia!" }, "6b", "auto"], [{ id: "x", ramo: "otro" }, "1m", "historia"], [{ formato: 3 }, "5b", "auto"]] };
  const py = `
import json, sys
sys.path.insert(0, "bin")
import crear_tema, explicar
e = json.load(sys.stdin)
t = json.load(open("pruebas/datos/independencia-de-chile.json", encoding="utf-8"))
print(json.dumps({
 "crear": [crear_tema.prompt(*x) for x in e["crear"]],
 "explicar": [explicar.pedido(t, next(p for p in t["preguntas"] if p["id"] == i), r) for i, r in e["explicar"]],
 "limpiar": [explicar.limpiar(x) for x in e["limpiar"]],
 "json": [crear_tema.leer_json_ia(x) for x in e["json"]],
 "completar": [crear_tema.completar(dict(x), c, r, "2026-10-26") for x, c, r in e["completar"]],
}, ensure_ascii=False))`;
  const r = JSON.parse(execFileSync("python3", ["-c", py], { cwd: RAIZ, input: JSON.stringify(entradas), encoding: "utf8" }));
  entradas.crear.forEach((x, i) => { if (crear.prompt(...x) !== r.crear[i]) falla(`prompt de crear tema distinto a Python (caso ${i + 1})`); });
  entradas.explicar.forEach(([id, resp], i) => { if (explicar.pedido(TEMA, TEMA.preguntas.find((p) => p.id === id), resp) !== r.explicar[i]) falla(`pedido de explicar distinto a Python (caso ${i + 1})`); });
  entradas.limpiar.forEach((x, i) => { if (explicar.limpiar(x) !== r.limpiar[i]) falla("limpiar distinto a Python"); });
  entradas.json.forEach((x, i) => { if (!igual(crear.leerJsonIA(x), r.json[i])) falla(`leerJsonIA distinto a Python (caso ${i + 1})`); });
  entradas.completar.forEach(([t, c, ra], i) => { if (!igual(crear.completar({ ...t }, c, ra, "2026-10-26"), r.completar[i])) falla(`completar distinto a Python (caso ${i + 1})`); });
});

// ───────────── 2) La IA del teléfono, con una IA falsa ─────────────
const RESPUESTAS = {
  resumen: "Claro, aquí tienes:\nTÍTULO: **La Independencia de Chile**\nRAMO: Historia\nRESUMEN: Entre 1810 y 1818 Chile dejó de ser colonia.\nPrimero vino la Patria Vieja y después la Reconquista.",
  conceptos: "1. Patria Vieja: de 1810 a 1814.\n- Reconquista: vuelven los españoles.\nEsto no es un concepto\n<b>Malo</b>: con html",
  preguntas: `¿Pregunta de alternativas?
* respuesta correcta
- respuesta incorrecta creíble
- otra respuesta incorrecta creíble

1. ¿Qué se formó el 18 de septiembre de 1810?
* La Primera Junta
- El Congreso
- El Ejército de los Andes
> Ese día se formó la Primera Junta.

2. La batalla de Chacabuco fue en 1817.
* Verdadero
> Fue en febrero de 1817.

3. En 1814 se perdió la batalla de ___.
* Rancagua
> Ahí terminó la Patria Vieja.

4. ¿Dónde se organizó el Ejército de los Andes?
* Mendoza
- Santiago
- Lima
- Lima

5. ¿Quién fue Director Supremo?
* Bernardo O'Higgins
- José Miguel Carrera
- Mateo de Toro y Zambrano
> O'Higgins fue Director Supremo desde 1817.`,
  mas: `¿Qué batalla aseguró la independencia?
* Maipú
- Rancagua
- Chacabuco
> Maipú, en 1818.

¿Qué se formó el 18 de septiembre de 1810?
* La Primera Junta
- Otra
- Otra más`,
};
function iaFalsa(registro, cambios = {}) {
  return async (prompt, opciones) => {
    registro.push({ prompt, opciones });
    const tipo = prompt.includes("TÍTULO:") ? "resumen" : prompt.includes("Término: definición") ? "conceptos" : prompt.includes("Ya están estas") ? "mas" : "preguntas";
    if (cambios[tipo] instanceof Error) throw cambios[tipo];
    return cambios[tipo] ?? RESPUESTAS[tipo];
  };
}
await bloque("IA del teléfono: arma un tema válido por partes, sin lo que no sirve", async () => {
  const registro = [], pasos = [];
  const r = await crear.crearLocal(iaFalsa(registro), { curso: "6b", ramo: "auto", texto: "La Patria Vieja… (texto leído de la foto)", hoy: "2026-10-26", avance: (a, b) => pasos.push(`${a}/${b}`) });
  if (!r.ok) return falla("no creó el tema: " + r.error);
  const t = r.tema;
  if (temas.validar(t).length) falla("el tema no es válido: " + temas.validar(t));
  if (t.ramo !== "historia" || t.curso !== "6b" || t.id !== "la-independencia-de-chile" || t.autor !== "ia" || t.creado !== "2026-10-26") falla("datos del tema: " + JSON.stringify({ ramo: t.ramo, id: t.id }));
  if (t.preguntas.some((p) => p.enunciado.startsWith("¿Pregunta de alternativas"))) falla("usó la pregunta del ejemplo");
  if (t.preguntas.length !== 5) falla(`esperaba 5 preguntas (sin el ejemplo, sin la de opciones repetidas, sin la repetida): ${t.preguntas.map((p) => p.enunciado)}`);
  if (t.preguntas.filter((p) => p.tipo === "alternativas").every((p) => p.correcta === 0)) falla("la correcta quedó siempre primera");
  for (const p of t.preguntas.filter((x) => x.tipo === "alternativas")) if (!["La Primera Junta", "Bernardo O'Higgins", "Maipú"].includes(p.opciones[p.correcta])) falla("al mezclar se perdió la correcta: " + p.enunciado);
  if (t.preguntas.map((p) => p.dificultad).join() !== "1,1,2,2,3") falla("dificultad por tercios: " + t.preguntas.map((p) => p.dificultad));
  if (t.conceptos.length !== 2 || t.tarjetas.length !== 2) falla("conceptos y tarjetas: " + JSON.stringify(t.conceptos));
  if (registro.length !== 4) falla(`esperaba 4 pedidos (resumen, conceptos y dos de preguntas): ${registro.length}`);
  if (registro.some((x) => x.prompt.length > 7000)) falla("un pedido no cabe en la ventana de un modelo chico");
  if (registro.some((x) => /Martina|Diego/.test(x.prompt))) falla("el pedido lleva el nombre de un perfil");
  if (pasos[0] !== "1/4") falla("el avance no partió en 1/4: " + pasos);
});
await bloque("IA del teléfono: material largo se corta y se avisa; respuestas malas no pasan", async () => {
  const registro = [];
  const r = await crear.crearLocal(iaFalsa(registro), { curso: "6b", ramo: "historia", texto: "Palabra ".repeat(3000), hoy: "2026-10-26", capacidad: { contexto: 4096 } });
  if (!r.ok || r.avisos.length !== 1) falla("con material largo debía crear el tema con un aviso: " + JSON.stringify(r).slice(0, 200));
  if (registro.some((x) => x.prompt.length > 7000)) falla("con material largo, el pedido no se cortó");
  if (r.ok && r.tema.ramo !== "historia") falla("el ramo pedido debe mandar sobre el que dice la IA");
  const sinPreguntas = await crear.crearLocal(iaFalsa([], { preguntas: "No puedo hacer eso.", mas: "Tampoco." }), { curso: "6b", ramo: "historia", texto: "algo", hoy: "2026-10-26" });
  if (sinPreguntas.ok || !/no sirve todavía/.test(sinPreguntas.error)) falla("sin preguntas no debe haber tema: " + JSON.stringify(sinPreguntas));
  const sinResumen = await crear.crearLocal(iaFalsa([], { resumen: "???" }), { curso: "6b", ramo: "historia", texto: "algo", hoy: "2026-10-26" });
  if (sinResumen.ok) falla("sin título ni resumen no debe haber tema");
  const conError = await crear.crearLocal(iaFalsa([], { conceptos: new Error("La IA de este teléfono no está lista.") }), { curso: "6b", ramo: "historia", texto: "algo", hoy: "2026-10-26" });
  if (conError.ok || conError.error !== "La IA de este teléfono no está lista.") falla("el error de la IA debe llegar tal cual: " + JSON.stringify(conError));
  if ((await crear.crearLocal(iaFalsa([]), { curso: "9z", ramo: "historia", texto: "algo", hoy: "x" })).ok) falla("curso no válido");
  if ((await crear.crearLocal(iaFalsa([]), { curso: "6b", ramo: "historia", texto: "  ", hoy: "x" })).ok) falla("sin material");
  const completo = await crear.crearCompleto(async () => "```json\n" + JSON.stringify(TEMA) + "\n```", { curso: "7b", ramo: "auto", texto: "algo", hoy: "2026-10-26" });
  if (!completo.ok || completo.tema.curso !== "7b") falla("crearCompleto con una IA grande: " + JSON.stringify(completo).slice(0, 200));
  const malo = await crear.crearCompleto(async () => JSON.stringify({ ...TEMA, preguntas: [] }), { curso: "7b", ramo: "auto", texto: "algo", hoy: "x", nombreIA: "Claude" });
  if (malo.ok || !malo.error.startsWith("Lo que armó Claude no sirve todavía (preguntas: entre 3 y 60.)")) falla("crearCompleto debe validar: " + malo.error);
});
await bloque("explicar: limpia lo que responde la IA y no inventa preguntas", async () => {
  const r = await explicar.explicar(async () => "## Imagínate **una carrera** <b>y</b> listo", TEMA, "p4", "Chacabuco");
  if (!r.ok || /[#*<>]/.test(r.texto)) falla("explicar no limpió: " + JSON.stringify(r));
  if ((await explicar.explicar(async () => "x", TEMA, "p99", "")).ok) falla("pregunta que no existe");
  if ((await explicar.explicar(async () => "x", { ...TEMA, preguntas: [] }, "p1", "")).ok) falla("tema no válido");
  const e = await explicar.explicar(async () => { throw new Error("Sin IA"); }, TEMA, "p1", "");
  if (e.ok || e.error !== "Sin IA") falla("error de la IA: " + JSON.stringify(e));
});

// ───────────── 3) Datos, cifrado, copia y carpeta ─────────────
await bloque("datos: mismo formato que en el computador, sin pisar temas", async () => {
  const a = datos.adaptadorMemoria(), al = new datos.Almacen(a);
  await a.escribirBase64(".repasa/temporal/foto-1.jpg", "AAEC");
  const g1 = await al.guardarTema(TEMA, [".repasa/temporal/foto-1.jpg", "../../etc/passwd.jpg", ".repasa/temporal/x.exe"]);
  const g2 = await al.guardarTema(TEMA);
  if (!g1.ok || g1.tema.id !== TEMA.id || !igual(g1.tema.fuente, ["material-1.jpg"])) falla("guardarTema: " + JSON.stringify(g1).slice(0, 200));
  if (!g2.ok || g2.tema.id !== TEMA.id + "-2") falla("el segundo tema con el mismo id debía quedar como -2: " + g2.tema?.id);
  if ((await al.guardarTema({ ...TEMA, preguntas: [] })).ok) falla("guardó un tema no válido");
  if (a.archivos.get(`temas/${TEMA.id}/material/material-1.jpg`)?.base64 !== "AAEC") falla("no copió la foto");
  await al.guardarPerfil({ id: "martina-x1", nombre: "  Martina  ", curso: "6b", avatar: "🦊" });
  await al.guardarProgreso("martina-x1", { puntos: 10, preguntas: {} });
  await al.guardarPruebas([{ id: "prueba-1", perfil: "martina-x1", ramo: "historia", temas: [TEMA.id], fecha: "2026-11-02" }, { id: "../malo" }]);
  await al.guardarConfig({ idioma_ui: "en", bienvenida: true, "../x": "y", objeto: {} });
  const e = await al.estado();
  if (e.perfiles[0]?.nombre !== "Martina" || e.temas.length !== 2 || e.progreso["martina-x1"]?.puntos !== 10 || e.pruebas.length !== 1) falla("estado: " + JSON.stringify(e).slice(0, 300));
  if (!igual(e.config, { ia: "telefono", idioma_ui: "en", bienvenida: true })) falla("config: " + JSON.stringify(e.config));
  if (a.archivos.get("perfiles.json").texto !== JSON.stringify([{ id: "martina-x1", nombre: "Martina", curso: "6b", avatar: "🦊" }], null, 1) + "\n") falla("perfiles.json no quedó con el formato de Python (indent=1)");
  for (const malo of [{ id: "../x", nombre: "a", curso: "6b", avatar: "🦊" }, { id: "a", nombre: "", curso: "6b", avatar: "🦊" }, { id: "a", nombre: "a", curso: "9z", avatar: "🦊" }])
    await al.guardarPerfil(malo).then(() => falla("guardó un perfil no válido: " + JSON.stringify(malo)), () => {});
  await al.guardarProgreso("../x", {}).then(() => falla("guardó progreso con una ruta rara"), () => {});
});

await bloque("cifrado: frase equivocada, archivo cambiado y nombres opacos", async () => {
  const { cabecera, llaves } = await cifrado.nuevaCabecera("caballo bateria grapa correcto", 100000);
  const sobre = await cifrado.cifrarJSON(llaves, { hola: "mundo" }, "aad-1");
  if (JSON.stringify(sobre).includes("mundo")) falla("el sobre se lee sin la frase");
  const otra = await cifrado.abrirCabecera(JSON.parse(JSON.stringify(cabecera)), "caballo bateria grapa correcto");
  if (!igual(await cifrado.descifrarJSON(otra, sobre, "aad-1"), { hola: "mundo" })) falla("no se pudo abrir con la frase correcta");
  await cifrado.abrirCabecera(cabecera, "caballo bateria grapa incorrecto").then(() => falla("abrió con una frase equivocada"), (e) => { if (!(e instanceof cifrado.ErrorFrase) || e.message !== "La frase no es la correcta.") falla("mensaje de frase: " + e.message); });
  await cifrado.descifrarJSON(otra, sobre, "aad-2").then(() => falla("abrió un sobre fuera de su lugar (AAD)"), (e) => { if (!(e instanceof cifrado.ErrorDañado)) falla("tipo de error AAD"); });
  const roto = { ...sobre, datos: sobre.datos.slice(0, -6) + (sobre.datos.at(-6) === "A" ? "B" : "A") + sobre.datos.slice(-5) };
  await cifrado.descifrarJSON(otra, roto, "aad-1").then(() => falla("abrió un sobre cambiado"), () => {});
  await cifrado.abrirCabecera({ ...cabecera, kdf: { ...cabecera.kdf, iteraciones: 1000 } }, "caballo bateria grapa correcto").then(() => falla("aceptó pocas vueltas de PBKDF2"), () => {});
  // «canción» con la tilde como un carácter o como dos (iPhone y Android pueden mandar distinto): la misma frase.
  const nfd = await cifrado.abrirCabecera((await cifrado.nuevaCabecera("mi canción favorita 2026", 100000)).cabecera, "mi canción favorita 2026").catch(() => null);
  if (!nfd) falla("la frase no se normaliza (NFC)");
  const n1 = await cifrado.nombreOpaco(llaves, "progreso/martina-x1.json"), n2 = await cifrado.nombreOpaco(otra, "progreso/martina-x1.json");
  const n3 = await cifrado.nombreOpaco((await cifrado.nuevaCabecera("otra frase larga distinta", 100000)).llaves, "progreso/martina-x1.json");
  if (n1 !== n2 || n1 === n3 || !/^[0-9a-f]{32}$/.test(n1)) falla("nombreOpaco: " + [n1, n2, n3]);
  if (cifrado.revisarFrase("corta") === "" || cifrado.revisarFrase("cuatro palabras bien largas") !== "") falla("revisarFrase");
});

async function almacenConDatos() {
  const a = datos.adaptadorMemoria(), al = new datos.Almacen(a);
  await al.guardarPerfil({ id: "martina-x1", nombre: "Martina", curso: "6b", avatar: "🦊" });
  await a.escribirBase64(".repasa/temporal/f.jpg", "/9j/AAEC");
  await al.guardarTema(TEMA, [".repasa/temporal/f.jpg"]);
  await al.guardarProgreso("martina-x1", { puntos: 50, racha: 3, ultimo_dia: "2026-10-25", preguntas: { [`${TEMA.id}/p1`]: { caja: 2, proxima: "2026-10-28", ultima: "2026-10-25" } }, sesiones: [{ fecha: "2026-10-25", preguntas: 5, aciertos: 4 }] });
  await al.guardarPruebas([{ id: "prueba-1", perfil: "martina-x1", ramo: "historia", temas: [TEMA.id], fecha: "2026-11-02" }]);
  await al.guardarConfig({ idioma_ui: "es" });
  return al;
}
await bloque("copia cifrada: se guarda, se trae y se junta sin perder nada", async () => {
  const origen = await almacenConDatos();
  const { texto, cantidad } = await copia.armarCopia(origen, "nuestra frase de familia", "2026-10-26");
  if (/Martina|martina|independencia|Patria/.test(texto)) falla("la copia deja ver nombres o temas sin la frase");
  if (cantidad !== 5) falla(`esperaba 5 archivos en la copia (perfiles, pruebas, progreso, tema, foto; no los ajustes): ${cantidad}`);
  await copia.abrirCopia(texto, "otra frase cualquiera").then(() => falla("abrió la copia con otra frase"), (e) => { if (e.message !== "La frase no es la correcta.") falla(e.message); });
  await copia.abrirCopia("{}", "x").then(() => falla("abrió algo que no es una copia"), (e) => { if (e.message !== cifrado.MENSAJES.dañado) falla(e.message); });
  const entradas = await copia.abrirCopia(texto, "nuestra frase de familia");
  // Otro teléfono con su propio avance: al traer la copia se junta.
  const destino = new datos.Almacen(datos.adaptadorMemoria());
  await destino.guardarPerfil({ id: "diego-y2", nombre: "Diego", curso: "8b", avatar: "🐼" });
  await destino.guardarProgreso("martina-x1", { puntos: 70, racha: 1, ultimo_dia: "2026-10-26", preguntas: { [`${TEMA.id}/p1`]: { caja: 1, proxima: "2026-10-26", ultima: "2026-10-26" }, [`${TEMA.id}/p2`]: { caja: 1, ultima: "2026-10-20" } }, sesiones: [{ fecha: "2026-10-26", preguntas: 3, aciertos: 1 }] });
  const r = await copia.juntar(destino, entradas);
  if (!igual(r, { perfiles: 1, temas: 1, progreso: 1, pruebas: 1, material: 1, omitidos: 0 })) falla("resumen al juntar: " + JSON.stringify(r));
  const e = await destino.estado();
  if (e.perfiles.map((p) => p.id).sort().join() !== "diego-y2,martina-x1") falla("perfiles al juntar: " + e.perfiles.map((p) => p.id));
  const pm = e.progreso["martina-x1"];
  if (pm.puntos !== 70 || pm.racha !== 1 || pm.ultimo_dia !== "2026-10-26" || pm.preguntas[`${TEMA.id}/p1`].ultima !== "2026-10-26" || !pm.preguntas[`${TEMA.id}/p2`] || pm.sesiones.length !== 2)
    falla("progreso al juntar: " + JSON.stringify(pm));
  if (e.config.idioma_ui !== "") falla("los ajustes no viajan en la copia");
  // Traerla dos veces no duplica nada; un tema distinto con el mismo id no se pisa.
  const r2 = await copia.juntar(destino, entradas);
  if (r2.temas !== 0 || r2.material !== 0 || (await destino.progreso())["martina-x1"].sesiones.length !== 2) falla("traer dos veces duplicó: " + JSON.stringify(r2));
  const cambiada = entradas.map((x) => (x.ruta.endsWith("tema.json") ? { ...x, contenido: { ...x.contenido, titulo: "Otro tema" } } : x));
  if ((await copia.juntar(destino, cambiada)).omitidos !== 1 || (await destino.tema(TEMA.id)).titulo !== TEMA.titulo) falla("un tema distinto con el mismo id pisó al que había");
  if (!igual(copia.juntarProgreso({}, {}), { preguntas: {}, sesiones: [], puntos: 0, racha: 0 })) falla("juntarProgreso vacío: " + JSON.stringify(copia.juntarProgreso({}, {})));
  if (copia.RUTA_PERMITIDA.test(".repasa/config.json") || copia.RUTA_PERMITIDA.test("temas/../x/tema.json") || copia.RUTA_PERMITIDA.test("temas/a/material/x.exe")) falla("RUTA_PERMITIDA deja pasar rutas raras");
});

await bloque("carpeta de la fase 2: datos con nombres opacos, pedidos y respuestas", async () => {
  const { texto, llaves } = await carpeta.crearCarpeta("frase de la carpeta familiar");
  const ll = await carpeta.abrirCarpeta(texto, "frase de la carpeta familiar");
  await carpeta.abrirCarpeta(texto, "otra").then(() => falla("abrió la carpeta con otra frase"), () => {});
  const s = await carpeta.sobreDeArchivo(llaves, { ruta: "progreso/martina-x1.json", tipo: "json", contenido: { puntos: 3 } });
  if (s.ruta.includes("martina") || !/^datos\/[0-9a-f]{32}\.repasa$/.test(s.ruta)) falla("el nombre del archivo deja ver la ruta: " + s.ruta);
  const leido = await carpeta.archivoDeSobre(ll, s.ruta.slice(6), s.texto);
  if (leido.contenido.puntos !== 3) falla("no se leyó el archivo de la carpeta");
  const otro = await carpeta.sobreDeArchivo(llaves, { ruta: "pruebas.json", tipo: "json", contenido: [] });
  await carpeta.archivoDeSobre(ll, otro.ruta.slice(6), s.texto).then(() => falla("abrió un archivo con el nombre de otro"), () => {});
  await carpeta.sobreDeArchivo(llaves, { ruta: ".repasa/config.json" }).then(() => falla("dejó subir los ajustes"), () => {});
  const p = await carpeta.armarPedido(llaves, "crearTema", { curso: "6b", ramo: "auto", texto: "La Patria Vieja", imagenes: [] }, "2026-10-26");
  const lp = await carpeta.leerPedido(ll, p.id, p.texto);
  if (lp.datos.texto !== "La Patria Vieja" || p.texto.includes("Patria")) falla("pedido: " + JSON.stringify(lp));
  await carpeta.armarPedido(llaves, "borrarTodo", {}, "x").then(() => falla("aceptó un pedido desconocido"), () => {});
  const ok = await carpeta.armarRespuesta(ll, p.id, { ok: true, tema: TEMA });
  if (!(await carpeta.leerRespuesta(llaves, p.id, ok.texto)).ok) falla("respuesta con tema válido");
  const mala = await carpeta.armarRespuesta(ll, p.id, { ok: true, tema: { ...TEMA, titulo: "<script>" } });
  if ((await carpeta.leerRespuesta(llaves, p.id, mala.texto)).ok) falla("dejó pasar un tema no válido del computador");
  const txt = await carpeta.armarRespuesta(ll, p.id, { ok: true, texto: "**Hola** <b>" });
  if ((await carpeta.leerRespuesta(llaves, p.id, txt.texto)).texto !== "Hola b") falla("no limpió el texto del computador");
  const otroId = (await carpeta.armarPedido(llaves, "explicar", { tema: "x", pregunta: "p1" }, "x")).id;
  await carpeta.leerRespuesta(llaves, otroId, ok.texto).then(() => falla("aceptó la respuesta de otro pedido"), () => {});
});

if (errores.length) { console.log(`\n✗ ${errores.length} problemas en el motor`); process.exit(1); }
console.log("✓ Motor OK");
