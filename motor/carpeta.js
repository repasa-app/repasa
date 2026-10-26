// FASE 2 (diseñado y probado, todavía sin usar en la app): la carpeta cifrada de la familia en su nube, para sincronizar sola y para
// que el computador de la casa haga el trabajo de la IA cuando el teléfono no tiene IA propia.
//
//   <carpeta elegida con el selector del sistema>/
//     repasa-carpeta.json     {"repasa": "carpeta", "v": 1, "kdf", "cifrado", "verificador"}   nada secreto
//     datos/<nombre>.repasa   un archivo de ~/Repasa por sobre; <nombre> = HMAC de su ruta (la nube no ve nombres)
//                             sobre: {"v": 1, "iv", "datos"} → {"ruta", "tipo", "contenido", "modificado"}
//     pedidos/<id>.repasa     del teléfono al computador: {"id", "tipo": "crearTema" | "explicar", "creado", "datos"}
//     respuestas/<id>.repasa  del computador al teléfono: {"id", "ok", "tema" | "texto" | "error"}
//
// Cada sobre va atado a su nombre de archivo (AAD «repasa:<carpeta>:<nombre>»): cambiar archivos de lugar no sirve de nada.
// El computador abre los pedidos con la misma frase (en su WebView, con este mismo motor), corre crear_tema.py o explicar.py con
// la suscripción del adulto sobre archivos ya descifrados en una carpeta temporal, y escribe la respuesta cifrada. El teléfono
// valida la respuesta (temas.validar / explicar.limpiar) como si viniera de cualquier IA.
import { nuevaCabecera, abrirCabecera, cifrarJSON, descifrarJSON, nombreOpaco, azar, ErrorDañado, MENSAJES } from "./cifrado.js";
import { validar, esObjeto, CURSOS, RAMOS } from "./temas.js";
import { limpiar } from "./explicar.js";
import { RUTA_PERMITIDA } from "./copia.js";

export const CABECERA = "repasa-carpeta.json";
const NOMBRE = /^[a-f0-9]{32}$/;
const ID_PEDIDO = /^[a-z0-9]{16,40}$/;

export async function crearCarpeta(frase) {
  const { cabecera, llaves } = await nuevaCabecera(frase);
  return { texto: JSON.stringify({ repasa: "carpeta", v: 1, ...cabecera }, null, 1), llaves };
}
export async function abrirCarpeta(texto, frase) {
  let c;
  try { c = JSON.parse(texto); } catch { throw new ErrorDañado(MENSAJES.dañado); }
  if (!esObjeto(c) || c.repasa !== "carpeta" || c.v !== 1) throw new ErrorDañado(MENSAJES.dañado);
  return abrirCabecera(c, frase);
}

// ───── datos/ ─────
export async function sobreDeArchivo(llaves, entrada) {
  if (!RUTA_PERMITIDA.test(entrada?.ruta || "")) throw new Error("Ruta no permitida.");
  const nombre = await nombreOpaco(llaves, entrada.ruta);
  const sobre = await cifrarJSON(llaves, entrada, `repasa:datos:${nombre}`);
  return { ruta: `datos/${nombre}.repasa`, texto: JSON.stringify({ v: 1, ...sobre }) };
}
export async function archivoDeSobre(llaves, nombreArchivo, texto) {
  const nombre = nombreArchivo.replace(/\.repasa$/, "");
  if (!NOMBRE.test(nombre)) throw new ErrorDañado(MENSAJES.dañado);
  let s;
  try { s = JSON.parse(texto); } catch { throw new ErrorDañado(MENSAJES.dañado); }
  const e = await descifrarJSON(llaves, s, `repasa:datos:${nombre}`);
  if (!esObjeto(e) || !RUTA_PERMITIDA.test(e.ruta || "") || (await nombreOpaco(llaves, e.ruta)) !== nombre) throw new ErrorDañado(MENSAJES.dañado);
  return e;
}

// ───── pedidos/ y respuestas/ (relevo por el computador) ─────
const nuevoId = () => [...azar(12)].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24);

/** Pedido para el computador. crearTema: {curso, ramo, texto, imagenes: [{ext, base64}]}; explicar: {tema, pregunta, respondio}. */
export async function armarPedido(llaves, tipo, datos, hoy) {
  if (tipo === "crearTema") {
    if (!CURSOS.includes(datos?.curso) || !(datos.ramo === "auto" || Object.hasOwn(RAMOS, datos.ramo))) throw new Error("Pedido no válido.");
  } else if (tipo !== "explicar") throw new Error("Pedido no válido.");
  const id = nuevoId();
  const sobre = await cifrarJSON(llaves, { id, tipo, creado: hoy, datos }, `repasa:pedidos:${id}`);
  return { id, ruta: `pedidos/${id}.repasa`, texto: JSON.stringify({ v: 1, ...sobre }) };
}
export async function leerPedido(llaves, id, texto) {
  if (!ID_PEDIDO.test(id)) throw new ErrorDañado(MENSAJES.dañado);
  const p = await descifrarJSON(llaves, JSON.parse(texto), `repasa:pedidos:${id}`);
  if (!esObjeto(p) || p.id !== id || !["crearTema", "explicar"].includes(p.tipo)) throw new ErrorDañado(MENSAJES.dañado);
  return p;
}
export async function armarRespuesta(llaves, id, respuesta) {
  if (!ID_PEDIDO.test(id)) throw new Error("Pedido no válido.");
  const sobre = await cifrarJSON(llaves, { ...respuesta, id }, `repasa:respuestas:${id}`);
  return { ruta: `respuestas/${id}.repasa`, texto: JSON.stringify({ v: 1, ...sobre }) };
}
/** La respuesta del computador se valida igual que la de cualquier IA antes de mostrarse. */
export async function leerRespuesta(llaves, id, texto) {
  if (!ID_PEDIDO.test(id)) throw new ErrorDañado(MENSAJES.dañado);
  const r = await descifrarJSON(llaves, JSON.parse(texto), `repasa:respuestas:${id}`);
  if (!esObjeto(r) || r.id !== id) throw new ErrorDañado(MENSAJES.dañado);
  if (!r.ok) return { ok: false, error: typeof r.error === "string" ? r.error.slice(0, 300) : "El computador no pudo hacerlo." };
  if (esObjeto(r.tema)) { const p = validar(r.tema); return p.length ? { ok: false, error: p[0] } : { ok: true, tema: r.tema }; }
  if (typeof r.texto === "string") return { ok: true, texto: limpiar(r.texto) };
  return { ok: false, error: MENSAJES.dañado };
}
