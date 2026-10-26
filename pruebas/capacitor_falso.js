// Capacitor falso para probar la app del celular en un navegador (pruebas/interfaz.mjs con MOVIL=1 y pruebas/movil.mjs).
// Imita el puente nativo (window.Capacitor.nativePromise) y los plugins que usa movil/host/host.js: Filesystem (en memoria),
// Camera (una foto ficticia), IaLocal (una IA falsa con respuestas fijas) y Carpeta (guardar y traer la copia cifrada).
// Nunca toca archivos reales ni la red. `window._semilla` (opcional) son los datos ficticios de ui/demo.json para empezar.
(() => {
  const fs = (window._fs = new Map()); // "Repasa/perfiles.json" → {data, encoding}
  const b64 = (t) => btoa(String.fromCharCode(...new TextEncoder().encode(t)));
  const deB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
  const norm = (p) => String(p || "").replace(/^file:\/\/\/falso\//, "").replace(/^\/+|\/+$/g, "");
  const falla = (message, code = "OS-PLUG-FILE-0008") => Promise.reject(Object.assign(new Error(message), { code }));
  const hijos = (dir) => { const p = norm(dir) + "/", r = new Map(); for (const k of fs.keys()) if (k.startsWith(p)) { const resto = k.slice(p.length).split("/"); r.set(resto[0], resto.length > 1 ? "directory" : "file"); } return r; };
  const FOTO = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP////////////////////////////////////////////////////////////////////////////////////8AAAsIAAEAAQEBEQD/xAAUAAEAAAAAAAAAAAAAAAAAAAAA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAAPwBH/9k=";
  window._ia = window._ia || { texto: true, ocr: true, motivo: "", plataforma: "ios", modelo: "apple", contexto: 4096 };
  window._pedidosIA = [];
  const RESPUESTAS = {
    resumen: "TÍTULO: La Patria Vieja\nRAMO: historia\nRESUMEN: Entre 1810 y 1814 los criollos formaron sus primeros gobiernos. Terminó con la derrota de Rancagua.",
    conceptos: "Patria Vieja: de 1810 a 1814.\nPrimera Junta: el primer gobierno criollo, en 1810.",
    preguntas: "¿Qué se formó el 18 de septiembre de 1810?\n* La Primera Junta\n- El Congreso\n- El Ejército de los Andes\n> Ese día se formó la Primera Junta.\n\nLa Patria Vieja terminó en Rancagua.\n* Verdadero\n> Fue en 1814.\n\nEn 1814 se perdió la batalla de ___.\n* Rancagua\n> Así terminó la Patria Vieja.",
    mas: "¿En qué año terminó la Patria Vieja?\n* 1814\n- 1810\n- 1818\n> Terminó con la derrota de Rancagua.",
  };
  const P = {
    Filesystem: {
      readFile({ path, encoding }) {
        if (/^file:\/\/\/falso\/camara\//.test(path)) return { data: FOTO };
        const x = fs.get(norm(path));
        if (!x) return falla("File does not exist.");
        if (encoding === "utf8") return { data: x.encoding === "utf8" ? x.data : deB64(x.data) };
        return { data: x.encoding === "utf8" ? b64(x.data) : x.data };
      },
      writeFile({ path, data, encoding }) { fs.set(norm(path), { data, encoding: encoding === "utf8" ? "utf8" : "base64" }); return { uri: "file:///falso/" + norm(path) }; },
      readdir({ path }) { const h = hijos(path); return h.size ? { files: [...h].map(([name, type]) => ({ name, type })) } : falla("Directory does not exist."); },
      stat({ path }) { const n = norm(path); return fs.has(n) ? { type: "file" } : hijos(n).size ? { type: "directory" } : falla("File does not exist."); },
      mkdir() { return {}; },
      rename({ from, to }) { const x = fs.get(norm(from)); if (!x) return falla("File does not exist."); fs.delete(norm(from)); fs.set(norm(to), x); return {}; },
      copy({ from, to }) { const x = fs.get(norm(from)); if (!x) return falla("File does not exist."); fs.set(norm(to), { ...x }); return { uri: "file:///falso/" + norm(to) }; },
      deleteFile({ path }) { return fs.delete(norm(path)) ? {} : falla("File does not exist."); },
      rmdir({ path }) { const p = norm(path); for (const k of [...fs.keys()]) if (k.startsWith(p + "/")) fs.delete(k); return {}; },
      getUri({ path }) { return { uri: "file:///falso/" + norm(path) }; },
    },
    Camera: {
      getPhoto() { return window._camaraCancela ? falla("User cancelled photos app", "") : { path: "file:///falso/camara/foto.jpg", webPath: "/_camara_/foto.jpg", format: "jpeg" }; },
      pickImages() { return { photos: [1, 2].map((n) => ({ path: `file:///falso/camara/galeria-${n}.jpg`, webPath: `/_camara_/galeria-${n}.jpg`, format: "jpeg" })) }; },
    },
    IaLocal: {
      disponible: () => ({ ...window._ia }),
      preparar: () => ({}),
      leerTexto: ({ ruta }) => (window._ia.ocr ? { texto: `La Patria Vieja (1810-1814). La Primera Junta. Rancagua. [${norm(ruta).split("/").pop()}]` } : falla("Sin OCR", "NO_DISPONIBLE")),
      preguntar({ prompt }) {
        window._pedidosIA.push(prompt);
        if (!window._ia.texto) return falla("La IA no está disponible.", "NO_DISPONIBLE");
        if (prompt.startsWith("Responde solo con la palabra")) return { texto: "listo" };
        if (prompt.includes("no entendió esta pregunta")) return { texto: "## Imagínate una **carrera** de postas: <b>Rancagua</b> fue cuando se cayó el bastón." };
        const tipo = prompt.includes("TÍTULO:") ? "resumen" : prompt.includes("Término: definición") ? "conceptos" : prompt.includes("Ya están estas") ? "mas" : "preguntas";
        return { texto: RESPUESTAS[tipo] };
      },
    },
    Carpeta: {
      exportar({ nombre, texto }) { window._exportado = { nombre, texto }; return {}; },
      importar() { return window._exportado ? { texto: window._exportado.texto } : falla("cancelado", "CANCELADO"); },
    },
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    nativePromise(plugin, metodo, opciones) {
      const f = P[plugin]?.[metodo];
      if (!f) return Promise.reject(Object.assign(new Error(`${plugin}.${metodo} no está implementado`), { code: "UNIMPLEMENTED" }));
      // Asíncrono como el puente de verdad (las respuestas llegan después).
      return new Promise((ok, mal) => setTimeout(() => Promise.resolve().then(() => f(opciones || {})).then(ok, mal), 5));
    },
    convertFileSrc: (p) => String(p).replace("file:///falso/", "/_archivos_/"),
  };
  // Datos ficticios para empezar (los de ui/demo.json), con el mismo formato que en disco.
  const s = window._semilla;
  if (s) {
    const json = (r, v) => fs.set("Repasa/" + r, { data: JSON.stringify(v, null, 1) + "\n", encoding: "utf8" });
    json("perfiles.json", s.perfiles || []);
    json("pruebas.json", s.pruebas || []);
    for (const t of s.temas || []) json(`temas/${t.id}/tema.json`, t);
    for (const [id, p] of Object.entries(s.progreso || {})) json(`progreso/${id}.json`, p);
    json(".repasa/config.json", { ia: "telefono", bienvenida: !new URLSearchParams(location.search).has("bienvenida") });
    if (s.hoy) window.REPASA_HOY = s.hoy;
  }
})();
