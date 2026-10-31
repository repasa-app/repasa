// Copia cifrada de todo Repasa en un solo archivo (fase 1: se guarda y se trae a mano, en iCloud Drive o Google Drive, con el
// selector del sistema). El archivo no dice nada de la familia sin la frase: ni nombres, ni temas, ni cuántos perfiles hay
// más allá de la cantidad de archivos.
//
//   {"repasa": "copia", "v": 1, "creada": "AAAA-MM-DD", "kdf": {...}, "cifrado": "AES-256-GCM", "verificador": {iv, datos},
//    "archivos": [{iv, datos}, …]}       cada sobre guarda {"ruta", "tipo": "json" | "base64", "contenido"}
//
// Traer una copia **junta** lo que trae con lo que hay en el teléfono; nunca borra nada (ver `juntar`).
//
// El cifrado es la pieza «cifrado» de Pieza (ui/cifrado.js, script clásico: window.PiezaCifrado), cargada antes que este motor
// (en el teléfono y en el Mac, por <script src="cifrado.js">; en Node, las pruebas la ponen en globalThis). Con el contexto
// «repasa» da los mismos verificadores, AAD y nombres opacos de siempre: lo que ya guardó una familia se sigue abriendo.
import { validar, esObjeto } from "./temas.js";
import { perfilValido, pruebaValida, ID, ID_TEMA, EXT_MATERIAL } from "./datos.js";

let pieza = null;
/** La pieza «cifrado» con el contexto de Repasa. Errores: PiezaCifrado.ErrorCifrado con `codigo` (frase, danado, no_es, version…). */
export function cifrado() {
  if (pieza) return pieza;
  const P = globalThis.PiezaCifrado;
  if (!P) throw new Error("Falta ui/cifrado.js (pieza «cifrado») antes del motor.");
  return (pieza = P.crear({ app: "Repasa", contexto: "repasa" }));
}
/** Un error de la pieza con su frase en español (la interfaz la traduce): «no_es», «danado», «version»… */
export const errorCifrado = (codigo) => new globalThis.PiezaCifrado.ErrorCifrado(codigo, { app: "Repasa" });

const AAD = "repasa:copia:v1";
const VERSION = 1;
/** Solo estas rutas entran y salen de una copia (nada de .repasa/: los ajustes son de cada teléfono). */
export const RUTA_PERMITIDA = /^(perfiles\.json|pruebas\.json|progreso\/[a-z0-9-]{1,80}\.json|temas\/[a-z0-9-]{2,60}\/tema\.json|temas\/[a-z0-9-]{2,60}\/material\/material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf))$/;

/** Las rutas que van en una copia, a partir de lo que hay en el almacén. */
export async function rutasDe(almacen) {
  const a = almacen.a, r = [];
  for (const f of ["perfiles.json", "pruebas.json"]) if (await a.existe(f)) r.push(f);
  for (const n of await a.listar("progreso")) if (n.endsWith(".json") && ID.test(n.slice(0, -5))) r.push(`progreso/${n}`);
  for (const id of await a.listar("temas")) {
    if (!ID_TEMA.test(id) || !(await a.existe(`temas/${id}/tema.json`))) continue;
    r.push(`temas/${id}/tema.json`);
    for (const m of await a.listar(`temas/${id}/material`)) r.push(`temas/${id}/material/${m}`);
  }
  return r.filter((x) => RUTA_PERMITIDA.test(x));
}

/** Arma la copia cifrada (texto JSON listo para guardar). `avance(n, total)` para mostrar por dónde va. */
export async function armarCopia(almacen, frase, hoy, avance = () => {}) {
  const C = cifrado();
  const { cabecera, llaves } = await C.nuevaCabecera(frase);
  const rutas = await rutasDe(almacen), archivos = [];
  for (const [i, ruta] of rutas.entries()) {
    avance(i + 1, rutas.length);
    const json = ruta.endsWith(".json");
    const contenido = json ? await almacen.leerJSON(ruta, null) : await almacen.a.leerBase64(ruta);
    if (contenido == null) continue;
    archivos.push(await C.cifrarJSON(llaves, { ruta, tipo: json ? "json" : "base64", contenido }, AAD));
  }
  return { texto: JSON.stringify({ repasa: "copia", v: VERSION, creada: hoy, ...cabecera, archivos }), cantidad: archivos.length };
}

/** Abre una copia con la frase: lista de {ruta, tipo, contenido}, solo con rutas permitidas. Lanza ErrorCifrado: `frase` (no es
 *  la correcta), `no_es` (no es una copia de Repasa), `version` (de una Repasa más nueva) o `danado`. */
export async function abrirCopia(texto, frase) {
  const C = cifrado();
  let c;
  try { c = JSON.parse(texto); } catch { throw errorCifrado(typeof texto === "string" && texto.trimStart().startsWith('{"repasa":"copia"') ? "danado" : "no_es"); }
  if (!esObjeto(c) || c.repasa !== "copia") throw errorCifrado("no_es");
  if (!Number.isInteger(c.v) || c.v < 1) throw errorCifrado("danado");
  if (c.v > VERSION) throw errorCifrado("version");
  if (!Array.isArray(c.archivos)) throw errorCifrado("danado");
  const llaves = await C.abrirCabecera(c, { frase });
  const r = [];
  for (const sobre of c.archivos) {
    const e = await C.descifrarJSON(llaves, sobre, AAD);
    if (!esObjeto(e) || typeof e.ruta !== "string" || !RUTA_PERMITIDA.test(e.ruta)) continue;
    if (e.tipo === "json" || (e.tipo === "base64" && typeof e.contenido === "string")) r.push({ ruta: e.ruta, tipo: e.tipo, contenido: e.contenido });
  }
  return r;
}

const mayor = (a, b) => (String(a || "") >= String(b || "") ? a : b);

/**
 * Junta el progreso de dos teléfonos sin perder nada: por pregunta gana lo respondido más tarde (`ultima`); los puntos, el mayor
 * (sumarlos contaría dos veces lo mismo); la racha, la del último día estudiado; las sesiones se unen (sin repetir).
 */
export function juntarProgreso(local, traido) {
  const a = esObjeto(local) ? local : {}, b = esObjeto(traido) ? traido : {};
  const preguntas = { ...(esObjeto(a.preguntas) ? a.preguntas : {}) };
  for (const [k, v] of Object.entries(esObjeto(b.preguntas) ? b.preguntas : {})) {
    if (!esObjeto(v)) continue;
    if (!preguntas[k] || String(v.ultima || "") > String(preguntas[k].ultima || "")) preguntas[k] = v;
  }
  const vistas = new Set(), sesiones = [];
  for (const s of [...(Array.isArray(a.sesiones) ? a.sesiones : []), ...(Array.isArray(b.sesiones) ? b.sesiones : [])]) {
    const k = JSON.stringify(s);
    if (esObjeto(s) && !vistas.has(k)) { vistas.add(k); sesiones.push(s); }
  }
  sesiones.sort((x, y) => String(x.fecha || "").localeCompare(String(y.fecha || "")));
  const ultimo = mayor(a.ultimo_dia, b.ultimo_dia);
  const racha = a.ultimo_dia === b.ultimo_dia ? Math.max(a.racha || 0, b.racha || 0) : (ultimo === a.ultimo_dia ? a.racha : b.racha) || 0;
  const r = { ...a, ...b, preguntas, sesiones: sesiones.slice(-200), puntos: Math.max(Number(a.puntos) || 0, Number(b.puntos) || 0), racha };
  if (ultimo) r.ultimo_dia = ultimo; else delete r.ultimo_dia;
  return r;
}

/**
 * Junta lo que trae una copia con lo que hay. Nunca borra: perfiles y pruebas se unen por id (gana lo traído), el progreso se
 * junta con `juntarProgreso`, los temas nuevos se agregan y un tema con el mismo id pero distinto contenido no se toca (se cuenta
 * en `omitidos`). Devuelve un resumen para mostrar.
 */
export async function juntar(almacen, entradas) {
  const r = { perfiles: 0, temas: 0, progreso: 0, pruebas: 0, material: 0, omitidos: 0 };
  const por = (ruta) => entradas.find((e) => e.ruta === ruta);
  const p = por("perfiles.json");
  if (p && Array.isArray(p.contenido)) {
    const nuevos = p.contenido.filter(perfilValido), ids = new Set(nuevos.map((x) => x.id));
    await almacen.escribirJSON("perfiles.json", (await almacen.perfiles()).filter((x) => !ids.has(x.id)).concat(nuevos));
    r.perfiles = nuevos.length;
  }
  const pr = por("pruebas.json");
  if (pr && Array.isArray(pr.contenido)) {
    const nuevas = pr.contenido.filter(pruebaValida), ids = new Set(nuevas.map((x) => x.id));
    await almacen.guardarPruebas((await almacen.pruebas()).filter((x) => !ids.has(x.id)).concat(nuevas));
    r.pruebas = nuevas.length;
  }
  const temasAgregados = new Set();
  for (const e of entradas.filter((x) => /^temas\/[^/]+\/tema\.json$/.test(x.ruta))) {
    const id = e.ruta.split("/")[1], t = e.contenido;
    if (!esObjeto(t) || t.id !== id || validar(t).length) { r.omitidos++; continue; }
    const actual = await almacen.leerJSON(e.ruta, null);
    if (actual && JSON.stringify(actual) !== JSON.stringify(t)) { r.omitidos++; continue; }
    if (!actual) { await almacen.escribirJSON(e.ruta, t); r.temas++; }
    temasAgregados.add(id);
  }
  for (const e of entradas.filter((x) => x.tipo === "base64" && x.ruta.includes("/material/"))) {
    const id = e.ruta.split("/")[1], ext = /\.[a-z0-9]+$/.exec(e.ruta)?.[0] || "";
    if (!temasAgregados.has(id) || !EXT_MATERIAL.test(ext) || (await almacen.a.existe(e.ruta))) continue;
    await almacen.a.escribirBase64(e.ruta, e.contenido); r.material++;
  }
  for (const e of entradas.filter((x) => x.ruta.startsWith("progreso/") && x.tipo === "json")) {
    const id = e.ruta.slice(9, -5);
    await almacen.guardarProgreso(id, juntarProgreso(await almacen.leerJSON(e.ruta, null), e.contenido));
    r.progreso++;
  }
  return r;
}
