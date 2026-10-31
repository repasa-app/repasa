// El anfitrión de Repasa en el celular: atiende las acciones del puente (host.enviar en ui/app.js) con el motor JS (motor/) y los
// plugins nativos, igual que Ventana.swift en el Mac. Todo queda en el teléfono; la única IA es la del propio teléfono (o, en la
// fase 2, el computador de la casa por la carpeta cifrada). No hay red: ni servidores, ni telemetría, ni llaves de API.
//
// Plugins (por el puente de Capacitor, sin empaquetador): Filesystem y Camera (oficiales), IaLocal y Carpeta (propios, en
// movil/plugins). `window.Capacitor.nativePromise` lo pone el puente nativo de Capacitor en la página.
import { Almacen } from "../motor/datos.js";
import { validar } from "../motor/temas.js";
import * as crear from "../motor/crear_tema.js";
import * as exp from "../motor/explicar.js";
import * as copia from "../motor/copia.js";

const CAP = window.Capacitor;
const llamar = (plugin, metodo, opciones = {}) => CAP.nativePromise(plugin, metodo, opciones);
const RAIZ = "Repasa"; // dentro de los datos de la app (Directory.Data: Documents en iOS, archivos internos en Android)
const DIR = "DATA";
const A = () => window.Repasa; // las funciones de la interfaz
const hoy = () => window.REPASA_HOY || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** La frase lista para mostrar de un error de la pieza «cifrado» (frase, dañado, no es una copia…); "" si es otro error. */
const deCifrado = (e) => (globalThis.PiezaCifrado && e instanceof globalThis.PiezaCifrado.ErrorCifrado ? e.message : "");
const cancelado = (e) => /cancel/i.test(String(e?.message || e)) || e?.code === "CANCELADO";

// ───────────── Archivos: el adaptador del motor sobre Capacitor Filesystem ─────────────
const ruta = (r) => `${RAIZ}/${String(r).replace(/^\/+/, "")}`;
const adaptador = {
  async leerTexto(r) { try { return (await llamar("Filesystem", "readFile", { path: ruta(r), directory: DIR, encoding: "utf8" })).data; } catch { return null; } },
  async leerBase64(r) { try { return (await llamar("Filesystem", "readFile", { path: ruta(r), directory: DIR })).data; } catch { return null; } },
  // Escribe en un temporal y lo renombra: si algo se corta a la mitad, el archivo anterior queda intacto.
  async escribirTexto(r, texto) { await escribir(r, { data: texto, encoding: "utf8" }); },
  async escribirBase64(r, base64) { await escribir(r, { data: base64 }); },
  async listar(c) {
    try { return (await llamar("Filesystem", "readdir", { path: ruta(c), directory: DIR })).files.map((f) => (typeof f === "string" ? f : f.name)); }
    catch { return []; }
  },
  async existe(r) { try { await llamar("Filesystem", "stat", { path: ruta(r), directory: DIR }); return true; } catch { return false; } },
  async copiar(de, a) {
    await asegurarCarpeta(a);
    await llamar("Filesystem", "copy", { from: ruta(de), to: ruta(a), directory: DIR, toDirectory: DIR });
  },
  async borrar(r) {
    try { await llamar("Filesystem", "deleteFile", { path: ruta(r), directory: DIR }); }
    catch { try { await llamar("Filesystem", "rmdir", { path: ruta(r), directory: DIR, recursive: true }); } catch { /* no existía */ } }
  },
};
async function asegurarCarpeta(r) {
  const carpeta = ruta(r).split("/").slice(0, -1).join("/");
  try { await llamar("Filesystem", "mkdir", { path: carpeta, directory: DIR, recursive: true }); } catch { /* ya existe */ }
}
async function escribir(r, datos) {
  await asegurarCarpeta(r);
  const tmp = `${r}.tmp-${Date.now().toString(36)}`;
  await llamar("Filesystem", "writeFile", { path: ruta(tmp), directory: DIR, ...datos });
  try { await llamar("Filesystem", "rename", { from: ruta(tmp), to: ruta(r), directory: DIR, toDirectory: DIR }); }
  catch {
    // Si el sistema no reemplaza al renombrar, se borra el anterior y se renombra (el temporal ya está completo).
    try { await llamar("Filesystem", "deleteFile", { path: ruta(r), directory: DIR }); } catch { /* no había */ }
    await llamar("Filesystem", "rename", { from: ruta(tmp), to: ruta(r), directory: DIR, toDirectory: DIR });
  }
}
const almacen = new Almacen(adaptador);
let baseArchivos = ""; // file:///…/Repasa, para mostrar las fotos del material con convertFileSrc

// ───────────── La IA del teléfono ─────────────
const MOTIVOS = {
  ios: { dispositivo: "Este iPhone no tiene Apple Intelligence (hace falta un iPhone 15 Pro o más nuevo).", desactivada: "Activa Apple Intelligence en Ajustes del iPhone.",
    descargando: "Apple Intelligence se está preparando en este iPhone. Prueba en un rato.", version: "Hace falta iOS 26 o más nuevo.", otro: "La IA de este teléfono no está disponible ahora." },
  android: { dispositivo: "Este teléfono no tiene Gemini Nano.", desactivada: "Este teléfono no tiene Gemini Nano.", descargando: "Gemini Nano se está descargando en este teléfono. Prueba en un rato.",
    version: "Este teléfono no tiene Gemini Nano.", otro: "La IA de este teléfono no está disponible ahora." },
};
let ia = { texto: false, ocr: false, motivo: "otro", plataforma: "", contexto: 4096 };
async function revisarIA() {
  try { ia = { ...ia, ...(await llamar("IaLocal", "disponible")) }; } catch { ia = { ...ia, texto: false, ocr: false, motivo: "otro" }; }
  return ia;
}
const nombreIA = () => (ia.plataforma === "ios" ? "Apple Intelligence" : ia.plataforma === "android" ? "Gemini Nano" : "La IA de este teléfono");
const detalleIA = () => (ia.texto ? "" : (MOTIVOS[ia.plataforma] || MOTIVOS.android)[ia.motivo] || MOTIVOS.android.otro);
/** `preguntar` para el motor: la respuesta del modelo o un Error con un mensaje para la persona. */
async function preguntarLocal(prompt, { maxTokens = 800, temperatura = 0.3 } = {}) {
  try {
    const r = await llamar("IaLocal", "preguntar", { prompt, maxTokens, temperatura });
    return String(r?.texto || "");
  } catch (e) {
    const codigo = e?.code || "";
    if (codigo === "FILTRO") throw new Error("La IA del teléfono no quiso responder con este material (sus filtros son estrictos). Prueba con otra foto o escríbelo a mano.");
    if (codigo === "CONTEXTO") throw new Error("El material es muy largo para la IA del teléfono. Prueba con menos fotos.");
    if (codigo === "IDIOMA") throw new Error("La IA del teléfono todavía no entiende este idioma.");
    throw new Error("La IA de este teléfono no pudo responder. Inténtalo de nuevo.");
  }
}
function iasParaLaInterfaz() {
  return [
    { id: "telefono", nombre: nombreIA(), instalada: !!ia.texto, detalle: detalleIA() },
    { id: "computador", nombre: "El computador de la casa", instalada: false, detalle: "Muy pronto: el computador de la casa hará el trabajo con su IA, por la carpeta de la familia." },
  ];
}

// ───────────── Catálogo incluido (temas/ de la app, validados) ─────────────
let catalogo = null;
async function cargarCatalogo() {
  if (catalogo) return catalogo;
  catalogo = [];
  try {
    for (const id of await (await fetch("temas/index.json")).json()) {
      const t = await (await fetch(`temas/${encodeURIComponent(id)}.json`)).json();
      if (!validar(t).length) catalogo.push(t);
    }
  } catch { /* sin catálogo */ }
  return catalogo;
}

// ───────────── Estado ─────────────
async function enviarEstado() {
  const [e] = await Promise.all([almacen.estado(), revisarIA(), cargarCatalogo()]);
  const tengo = new Set(e.temas.map((t) => t.id));
  A().estado({
    hoy: hoy(), ...e, ias: iasParaLaInterfaz(), version: window.REPASA_VERSION || "", carpeta: "", actualizacion: { hay: false },
    capacidades: { ia: !!ia.texto, ocr: !!ia.ocr, iaDetalle: detalleIA(), copia: true, camara: true },
    catalogo: catalogo.filter((t) => !tengo.has(t.id)).map(({ id, titulo, ramo, curso }) => ({ id, titulo, ramo, curso })),
  });
}

// ───────────── Fotos del cuaderno ─────────────
let fotos = 0;
async function elegirMaterial({ origen } = {}) {
  let elegidas = [];
  try {
    if (origen === "galeria") elegidas = (await llamar("Camera", "pickImages", { quality: 85, width: 2000, limit: 6, correctOrientation: true })).photos || [];
    else elegidas = [await llamar("Camera", "getPhoto", { quality: 85, width: 2000, resultType: "uri", source: "CAMERA", correctOrientation: true, saveToGallery: false })];
  } catch (e) { if (!cancelado(e)) A().materialElegido([]); return; }
  const lista = [];
  for (const f of elegidas) {
    const base64 = await leerFoto(f);
    if (!base64) continue;
    fotos += 1;
    const destino = `.repasa/temporal/foto-${Date.now().toString(36)}-${fotos}.jpg`;
    await adaptador.escribirBase64(destino, base64);
    lista.push({ ruta: destino, nombre: `foto-${fotos}.jpg` });
  }
  A().materialElegido(lista);
}
async function leerFoto(f) {
  try { return (await llamar("Filesystem", "readFile", { path: f.path })).data; } catch { /* sigue */ }
  try {
    const blob = await (await fetch(f.webPath)).blob();
    return await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = mal; r.readAsDataURL(blob); });
  } catch { return null; }
}
const uriDe = async (r) => (await llamar("Filesystem", "getUri", { path: ruta(r), directory: DIR })).uri;

// ───────────── Acciones del puente ─────────────
const temaAvance = (paso, total, texto) => A().temaAvance?.({ paso, total, texto });
const ACCIONES = {
  listo: () => enviarEstado(),
  config: (d) => almacen.guardarConfig(d),
  guardarProgreso: (d) => almacen.guardarProgreso(d.perfil, d.progreso),
  guardarPerfil: (d) => almacen.guardarPerfil(d.perfil),
  guardarPruebas: (d) => almacen.guardarPruebas(d.pruebas),
  elegirMaterial,
  async crearTema(d) {
    const archivos = (d.archivos || []).filter((r) => typeof r === "string" && r.startsWith(".repasa/temporal/") && !r.includes(".."));
    await revisarIA();
    if (!ia.texto) return A().temaCreado({ ok: false, error: "Este teléfono no tiene IA propia. Puedes escribir el tema a mano o elegir uno del catálogo." });
    const partes = [String(d.texto || "").trim()];
    if (archivos.length && !ia.ocr) return A().temaCreado({ ok: false, error: "Este teléfono no puede leer fotos. Escribe o pega el texto." });
    for (const [k, r] of archivos.entries()) {
      temaAvance(k + 1, archivos.length, "leer");
      try { partes.push(String((await llamar("IaLocal", "leerTexto", { ruta: await uriDe(r) })).texto || "").trim()); } catch { /* una foto ilegible no tumba las demás */ }
    }
    const texto = partes.filter(Boolean).join("\n\n");
    if (!texto) return A().temaCreado({ ok: false, error: "No pude leer texto en las fotos. Prueba de más cerca, derecha y con buena luz." });
    const config = await almacen.config();
    const r = await crear.crearLocal(preguntarLocal, { curso: d.curso, ramo: d.ramo, texto, hoy: hoy(), idioma: config.idioma_ui === "en" ? "en" : "es",
      nombreIA: nombreIA(), capacidad: { contexto: ia.contexto }, avance: (a, b) => temaAvance(a, b, "armar") });
    A().temaCreado(r);
  },
  temaAMano: async (d) => A().temaCreado(crear.temaAMano({ ...d, idioma: (await almacen.config()).idioma_ui === "en" ? "en" : "es" }, hoy())),
  async guardarTema(d) {
    const archivos = (d.archivos || []).filter((r) => typeof r === "string" && r.startsWith(".repasa/temporal/") && !r.includes(".."));
    const r = await almacen.guardarTema(d.tema, archivos);
    if (r.ok) for (const a of archivos) await adaptador.borrar(a);
    A().temaGuardado(r);
  },
  async agregarDelCatalogo(d) {
    const t = (await cargarCatalogo()).find((x) => x.id === d.id);
    A().temaGuardado(t ? await almacen.guardarTema(t) : { ok: false, error: "No encontré ese tema." });
  },
  async explicar(d) {
    await revisarIA();
    if (!ia.texto) return A().explicado({ ok: false, error: "Para explicarlo de otra forma hace falta la IA del teléfono." });
    const t = (await almacen.tema(d.tema)) || (await cargarCatalogo()).find((x) => x.id === d.tema);
    A().explicado(await exp.explicar(preguntarLocal, t, d.pregunta, String(d.respondio || "")));
  },
  // probarIA {ia} → iaProbada {ia, ok, texto?}: la misma forma que en el Mac (pieza «host-ui»). La IA del teléfono es «telefono».
  async probarIA(d) {
    const id = String(d.ia || "");
    if (id !== "telefono") return A().iaProbada({ ia: id, ok: false, texto: "Muy pronto: el computador de la casa hará el trabajo con su IA, por la carpeta de la familia." });
    try { await llamar("IaLocal", "preparar"); } catch { /* sigue */ }
    await revisarIA();
    if (!ia.texto) return A().iaProbada({ ia: id, ok: false, texto: detalleIA() });
    try {
      await preguntarLocal("Responde solo con la palabra: listo", { maxTokens: 10, temperatura: 0 });
      await enOrden(() => almacen.guardarConfig({ ia: "telefono" }));
      A().iaProbada({ ia: id, ok: true });
    } catch (e) { A().iaProbada({ ia: id, ok: false, texto: e.message }); }
  },
  abrirEnlace(d) {
    // Solo los enlaces conocidos de Repasa (Acerca de); Capacitor abre lo externo en el navegador del sistema.
    if (/^https:\/\/(repasa-app\.github\.io\/repasa\/|github\.com\/repasa-app\/)/.test(d.url || "")) window.location.href = d.url;
  },
  abrirCarpeta: () => {},
  buscarActualizacion: () => A().actualizacionRevisada({ hay: false }),
  async guardarCopia(d) {
    // La pieza «cifrado» (ui/cifrado.js) revisa la frase al armar: una corta da su frase («Usa una frase de al menos 12…»).
    try {
      const { texto, cantidad } = await copia.armarCopia(almacen, d.frase, hoy());
      await llamar("Carpeta", "exportar", { nombre: `Repasa-copia-${hoy()}.repasa`, texto });
      A().copiaLista({ ok: true, cantidad });
    } catch (e) { A().copiaLista(cancelado(e) ? { ok: false, cancelado: true } : { ok: false, error: deCifrado(e) || "No se pudo guardar la copia." }); }
  },
  async traerCopia(d) {
    if (!d.frase) return A().copiaTraida({ ok: false, error: "La frase no es la correcta." });
    let texto;
    try { texto = (await llamar("Carpeta", "importar")).texto; } catch (e) { return A().copiaTraida(cancelado(e) ? { ok: false, cancelado: true } : { ok: false, error: "No se pudo abrir el archivo." }); }
    try {
      const entradas = await copia.abrirCopia(texto, d.frase);
      const resumen = await enOrden(() => copia.juntar(almacen, entradas));
      A().copiaTraida({ ok: true, resumen });
      await enviarEstado();
    } catch (e) { A().copiaTraida({ ok: false, error: deCifrado(e) || "No se pudo abrir el archivo." }); }
  },
};

// Lo que lee y escribe archivos va en fila, una cosa a la vez (dos «config» seguidos no se pisan). Lo que espera a la IA, a la
// cámara o al selector de archivos no detiene la fila; cuando le toca escribir, se pone en ella (enOrden).
let fila = Promise.resolve();
const enOrden = (f) => (fila = fila.then(f, f));
const LARGAS = new Set(["crearTema", "explicar", "probarIA", "elegirMaterial", "guardarCopia", "traerCopia"]);
async function atender(msg) {
  const f = ACCIONES[msg?.accion];
  if (!f) return;
  const correr = async () => { try { await f(msg.datos || {}); } catch (e) { console.error("Repasa:", msg.accion, e); } };
  return LARGAS.has(msg.accion) ? correr() : enOrden(correr);
}

async function iniciar() {
  try { baseArchivos = await uriDe(""); } catch { baseArchivos = ""; }
  await adaptador.borrar(".repasa/temporal"); // fotos de un tema que no se guardó la vez anterior
  const cola = window.repasaMovil.cola.splice(0);
  window.repasaMovil = {
    enviar: (msg) => { atender(msg); },
    rutaMaterial: (t, f) => CAP.convertFileSrc(`${baseArchivos.replace(/\/+$/, "")}/temas/${encodeURIComponent(t.id)}/material/${encodeURIComponent(f)}`),
  };
  for (const m of cola) await atender(m);
}
iniciar();

export const _pruebas = { ACCIONES, adaptador, almacen };
