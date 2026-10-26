// Los datos de Repasa con el mismo formato que en el computador (README, «Formato de los datos»), sobre un adaptador de
// almacenamiento: en el teléfono, archivos de la app (Capacitor Filesystem); en las pruebas, memoria. Las rutas son relativas a la
// carpeta Repasa y van con «/».
//
//   perfiles.json                 [{"id", "nombre", "curso", "avatar"}]   solo el primer nombre o un apodo
//   temas/<id>/tema.json          lo que hay que estudiar (validado con temas.validar)
//   temas/<id>/material/          copias de las fotos de donde salió el tema
//   progreso/<perfil>.json        cajas de repaso, puntos y racha de cada perfil
//   pruebas.json                  [{"id", "perfil", "ramo", "temas": [...], "fecha"}]
//   .repasa/config.json           ajustes de la app (idioma, IA)
//
// Adaptador (todas las funciones son async):
//   leerTexto(ruta) → string | null          escribirTexto(ruta, texto)  (crea carpetas; escribe en un temporal y lo renombra)
//   leerBase64(ruta) → string | null         escribirBase64(ruta, base64)
//   listar(carpeta) → [nombres] ([] si no existe)          existe(ruta) → bool
//   copiar(de, a)                             borrar(ruta)  (archivo o carpeta, sin error si no existe)
import { CURSOS, validar, esObjeto } from "./temas.js";

export const ID = /^[a-z0-9-]{1,80}$/;
export const ID_TEMA = /^[a-z0-9-]{2,60}$/;
export const EXT_MATERIAL = /^\.(jpg|jpeg|png|webp|heic|gif|pdf)$/;

export class Almacen {
  constructor(adaptador) { this.a = adaptador; }

  async leerJSON(ruta, defecto) {
    const t = await this.a.leerTexto(ruta);
    if (t == null) return defecto;
    try { return JSON.parse(t); } catch { return defecto; }
  }
  /** Igual que datos.escribir_json en Python: indentado con 1 espacio y salto de línea final. */
  escribirJSON(ruta, valor) { return this.a.escribirTexto(ruta, JSON.stringify(valor, null, 1) + "\n"); }

  async config() { const c = await this.leerJSON(".repasa/config.json", {}); return { ia: "telefono", idioma_ui: "", ...(esObjeto(c) ? c : {}) }; }
  async guardarConfig(cambios) {
    const actual = await this.leerJSON(".repasa/config.json", {});
    const limpio = {};
    for (const [k, v] of Object.entries(cambios || {})) if (/^[a-z_]{1,30}$/.test(k) && ["string", "boolean", "number"].includes(typeof v)) limpio[k] = v;
    await this.escribirJSON(".repasa/config.json", { ...(esObjeto(actual) ? actual : {}), ...limpio });
  }

  async perfiles() { const p = await this.leerJSON("perfiles.json", []); return Array.isArray(p) ? p.filter(perfilValido) : []; }
  async guardarPerfil(p) {
    if (!perfilValido(p)) throw new Error("Perfil no válido.");
    const limpio = { id: p.id, nombre: p.nombre.trim().slice(0, 20), curso: p.curso, avatar: p.avatar };
    await this.escribirJSON("perfiles.json", (await this.perfiles()).filter((x) => x.id !== p.id).concat(limpio));
  }

  async temas() {
    const r = [];
    for (const id of (await this.a.listar("temas")).sort()) {
      if (!ID_TEMA.test(id)) continue;
      const t = await this.leerJSON(`temas/${id}/tema.json`, null);
      if (t && !validar(t).length) r.push(t);
    }
    return r;
  }
  async tema(id) { if (!ID_TEMA.test(id || "")) return null; const t = await this.leerJSON(`temas/${id}/tema.json`, null); return t && !validar(t).length ? t : null; }

  /**
   * Guarda un tema validado (como `crear_tema.py guardar`): si el id ya existe usa «-2», «-3»…; copia el material (rutas relativas a
   * la carpeta Repasa, por ejemplo las fotos que quedaron en .repasa/temporal/) como material-1.jpg… y anota `fuente`.
   */
  async guardarTema(tema, materiales = []) {
    const problemas = validar(tema);
    if (problemas.length) return { ok: false, error: problemas.slice(0, 2).join(" ") };
    const t = JSON.parse(JSON.stringify(tema));
    const base = t.id;
    for (let n = 2; await this.a.existe(`temas/${t.id}`); n++) t.id = `${base}-${n}`;
    const nombres = [];
    for (const [k, origen] of materiales.entries()) {
      const ext = (/\.[a-z0-9]+$/i.exec(origen)?.[0] || "").toLowerCase();
      if (!EXT_MATERIAL.test(ext) || origen.includes("..")) continue;
      const destino = `material-${k + 1}${ext}`;
      await this.a.copiar(origen, `temas/${t.id}/material/${destino}`);
      nombres.push(destino);
    }
    if (nombres.length) t.fuente = nombres;
    await this.escribirJSON(`temas/${t.id}/tema.json`, t);
    return { ok: true, tema: t };
  }

  async progreso() {
    const r = {};
    for (const n of await this.a.listar("progreso")) {
      const id = n.replace(/\.json$/, "");
      if (!n.endsWith(".json") || !ID.test(id)) continue;
      const p = await this.leerJSON(`progreso/${n}`, null);
      if (esObjeto(p)) r[id] = p;
    }
    return r;
  }
  async guardarProgreso(perfil, progreso) {
    if (!ID.test(perfil || "") || !esObjeto(progreso)) throw new Error("Progreso no válido.");
    await this.escribirJSON(`progreso/${perfil}.json`, progreso);
  }

  async pruebas() { const p = await this.leerJSON("pruebas.json", []); return Array.isArray(p) ? p.filter(pruebaValida) : []; }
  async guardarPruebas(lista) {
    if (!Array.isArray(lista)) throw new Error("Pruebas no válidas.");
    await this.escribirJSON("pruebas.json", lista.filter(pruebaValida));
  }

  /** Todo lo que pinta la interfaz (lo mismo que manda la app de escritorio en `estado`). */
  async estado() {
    const [perfiles, temas, progreso, pruebas, config] = await Promise.all([this.perfiles(), this.temas(), this.progreso(), this.pruebas(), this.config()]);
    return { perfiles, temas, progreso, pruebas, config };
  }
}

export function perfilValido(p) {
  return esObjeto(p) && typeof p.id === "string" && ID.test(p.id) && typeof p.nombre === "string" && p.nombre.trim().length > 0 &&
    p.nombre.length <= 40 && CURSOS.includes(p.curso) && typeof p.avatar === "string" && [...p.avatar].length <= 8;
}
export function pruebaValida(x) {
  return esObjeto(x) && typeof x.id === "string" && ID.test(x.id) && typeof x.perfil === "string" && ID.test(x.perfil) &&
    typeof x.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) && Array.isArray(x.temas) && x.temas.every((t) => typeof t === "string");
}

/** Adaptador en memoria (pruebas y vista previa). `archivos` es un Map ruta → {texto} | {base64}. */
export function adaptadorMemoria(archivos = new Map()) {
  const norm = (r) => r.replace(/^\/+|\/+$/g, "");
  return {
    archivos,
    async leerTexto(r) { return archivos.get(norm(r))?.texto ?? null; },
    async escribirTexto(r, texto) { archivos.set(norm(r), { texto }); },
    async leerBase64(r) { const x = archivos.get(norm(r)); if (!x) return null; return x.base64 ?? btoa(String.fromCharCode(...new TextEncoder().encode(x.texto))); },
    async escribirBase64(r, base64) { archivos.set(norm(r), { base64 }); },
    async listar(c) {
      const p = norm(c) + "/", r = new Set();
      for (const k of archivos.keys()) if (k.startsWith(p)) r.add(k.slice(p.length).split("/")[0]);
      return [...r];
    },
    async existe(r) { const n = norm(r); return archivos.has(n) || [...archivos.keys()].some((k) => k.startsWith(n + "/")); },
    async copiar(de, a) { const x = archivos.get(norm(de)); if (!x) throw new Error("No existe " + de); archivos.set(norm(a), { ...x }); },
    async borrar(r) { const n = norm(r); for (const k of [...archivos.keys()]) if (k === n || k.startsWith(n + "/")) archivos.delete(k); },
  };
}
