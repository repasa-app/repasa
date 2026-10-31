// Interfaz de Repasa: la misma en Mac (WKWebView), Windows y Linux (Electron), iPhone y Android (Capacitor, movil/) y en el navegador
// (vista previa con demo.json).
// La app manda el estado con window.Repasa.estado(json); la interfaz pide cosas con host.enviar(accion, datos).
// La lógica del repaso (cajas, qué preguntar hoy, corregir, puntos y racha) vive aquí y se prueba con pruebas/casos.json.
(() => {
  "use strict";
  // ───────────── Puente con la app: pieza «host-ui» (ui/host.js) ─────────────
  // Mac (webkit.messageHandlers.repasa), celular (window.repasaMovil, de movil/host/) o el navegador (simular, más abajo). Deja
  // <html data-host> puesto; las respuestas de la app quedan en window.Repasa (host.responder, al final).
  const host = window.PiezaHost.crearHost({ nombre: "repasa", global: "Repasa", simular: (accion, d, c) => simular(accion, d, c) });
  const HOST = host.plataforma;
  const MOVIL = host.esMovil; // en el celular: textos de «este teléfono», cámara, copia cifrada y sin carpeta ni actualizaciones
  const E = {
    hoy: "", perfiles: [], temas: [], progreso: {}, pruebas: [], config: {}, ias: [], version: "", carpeta: "", actualizacion: { hay: false },
    perfil: null, vista: "inicio", temaSel: null, pestana: "resumen", volteadas: {}, sesion: null, nuevo: null, prueba: null, perfilEdit: null,
    adultos: false, bv: null, bvCerrada: false, idioma: "es",
    capacidades: {}, catalogo: null, copia: { frase: "", estado: "", error: "" },
  };
  const ENLACES = { sitio: "https://repasa-app.github.io/repasa/", codigo: "https://github.com/repasa-app/repasa",
    comunidad: "https://github.com/repasa-app/repasa/discussions", guiaIA: "https://repasa-app.github.io/repasa/ia.html" };
  const RAMOS = { lenguaje: "Lenguaje", matematica: "Matemática", historia: "Historia", ciencias: "Ciencias", ingles: "Inglés", biologia: "Biología",
    quimica: "Química", fisica: "Física", filosofia: "Filosofía", artes: "Artes", tecnologia: "Tecnología", musica: "Música", otro: "Otro" };
  const EMOJI_RAMO = { lenguaje: "📖", matematica: "➗", historia: "🏛️", ciencias: "🔬", ingles: "🇬🇧", biologia: "🧬", quimica: "⚗️", fisica: "🧲", filosofia: "💭", artes: "🎨", tecnologia: "💻", musica: "🎵", otro: "📝" };
  const CURSOS = { "5b": "5° básico", "6b": "6° básico", "7b": "7° básico", "8b": "8° básico", "1m": "1° medio", "2m": "2° medio", "3m": "3° medio", "4m": "4° medio" };
  const AVATARES = ["🦊", "🐼", "🐨", "🐸", "🦁", "🐯", "🐙", "🦄", "🐢", "🐧", "🦉", "🐶", "🐱", "🦖"];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ───────────── Idiomas: pieza «i18n» (ui/i18n.js, de Pieza; las claves son el texto en español) ─────────────
  // T() escapa la frase y sus valores (un nombre o un título nunca entra como HTML); Thtml() es SOLO para HTML que arma el propio
  // código, con lo de la persona ya pasado por esc(); tr() traduce un texto ya armado y traducirDOM() lo ya pintado (nunca entra a
  // [data-sin-traducir]). Los paquetes de idioma se validan antes de usarse (sin HTML, mismos marcadores).
  const i18n = window.PiezaI18n.crear();
  const { T, Thtml, tr, frase } = i18n;
  const traducirDOM = (raiz) => i18n.traducirDOM(raiz);
  const idiomaSistema = () => i18n.idiomaDelSistema();
  /** Carga los textos del idioma. `elegido` viene de la persona (bienvenida o Ajustes) y manda sobre ?idioma= de la vista previa. */
  async function cargarIdioma(elegido) {
    await i18n.cargar(i18n.elegir({ elegido, config: E.config.idioma_ui }));
    E.idioma = i18n.idioma;
  }

  // ───────────── Tema y componentes: piezas «tema» (ui/tema.js) y «componentes» (ui/componentes.js) ─────────────
  // Sistema, claro u oscuro (Para adultos → General). Diálogos con el foco adentro y Esc, avisos en cola, las filas de la IA y de
  // las actualizaciones. `mantener` es el pintar de Repasa (conserva el scroll); `cerrar` es Esc, el velo o ✕ sobre sus diálogos.
  const tema = window.PiezaTema.crear({ guardar: (v) => { E.config.tema = v; host.enviar("config", { tema: v }); } });
  const avisosEnEspera = [];
  const ui = window.PiezaComponentes.crear({
    i18n, host, app: "Repasa", repo: "repasa-app/repasa",
    pintar: () => mantener(),
    cerrar: () => cerrarDialogo(),
    // La app nativa ya guardó la IA que probó bien (Config / almacén del teléfono): aquí solo se anota.
    elegirIA: (id) => { E.config.ia = id; },
    // Mientras se elige el idioma no se muestra nada más: los avisos esperan y salen ya en el idioma elegido.
    retener: (texto, o) => { if (E.bv !== 0) return false; avisosEnEspera.push([texto, o]); return true; },
  });
  const toast = (texto, o) => ui.aviso(texto, o);

  // ───────────── Lógica del repaso (casos en pruebas/casos.json) ─────────────
  const INTERVALOS = [0, 1, 3, 7, 14, 30]; // días hasta volver a preguntar, según la caja (1 a 5)
  function sumarDias(fecha, n) { const d = new Date(fecha + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
  /** Cajas de repaso (Leitner): acierto sube una caja y espera más días; error vuelve a la caja 1 y se pregunta hoy. */
  function actualizarCaja(estado, correcta, hoy) {
    const e = { caja: 0, aciertos: 0, errores: 0, ...(estado || {}) };
    const caja = correcta ? Math.min(5, (e.caja || 0) + 1) : 1;
    return { caja, proxima: correcta ? sumarDias(hoy, INTERVALOS[caja]) : hoy, aciertos: e.aciertos + (correcta ? 1 : 0), errores: e.errores + (correcta ? 0 : 1), ultima: hoy };
  }
  const normalizar = (t) => String(t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ/ ]/g, " ").replace(/\s+/g, " ").trim();
  function distancia(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }
  /** ¿Está bien? En «completar» no importan mayúsculas ni tildes, y se perdona una letra en palabras de 6 o más (así «nuevo» no pasa por «nueva»). */
  function esCorrecta(p, respuesta) {
    if (p.tipo === "alternativas") return respuesta === p.correcta;
    if (p.tipo === "vf") return respuesta === p.correcta;
    const r = normalizar(respuesta);
    return !!r && p.correcta.some((c) => { const n = normalizar(c); return r === n || (n.length >= 6 && distancia(r, n) <= 1); });
  }
  /** Las preguntas de hoy: primero las que tocan (o que se fallaron), después nuevas, con prioridad a los temas de una prueba cercana. */
  function elegirSesion(temas, progreso, hoy, pruebas, maximo = 12) {
    const urgentes = new Set((pruebas || []).filter((x) => { const d = diasEntre(hoy, x.fecha); return d >= 0 && d <= 4; }).flatMap((x) => x.temas));
    const todas = temas.flatMap((t) => t.preguntas.map((p) => ({ clave: `${t.id}/${p.id}`, tema: t.id, p, est: progreso.preguntas?.[`${t.id}/${p.id}`] })));
    const peso = (x) => (urgentes.has(x.tema) ? 0 : 1);
    const tocan = todas.filter((x) => x.est && x.est.proxima <= hoy).sort((a, b) => peso(a) - peso(b) || a.est.caja - b.est.caja || a.clave.localeCompare(b.clave));
    const nuevas = todas.filter((x) => !x.est).sort((a, b) => peso(a) - peso(b) || a.p.dificultad - b.p.dificultad || a.clave.localeCompare(b.clave));
    const repasoPrueba = todas.filter((x) => x.est && x.est.proxima > hoy && urgentes.has(x.tema) && x.est.caja < 5).sort((a, b) => a.est.caja - b.est.caja);
    const elegidas = [...tocan, ...nuevas, ...repasoPrueba].slice(0, maximo);
    return elegidas.map((x) => x.clave);
  }
  function actualizarRacha(prog, hoy) {
    if (prog.ultimo_dia === hoy) return prog.racha || 1;
    return prog.ultimo_dia && diasEntre(prog.ultimo_dia, hoy) === 1 ? (prog.racha || 0) + 1 : 1;
  }
  const PUNTOS = { acierto: 10, intento: 2, sesionPerfecta: 30 };
  /** Qué tan dominado está un tema: % de sus preguntas en caja 3 o más. */
  function dominio(t, prog) {
    const n = t.preguntas.length;
    return n ? Math.round(t.preguntas.filter((p) => (prog.preguntas?.[`${t.id}/${p.id}`]?.caja || 0) >= 3).length / n * 100) : 0;
  }

  // ───────────── Utilidades ─────────────
  const perfil = () => E.perfiles.find((p) => p.id === E.perfil);
  const prog = () => (E.progreso[E.perfil] ||= { preguntas: {}, puntos: 0, racha: 0, sesiones: [] });
  const temasDe = (pf) => E.temas.filter((t) => t.curso === pf.curso);
  const temaPorId = (id) => E.temas.find((t) => t.id === id);
  const color = (ramo) => `var(--${RAMOS[ramo] ? ramo : "otro"})`;
  const nombreIA = () => tr(E.ias.find((i) => i.id === E.config.ia)?.nombre || "tu IA");
  function fechaLarga(f) { const [a, m, d] = f.split("-").map(Number); return new Date(a, m - 1, d).toLocaleDateString(E.idioma === "es" ? "es-CL" : "en-US", { weekday: "long", day: "numeric", month: "long" }); }
  const guardarProgreso = () => host.enviar("guardarProgreso", { perfil: E.perfil, progreso: prog() });
  const elegir = (lista, semilla) => lista[Math.abs([...semilla].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % lista.length];

  // ───────────── Pintar ─────────────
  function pintar() {
    const raiz = $("#app"), activo = document.activeElement?.id, y = window.scrollY;
    // Primer uso: mientras se elige el idioma no se muestra nada más (ni perfiles ni ajustes), para no hablarle en otro idioma.
    const soloIdioma = E.bv === 0;
    raiz.innerHTML = `${barra(soloIdioma)}<main>${soloIdioma ? "" : principal()}</main>${dialogos()}${ui.capas()}`;
    traducirDOM(raiz);
    if (activo) document.getElementById(activo)?.focus();
    ui.despuesDePintar(); // el foco entra al diálogo que se abrió, queda adentro y vuelve a donde estaba al cerrarlo
    if (E._mantener) window.scrollTo(0, y); else window.scrollTo(0, 0);
    E._mantener = false;
  }
  const mantener = () => { E._mantener = true; pintar(); };

  function barra(soloMarca = false) {
    const pf = soloMarca ? null : perfil();
    return `<header class="barra"><span class="marca">${LOGO}<span>Repasa</span></span><span class="espacio"></span>
      ${pf ? `<span class="marcador" title="Racha de días seguidos">🔥 <span data-sin-traducir>${esc(prog().racha || 0)}</span></span>
        <span class="marcador" title="Puntos">⭐ <span data-sin-traducir>${esc(prog().puntos || 0)}</span></span>
        <button class="chip-perfil" data-accion="cambiar-perfil" title="Cambiar de perfil"><span class="av" aria-hidden="true">${esc(pf.avatar)}</span><span data-sin-traducir>${esc(pf.nombre)}</span></button>` : ""}
      ${soloMarca ? "" : `<button class="icono" data-accion="adultos" title="Para adultos" aria-label="Para adultos">⚙︎</button>`}</header>`;
  }

  function principal() {
    if (!perfil()) return elegirPerfil();
    if (E.sesion) return E.sesion.fin ? finSesion() : vistaSesion();
    if (E.vista === "tema" && temaPorId(E.temaSel)) return vistaTema();
    return inicio();
  }

  function elegirPerfil() {
    return `<section class="perfiles"><div><h1>¿Quién va a repasar?</h1><p>Elige tu perfil para seguir donde quedaste.</p>
      <div class="lista-perfiles">${E.perfiles.map((p) => `<button class="perfil" data-perfil="${esc(p.id)}"><span class="av" aria-hidden="true">${esc(p.avatar)}</span>
        <b data-sin-traducir>${esc(p.nombre)}</b><small data-sin-traducir>${esc(tr(CURSOS[p.curso] || ""))}</small></button>`).join("")}
        <button class="perfil nuevo" data-accion="nuevo-perfil"><span class="av" aria-hidden="true">＋</span><b>Nuevo perfil</b><small>Para otro estudiante</small></button></div></div></section>`;
  }

  function inicio() {
    const pf = perfil(), p = prog(), temas = temasDe(pf);
    const hoyClaves = elegirSesion(temas, p, E.hoy, E.pruebas.filter((x) => x.perfil === pf.id));
    const prueba = E.pruebas.filter((x) => x.perfil === pf.id && x.fecha >= E.hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    const hora = new Date().getHours(), saludo = hora < 12 ? "¡Buenos días, {n}!" : hora < 20 ? "¡Hola, {n}!" : "¡Buenas noches, {n}!";
    const dominadas = Object.values(p.preguntas || {}).filter((x) => x.caja >= 3).length;
    const tarjetaHoy = `<div class="repaso-hoy"><span class="deco" aria-hidden="true">✏️</span><h2>Tu repaso de hoy</h2>
      ${hoyClaves.length ? `<div class="grande" data-sin-traducir>${T(hoyClaves.length === 1 ? "1 pregunta" : "{n} preguntas", { n: hoyClaves.length })}</div>
        <p>${frase("Unos {m} minutos. ¡Tú puedes!", { m: Math.max(2, Math.round(hoyClaves.length * 0.6)) })}</p>
        <button class="pz-boton grande" data-accion="empezar">Empezar ▶</button>`
        : temas.length ? `<div class="grande">¡Todo al día! 🎉</div><p>Vuelve mañana o practica un tema que quieras.</p>`
          : `<div class="grande">Agrega tu primer tema</div><p>Saca una foto a tu cuaderno y Repasa arma las preguntas.</p><button class="pz-boton grande" data-accion="nuevo-tema">＋ Nuevo tema</button>`}</div>`;
    const tarjetaPrueba = prueba
      ? `<div class="prueba-prox"><h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--texto-suave)">Próxima prueba</h2>
          <div class="dias" data-sin-traducir>${(() => { const d = diasEntre(E.hoy, prueba.fecha); return d === 0 ? T("¡Hoy!") : d === 1 ? T("Mañana") : `${d} <small>${T("días")}</small>`; })()}</div>
          <p data-sin-traducir>${esc(tr(RAMOS[prueba.ramo] || ""))} · ${esc(fechaLarga(prueba.fecha))}</p>
          <button class="pz-boton" data-accion="editar-prueba" data-prueba="${esc(prueba.id)}">Cambiar</button></div>`
      : `<div class="prueba-prox"><h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--texto-suave)">¿Tienes prueba?</h2>
          <p style="margin-top:8px">Dime cuándo y te preparo un repaso para llegar listo.</p><button class="pz-boton" data-accion="nueva-prueba">📅 Agregar prueba</button></div>`;
    const porRamo = {};
    for (const t of temas) (porRamo[t.ramo] ||= []).push(t);
    const tarjetasTema = temas.map((t) => `<button class="tema" data-tema="${esc(t.id)}" style="--c:${color(t.ramo)}">
      <span class="ramo" data-sin-traducir>${EMOJI_RAMO[t.ramo] || "📝"} ${esc(tr(RAMOS[t.ramo]))}</span><b data-sin-traducir>${esc(t.titulo)}</b>
      <span class="barra-dom"><i style="width:${dominio(t, p)}%"></i></span><small data-sin-traducir>${T("{n} % dominado", { n: dominio(t, p) })}</small></button>`).join("");
    return `<div class="contenido"><div class="saludo"><h1 data-sin-traducir>${Thtml(saludo, { n: `<span>${esc(pf.nombre)}</span>` })}</h1></div>
      <div class="hoy">${tarjetaHoy}${tarjetaPrueba}</div>
      <div class="cifras"><div class="cifra"><b data-sin-traducir>🔥 ${esc(p.racha || 0)}</b><small>días seguidos</small></div>
        <div class="cifra"><b data-sin-traducir>⭐ ${esc(p.puntos || 0)}</b><small>puntos</small></div>
        <div class="cifra"><b data-sin-traducir>✅ ${esc(dominadas)}</b><small>preguntas dominadas</small></div></div>
      <div class="seccion-titulo"><h2>Mis temas</h2></div>
      <div class="rejilla-temas">${tarjetasTema}<button class="tema nuevo" data-accion="nuevo-tema"><span style="font-size:28px" aria-hidden="true">📸</span><b>Nuevo tema</b><small>Foto del cuaderno, guía o texto</small></button></div>
      ${temas.length ? `<div class="accion-inferior"><button class="pz-boton pz-principal grande" data-accion="nuevo-tema">📸 Nuevo tema</button></div>` : ""}</div>`;
  }

  const PESTANAS = [["resumen", "Explicado fácil"], ["conceptos", "Conceptos"], ["tarjetas", "Tarjetas"], ["material", "Material"]];
  function vistaTema() {
    const t = temaPorId(E.temaSel), p = prog();
    let cuerpo;
    if (E.pestana === "conceptos") cuerpo = `<div class="tarjeta"><div class="conceptos" data-sin-traducir>${t.conceptos.map((c) => `<div class="concepto"><b>${esc(c.termino)}</b><span>${esc(c.definicion)}</span></div>`).join("") || esc(tr("Este tema no tiene conceptos."))}</div></div>`;
    else if (E.pestana === "tarjetas") cuerpo = `<p class="nota" style="margin:0 0 12px">Toca una tarjeta para darla vuelta. Intenta responder antes de mirar.</p>
      <div class="tarjetas" data-sin-traducir>${t.tarjetas.map((c, k) => `<button class="flip" data-flip="${k}" aria-pressed="${!!E.volteadas[k]}" style="--c:${color(t.ramo)}"><span class="caras"><span class="cara">${esc(c.frente)}</span><span class="cara atras">${esc(c.reverso)}</span></span></button>`).join("")}</div>`;
    else if (E.pestana === "material") cuerpo = `<div class="tarjeta">${(t.fuente || []).length ? `<div class="material">${(t.fuente || []).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f)).map((f) => `<img src="${esc(rutaMaterial(t, f))}" alt="${esc(tr("Material del tema"))}">`).join("")}</div>
      <p class="nota">${frase(MOVIL ? "{n} fotos guardadas en este teléfono." : "{n} archivos guardados en tu computador.", { n: t.fuente.length })}</p>` : `<p class="nota" style="margin:0">Este tema no tiene fotos ni archivos: vino del catálogo o se escribió a mano.</p>`}</div>`;
    else cuerpo = `<div class="tarjeta"><p class="resumen" data-sin-traducir style="margin:0">${esc(t.resumen)}</p></div>`;
    return `<div class="contenido"><button class="pz-boton pz-plano" data-accion="volver" style="margin:4px 0 8px">← <span>Volver</span></button>
      <div class="cab-tema" style="--c:${color(t.ramo)}"><div><span class="ramo" data-sin-traducir>${EMOJI_RAMO[t.ramo] || "📝"} ${esc(tr(RAMOS[t.ramo]))} · ${esc(tr(CURSOS[t.curso]))}</span><h1 data-sin-traducir>${esc(t.titulo)}</h1>
        <p class="nota" data-sin-traducir>${T("{n} preguntas · {d} % dominado", { n: t.preguntas.length, d: dominio(t, p) })}</p></div>
        <div class="acciones"><button class="pz-boton pz-principal grande" data-practicar="${esc(t.id)}">Practicar ▶</button></div></div>
      <div class="pestanas" role="tablist">${PESTANAS.map(([id, n]) => `<button class="pestana" role="tab" data-pestana="${id}" aria-selected="${E.pestana === id}">${n}</button>`).join("")}</div>${cuerpo}</div>`;
  }
  const rutaMaterial = (t, f) => (HOST === "web" ? `demo/${f}` : MOVIL ? window.repasaMovil?.rutaMaterial?.(t, f) || ""
    : `repasa://material/${encodeURIComponent(t.id)}/${encodeURIComponent(f)}`);

  // ───────────── Sesión de preguntas ─────────────
  const BIEN = ["¡Bien!", "¡Excelente!", "¡Eso es!", "¡Muy bien!", "¡Perfecto!", "¡Sabía que podías!"];
  const CASI = ["Casi…", "Uy, no era esa.", "¡Sigue intentando!", "Esta se aprende ahora."];
  function vistaSesion() {
    const s = E.sesion, [tid, pid] = s.claves[s.i].split("/"), t = temaPorId(tid), p = t.preguntas.find((x) => x.id === pid);
    const r = s.respuesta, respondida = r !== undefined;
    let opciones;
    if (p.tipo === "alternativas") {
      opciones = `<div class="opciones" data-sin-traducir>${p.opciones.map((o, k) => {
        const cls = !respondida ? "" : k === p.correcta ? "bien" : k === r ? "mal" : "";
        return `<button class="opcion ${cls}" data-responder="${k}" ${respondida ? "disabled" : ""}><span class="tecla">${k + 1}</span><span>${esc(o)}</span></button>`;
      }).join("")}</div>`;
    } else if (p.tipo === "vf") {
      opciones = `<div class="vf">${[[true, "Verdadero"], [false, "Falso"]].map(([v, n], k) => {
        const cls = !respondida ? "" : v === p.correcta ? "bien" : v === r ? "mal" : "";
        return `<button class="opcion ${cls}" data-responder="${v}" ${respondida ? "disabled" : ""}><span class="tecla">${k + 1}</span><span>${n}</span></button>`;
      }).join("")}</div>`;
    } else {
      opciones = `<form class="completar" data-form-completar><input id="respuesta" class="${respondida ? (s.correcta ? "bien" : "mal") : ""}" autocomplete="off" placeholder="Escribe tu respuesta" value="${esc(respondida ? r : "")}" ${respondida ? "disabled" : ""} aria-label="Tu respuesta" data-sin-traducir>
        ${respondida ? "" : `<button class="pz-boton pz-principal" type="submit">Revisar</button>`}</form>`;
    }
    const correcta = p.tipo === "alternativas" ? p.opciones[p.correcta] : p.tipo === "vf" ? tr(p.correcta ? "Verdadero" : "Falso") : p.correcta[0];
    const retro = !respondida ? "" : `<div class="retro ${s.correcta ? "bien" : "mal"}" role="status"><b data-sin-traducir>${esc(tr(s.correcta ? elegir(BIEN, s.claves[s.i]) : elegir(CASI, s.claves[s.i])))}</b>
      ${s.correcta ? "" : frase("La respuesta es: **{r}**.", { r: correcta }, "div")}<span data-sin-traducir>${esc(p.explicacion)}</span>
      ${s.explicacion ? `<div class="otra" data-sin-traducir>${s.explicacion === "cargando" ? T("{ia} está pensando otra forma de explicarlo…", { ia: nombreIA() }) : esc(s.explicacion)}</div>` : ""}</div>
      <div class="acciones-pregunta">${!s.correcta && !s.explicacion ? `<button class="pz-boton" data-accion="no-entendi">🤔 <span>No entendí, explícamelo de otra forma</span></button>` : ""}
        <button class="pz-boton pz-principal grande der" data-accion="siguiente" id="siguiente">${s.i + 1 < s.claves.length ? "Siguiente →" : "Terminar 🎉"}</button></div>`;
    return `<div class="sesion"><div class="progreso-sesion"><button class="icono" data-accion="salir-sesion" title="Salir" aria-label="Salir">✕</button>
        <div class="barra-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${s.claves.length}" aria-valuenow="${s.i}"><i style="width:${(s.i + (respondida ? 1 : 0)) / s.claves.length * 100}%"></i></div>
        <span class="marcador" data-sin-traducir>${esc(s.i + 1)}/${esc(s.claves.length)}</span></div>
      <div class="pregunta" style="--c:${color(t.ramo)}"><span class="de-tema" data-sin-traducir>${EMOJI_RAMO[t.ramo] || "📝"} ${esc(t.titulo)}</span>
        <h2 data-sin-traducir>${esc(p.enunciado)}</h2>${opciones}${retro}</div></div>`;
  }
  function responder(valor) {
    const s = E.sesion; if (!s || s.respuesta !== undefined) return;
    const [tid, pid] = s.claves[s.i].split("/"), p = temaPorId(tid).preguntas.find((x) => x.id === pid);
    s.respuesta = valor; s.correcta = esCorrecta(p, valor);
    const pr = prog();
    pr.preguntas[s.claves[s.i]] = actualizarCaja(pr.preguntas[s.claves[s.i]], s.correcta, E.hoy);
    s.aciertos += s.correcta ? 1 : 0;
    s.puntos += s.correcta ? PUNTOS.acierto : PUNTOS.intento;
    mantener();
    setTimeout(() => $("#siguiente")?.focus(), 30);
  }
  function terminarSesion() {
    const s = E.sesion, pr = prog();
    if (s.aciertos === s.claves.length && s.claves.length >= 5) s.puntos += PUNTOS.sesionPerfecta;
    pr.racha = actualizarRacha(pr, E.hoy); pr.ultimo_dia = E.hoy;
    pr.puntos = (pr.puntos || 0) + s.puntos;
    (pr.sesiones ||= []).push({ fecha: E.hoy, preguntas: s.claves.length, aciertos: s.aciertos });
    pr.sesiones = pr.sesiones.slice(-200);
    s.fin = true;
    guardarProgreso();
    pintar();
    if (s.aciertos / s.claves.length >= 0.7) confeti();
  }
  function finSesion() {
    const s = E.sesion, pct = Math.round(s.aciertos / s.claves.length * 100);
    const [emoji, titulo] = pct === 100 ? ["🏆", "¡Perfecto!"] : pct >= 70 ? ["🎉", "¡Muy bien!"] : pct >= 40 ? ["💪", "¡Vas mejorando!"] : ["🌱", "¡Buen comienzo!"];
    return `<div class="sesion fin"><div class="emoji" aria-hidden="true">${emoji}</div><h1>${titulo}</h1>
      ${frase("Acertaste {a} de {n}. Las que fallaste vuelven pronto para que las aprendas.", { a: s.aciertos, n: s.claves.length }, "p")}
      <div class="premios"><div class="premio"><b data-sin-traducir>+${esc(s.puntos)}</b><small>puntos</small></div><div class="premio"><b data-sin-traducir>🔥 ${esc(prog().racha)}</b><small>días seguidos</small></div></div>
      <button class="pz-boton pz-principal grande" data-accion="cerrar-sesion">Volver al inicio</button></div>`;
  }
  function confeti() {
    const c = document.createElement("div"); c.className = "confeti"; c.setAttribute("aria-hidden", "true");
    const colores = ["#2f5bea", "#ffd84d", "#1f9d5a", "#e5484d", "#8e4ec6"];
    c.innerHTML = Array.from({ length: 60 }, (_, k) => `<i style="left:${(k * 37) % 100}%;background:${colores[k % 5]};animation-delay:${(k % 12) * 0.08}s"></i>`).join("");
    document.body.appendChild(c); setTimeout(() => c.remove(), 3200);
  }

  // ───────────── Diálogos ─────────────
  // Tres formas de crear un tema: con fotos y la IA, escrito a mano (texto simple, sin IA) o del catálogo incluido.
  const MODOS_NUEVO = [["ia", "📸 Fotos"], ["mano", "✍️ A mano"], ["catalogo", "📚 Catálogo"]];
  // Ejemplo del formato a mano (motor/lineas.js · bin/lineas.py): va en el idioma de la interfaz, como texto de muestra.
  const EJEMPLO_MANO = {
    es: "¿Qué fracción es igual a 1/2?\n* 3/6\n- 1/3\n- 2/3\n> 3/6 es 1/2 multiplicando arriba y abajo por 3.\n\n2/4 y 4/8 son equivalentes.\n* Verdadero\n\nEl número de abajo se llama ___.\n* denominador",
    en: "Which fraction equals 1/2?\n* 3/6\n- 1/3\n- 2/3\n> 3/6 is 1/2 multiplying top and bottom by 3.\n\n2/4 and 4/8 are equivalent.\n* True\n\nThe bottom number is called the ___.\n* denominator",
  };
  const EJEMPLO_CONCEPTOS = { es: "Numerador: el número de arriba.", en: "Numerator: the top number." };
  /** Los problemas de un tema escrito a mano, en palabras de la persona («Bloque 2: …» → «Pregunta 2: …»). */
  function problemaLegible(p) {
    const m = /^(?:Bloque|pregunta) (\d+): (.+)$/.exec(p);
    return m ? T("Pregunta {n}: {x}", { n: m[1], x: tr(m[2]) }) : esc(mensaje(p));
  }
  /** Un mensaje del anfitrión o del motor (vienen en español), traducido si se puede; «Lo que armó X no sirve…» lleva el nombre de la IA. */
  function mensaje(t) {
    const m = /^Lo que armó (.+) no sirve todavía \((.+)\)\. Inténtalo de nuevo o con una foto más clara\.$/.exec(t || "");
    if (m && E.idioma !== "es") return tr("Lo que armó {ia} no sirve todavía ({x}). Inténtalo de nuevo o con una foto más clara.").replace("{ia}", m[1]).replace("{x}", tr(m[2]));
    return tr(t || "");
  }
  function dialogoNuevoTema() {
    const n = E.nuevo, pf = perfil(), ia = esc(nombreIA());
    if (n.paso === "creando") {
      const av = n.avance;
      const paso = !av ? "" : av.texto === "leer" ? frase("Leyendo la foto {a} de {n}…", { a: av.paso, n: av.total }, "p")
        : frase("Escribiendo tu repaso: paso {a} de {n}…", { a: av.paso, n: av.total }, "p");
      // Mientras la IA trabaja no se puede cerrar (ni con Esc ni con el velo): cerrarlo dejaría el tema a medias.
      return dlg("t-creando", "Armando tu repaso…", `${frase("{ia} está leyendo tu material y escribiendo las preguntas. Puede tomar un minuto.", { ia }, "p")}${paso}<div class="barra-prog-d"><i></i></div>`, "", { cerrable: false, sinEsc: true });
    }
    if (n.paso === "vista") {
      const t = n.tema;
      return dlg("t-vista", "¡Listo! Revisa tu tema", `<p>Si algo no calza con tu cuaderno, vuelve a intentarlo. Nada se guarda hasta que digas que sí.</p>
        <div class="vista-tema" style="--c:${color(t.ramo)}" data-sin-traducir><span class="ramo" style="color:var(--c);font-weight:800;font-size:12.5px">${EMOJI_RAMO[t.ramo] || "📝"} ${esc(tr(RAMOS[t.ramo]))}</span><b>${esc(t.titulo)}</b>
          <p style="margin:6px 0;color:var(--texto-suave);line-height:1.5">${esc(t.resumen.slice(0, 260))}${t.resumen.length > 260 ? "…" : ""}</p>
          <small>${T("{p} preguntas · {c} conceptos · {t} tarjetas", { p: t.preguntas.length, c: t.conceptos.length, t: t.tarjetas.length })}</small></div>
        ${(n.avisos || []).map((x) => `<p class="nota" data-sin-traducir>${esc(tr(x))}</p>`).join("")}
        ${n.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(mensaje(n.error))}</p>` : ""}`,
        `<button class="pz-boton pz-izq" data-accion="otra-vez">${n.desde === "mano" ? "Corregir" : "Intentar de nuevo"}</button><button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="guardar-tema">Guardar tema</button>`);
    }
    const modos = MODOS_NUEVO.filter(([id]) => id !== "catalogo" || Array.isArray(E.catalogo));
    const pestanas = `<div class="pestanas modos" role="tablist">${modos.map(([id, nombre]) => `<button class="pestana" role="tab" data-modo="${id}" aria-selected="${n.modo === id}">${nombre}</button>`).join("")}</div>`;
    const cancelar = `<button class="pz-boton" data-accion="cerrar">Cancelar</button>`;
    if (n.modo === "catalogo") {
      const lista = (E.catalogo || []).filter((t) => !temaPorId(t.id));
      return dlg("t-nuevo", "Nuevo tema", `${pestanas}<p>Temas de ejemplo revisados a mano, listos para estudiar.</p>
        <div class="seccion">${lista.map((t) => `<div class="pz-fila"><div class="pz-txt"><b data-sin-traducir>${esc(t.titulo)}</b><small data-sin-traducir>${EMOJI_RAMO[t.ramo] || "📝"} ${esc(tr(RAMOS[t.ramo] || ""))} · ${esc(tr(CURSOS[t.curso] || ""))}</small></div>
          <button class="pz-boton" data-catalogo="${esc(t.id)}" ${n.agregando ? "disabled" : ""}>${n.agregando === t.id ? "Agregando…" : "Agregar"}</button></div>`).join("") || `<p class="nota">Ya tienes todos los temas del catálogo.</p>`}</div>
        ${n.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(mensaje(n.error))}</p>` : ""}`,
        `${cancelar}`);
    }
    if (n.modo === "mano") {
      const m = n.mano, ej = (x) => esc(x[E.idioma] || x.es);
      return dlg("t-nuevo", "Nuevo tema", `${pestanas}<p>Escribe tú las preguntas, sin IA. Repasa arma el tema y lo revisa antes de guardarlo.</p>
        <label class="campo"><span>Título</span><input class="texto" id="mano-titulo" maxlength="80" value="${esc(m.titulo)}" data-sin-traducir></label>
        <div class="dos"><label class="campo"><span>Ramo</span><select id="mano-ramo">${Object.entries(RAMOS).map(([k, v]) => `<option value="${k}" ${m.ramo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="campo"><span>Curso</span><select id="mano-curso">${Object.entries(CURSOS).map(([k, v]) => `<option value="${k}" ${m.curso === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
        <label class="campo"><span>Preguntas</span><textarea id="mano-preguntas" rows="8" placeholder="${ej(EJEMPLO_MANO)}" data-sin-traducir>${esc(m.preguntas)}</textarea>
          <small>Una pregunta por bloque, separadas por una línea en blanco. * marca la correcta, - las incorrectas y > la explicación. Con ___ es para completar.</small></label>
        <label class="campo"><span>Explicado fácil (opcional)</span><textarea id="mano-resumen" rows="2" data-sin-traducir>${esc(m.resumen)}</textarea></label>
        <label class="campo"><span>Conceptos (opcional)</span><textarea id="mano-conceptos" rows="2" placeholder="${ej(EJEMPLO_CONCEPTOS)}" data-sin-traducir>${esc(m.conceptos)}</textarea><small>Uno por línea: «Término: definición». También se vuelven tarjetas.</small></label>
        ${n.problemas?.length ? `<ul class="problemas">${n.problemas.slice(0, 6).map((x) => `<li data-sin-traducir>${problemaLegible(x)}</li>`).join("")}</ul>` : n.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(tr(n.error))}</p>` : ""}`,
        `${cancelar}<button class="pz-boton pz-principal" data-accion="revisar-a-mano">Revisar tema</button>`);
    }
    if (E.capacidades.ia === false) {
      return dlg("t-nuevo", "Nuevo tema", `${pestanas}<div class="aviso-ia" role="note"><b>Este teléfono no tiene IA propia todavía.</b>
        ${E.capacidades.iaDetalle ? `<span data-sin-traducir>${esc(tr(E.capacidades.iaDetalle))}</span>` : ""} <span>Igual puedes escribir el tema a mano o elegir uno del catálogo.</span></div>
        <div class="botones-foto"><button class="pz-boton pz-principal" data-modo="mano">✍️ Escribir a mano</button>${Array.isArray(E.catalogo) ? `<button class="pz-boton" data-modo="catalogo">📚 Ver el catálogo</button>` : ""}</div>`,
        `${cancelar}`);
    }
    const elegir = MOVIL
      ? `<div class="botones-foto"><button class="pz-boton pz-principal" data-accion="elegir-material" data-origen="camara">📷 Sacar foto</button><button class="pz-boton" data-accion="elegir-material" data-origen="galeria">🖼️ De la galería</button></div>
        <small style="color:var(--texto-suave)">Una foto por página: de cerca, derecha y con buena luz.</small>`
      : `<button class="pz-boton pz-principal" data-accion="elegir-material">Elegir fotos o PDF</button>
        <small style="color:var(--texto-suave)">${HOST === "web" ? "Fotos (JPG, PNG) o PDF. Que se lea bien y con buena luz." : "Fotos (JPG, PNG) o PDF; también puedes arrastrarlos aquí. Que se lea bien y con buena luz."}</small>`;
    return dlg("t-nuevo", "Nuevo tema", `${pestanas}${frase("Sácale fotos a tu cuaderno o a la guía, o pega el texto. {ia} arma el resumen, las preguntas y las tarjetas.", { ia }, "p")}
      <div class="soltar"><span style="font-size:30px" aria-hidden="true">📸</span>${elegir}
        ${n.archivos.length ? `<div class="archivos">${n.archivos.map((a, k) => `<span class="archivo"><span data-sin-traducir>${esc(a.nombre)}</span><button data-quitar="${k}" aria-label="Quitar" title="Quitar">✕</button></span>`).join("")}</div>` : ""}</div>
      <label class="campo"><span>O pega el texto (opcional)</span><textarea id="texto-tema" rows="3" placeholder="${esc(tr("Ej.: el resumen que dictó la profesora"))}" data-sin-traducir>${esc(n.texto || "")}</textarea></label>
      <div class="dos"><label class="campo"><span>Ramo</span><select id="ramo-tema"><option value="auto">Que lo adivine la IA</option>${Object.entries(RAMOS).map(([k, v]) => `<option value="${k}" ${n.ramo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="campo"><span>Curso</span><select id="curso-tema">${Object.entries(CURSOS).map(([k, v]) => `<option value="${k}" ${(n.curso || pf.curso) === k ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
      ${n.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(mensaje(n.error))}</p>` : ""}`,
        `${cancelar}<button class="pz-boton pz-principal" data-accion="crear-tema">Armar mi repaso ✨</button>`);
  }
  function dialogoPrueba() {
    const x = E.prueba, pf = perfil(), temas = temasDe(pf).filter((t) => !x.ramo || t.ramo === x.ramo);
    return dlg("t-prueba", x.id ? "Tu prueba" : "Agregar prueba", `<p>Repasa va a darle prioridad a estos temas los días antes.</p>
      <div class="dos"><label class="campo"><span>Ramo</span><select id="ramo-prueba">${Object.entries(RAMOS).map(([k, v]) => `<option value="${k}" ${x.ramo === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="campo"><span>Fecha</span><input class="texto" type="date" id="fecha-prueba" min="${esc(E.hoy)}" value="${esc(x.fecha || sumarDias(E.hoy, 7))}"></label></div>
      <div class="campo"><span>Temas que entran</span>${temas.length ? temas.map((t) => `<label style="display:flex;gap:8px;align-items:center;font-weight:650"><input type="checkbox" data-tema-prueba="${esc(t.id)}" ${x.temas.includes(t.id) ? "checked" : ""}><span data-sin-traducir>${esc(t.titulo)}</span></label>`).join("")
        : `<small>Todavía no tienes temas de este ramo. Agrégalos con una foto del cuaderno.</small>`}</div>`,
        `${x.id ? `<button class="pz-boton pz-peligro pz-izq" data-accion="borrar-prueba">Borrar</button>` : ""}<button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="guardar-prueba">Guardar</button>`);
  }
  function dialogoPerfil() {
    const x = E.perfilEdit;
    return dlg("t-perfil", x.id ? "Editar perfil" : "Nuevo perfil", `<p>Solo un nombre o apodo y el curso. Nada más.</p>
      <label class="campo"><span>Nombre o apodo</span><input class="texto" id="nombre-perfil" maxlength="20" value="${esc(x.nombre || "")}" data-sin-traducir></label>
      <label class="campo"><span>Curso</span><select id="curso-perfil">${Object.entries(CURSOS).map(([k, v]) => `<option value="${k}" ${x.curso === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <div class="campo"><span>Elige un personaje</span><div class="avatares">${AVATARES.map((a) => `<button data-avatar="${a}" aria-pressed="${x.avatar === a}" aria-label="${esc(a)}">${a}</button>`).join("")}</div></div>
      ${x.error ? `<p class="pz-error-texto" data-sin-traducir>${esc(x.error)}</p>` : ""}`,
        `<button class="pz-boton" data-accion="cerrar">Cancelar</button><button class="pz-boton pz-principal" data-accion="guardar-perfil">Guardar</button>`);
  }
  /** La IA, en Para adultos y en la bienvenida: las filas de la pieza «componentes» (probarIA {ia}, el error traducido, `detalle`
   *  con por qué no está lista y «Revisar de nuevo»: la del teléfono queda lista al activar Apple Intelligence o al bajar Gemini
   *  Nano). En el celular los nombres vienen en español desde el anfitrión («El computador de la casa») y se traducen aquí; no hay
   *  guía para instalar una IA de computador. */
  function filasIA() {
    if (!MOVIL) return ui.filasIA({ ias: E.ias, elegida: E.config.ia, guia: ENLACES.guiaIA });
    return ui.filasIA({ ias: E.ias.map((x) => ({ ...x, nombre: tr(x.nombre || x.id) })), elegida: E.config.ia });
  }
  function dialogoAdultos() {
    const avance = E.perfiles.map((pf) => {
      const p = E.progreso[pf.id] || { preguntas: {} }, temas = temasDe(pf), ramos = [...new Set(temas.map((t) => t.ramo))];
      const sem = (p.sesiones || []).filter((s) => diasEntre(s.fecha, E.hoy) < 7);
      return `<div class="pz-fila avance-perfil"><div class="avance-cab"><span class="avance-av" aria-hidden="true">${esc(pf.avatar)}</span>
          <b data-sin-traducir>${esc(pf.nombre)} · ${esc(tr(CURSOS[pf.curso]))}</b><button class="pz-boton pz-plano" data-editar-perfil="${esc(pf.id)}">Editar</button></div>
        ${frase("Esta semana: {s} sesiones, {p} preguntas, {a} % de aciertos.", { s: sem.length, p: sem.reduce((a, x) => a + x.preguntas, 0), a: sem.length ? Math.round(sem.reduce((a, x) => a + x.aciertos, 0) / Math.max(1, sem.reduce((a, x) => a + x.preguntas, 0)) * 100) : 0 }, "small")}
        ${ramos.map((r) => { const ts = temas.filter((t) => t.ramo === r), d = Math.round(ts.reduce((a, t) => a + dominio(t, p), 0) / ts.length);
          return `<div class="ramo-avance"><span data-sin-traducir>${esc(tr(RAMOS[r]))}</span><span class="barra-dom"><i style="width:${d}%;background:${color(r)}"></i></span><span data-sin-traducir>${d}%</span></div>`; }).join("")}</div>`;
    }).join("");
    return dlg("t-adultos", "Para adultos", `<p>${MOVIL ? "Todo queda en este teléfono. La IA es la del propio teléfono: no usa internet y solo ve el material que agregan y las preguntas."
      : "Todo queda en este computador. La IA usa la cuenta de un adulto y solo ve el material que agregan y las preguntas."}</p>
      <div class="seccion"><h3>Cómo van</h3>${avance || `<small>Todavía no hay perfiles.</small>`}</div>
      <div class="seccion"><h3>La IA</h3>${filasIA()}</div>
      <div class="seccion"><h3>General</h3><div class="pz-fila"><div class="pz-txt"><b>Idioma de la app</b></div><select data-config="idioma_ui"><option value="es" ${E.idioma === "es" ? "selected" : ""}>Español</option><option value="en" ${E.idioma === "en" ? "selected" : ""}>English</option></select></div>
        <div class="pz-fila envuelve"><div class="pz-txt"><b>Apariencia</b></div>${tema.selectorHTML()}</div>
        ${MOVIL ? "" : `<div class="pz-fila"><div class="pz-txt"><b>Carpeta de Repasa</b><small data-sin-traducir>${esc(E.carpeta)}</small></div><button class="pz-boton" data-accion="abrir-carpeta">Abrir</button></div>`}</div>
      ${E.capacidades.copia ? seccionCopia() : ""}
      <div class="seccion"><h3>Acerca de Repasa</h3>
        ${MOVIL ? "" : ui.filaActualizacion() /* versiones nuevas: solo aquí, nunca en la pantalla de los niños ni con una alerta del sistema */}
        ${ui.acercaDe({ version: E.version, enlaces: { sitio: ENLACES.sitio, codigo: ENLACES.codigo, comunidad: ENLACES.comunidad } })}</div>`,
        `<button class="pz-boton pz-principal" data-accion="cerrar">Listo</button>`);
  }
  /** Copia cifrada en la nube de la familia (celular, fase 1: se guarda y se trae a mano con el selector del sistema). */
  function seccionCopia() {
    const c = E.copia, ocupado = c.estado === "guardando" || c.estado === "trayendo";
    const estado = c.error ? `<small class="pz-error-texto" data-sin-traducir>${esc(tr(c.error))}</small>`
      : c.estado === "guardando" ? `<small>Cifrando y guardando…</small>` : c.estado === "trayendo" ? `<small>Abriendo la copia…</small>`
        : c.estado === "guardada" ? frase("Copia guardada ({n} archivos). Nadie puede abrirla sin la frase.", { n: c.cantidad || 0 }, "small")
          : c.estado === "traida" ? frase("Listo: se juntaron {t} temas nuevos y el avance de {p} perfiles. Nada se borró.", { t: c.resumen?.temas || 0, p: c.resumen?.progreso || 0 }, "small") : "";
    return `<div class="seccion"><h3>Copia en tu nube</h3>
      <p class="nota" style="margin:0 0 10px">${MOVIL ? "Guarda una copia cifrada en iCloud Drive o Google Drive y tráela a otro teléfono. Solo se abre con la frase de su familia: anótenla en un lugar seguro, porque nadie la puede recuperar."
        : "Guarda una copia cifrada en iCloud Drive o en otra carpeta y tráela a otro computador o teléfono. Solo se abre con la frase de su familia: anótenla en un lugar seguro, porque nadie la puede recuperar."}</p>
      <label class="campo"><span>Frase de la familia</span><input class="texto" type="password" id="frase-copia" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(c.frase)}" placeholder="${esc(tr("Por ejemplo, cuatro palabras que solo ustedes sepan"))}" data-sin-traducir></label>
      <div class="botones-copia"><button class="pz-boton" data-accion="guardar-copia" ${ocupado ? "disabled" : ""}>☁️ Guardar copia…</button><button class="pz-boton" data-accion="traer-copia" ${ocupado ? "disabled" : ""}>📥 Traer copia…</button></div>
      <div class="estado-copia" role="status">${estado}</div></div>`;
  }
  // Paso 0: el idioma, antes que cualquier otra cosa. Cada opción va escrita en su propio idioma (no se traduce), por eso el título
  // bilingüe va armado aquí y no por T(). Es un diálogo de la pieza (`dialogo` con `tituloHTML` y `claseTitulo`: aria-modal, foco adentro) que no se cierra; el foco
  // empieza en el idioma sugerido (data-autofoco), así Enter lo elige.
  const IDIOMAS = [["es", "Español", "Sugerido"], ["en", "English", "Suggested"]];
  function pasoIdioma(puntos) {
    const sugerido = E.config.idioma_ui || idiomaSistema();
    return ui.dialogo({ id: "t-idioma", antes: puntos, claseTitulo: "titulo-idioma", clase: "bv", cerrable: false, sinEsc: true,
      tituloHTML: `<span lang="es">Elige tu idioma</span> <span class="sep">·</span> <span lang="en">Choose your language</span>`,
      cuerpo: `<div class="opciones-idioma" role="group" aria-labelledby="t-idioma" data-sin-traducir>${IDIOMAS.map(([codigo, nombre, marca], k) => `
        <button class="idioma-op ${codigo === sugerido ? "sugerido" : ""}" id="idioma-${codigo}" data-idioma="${codigo}" lang="${codigo}" aria-keyshortcuts="${k + 1}"${codigo === sugerido ? " data-autofoco" : ""}>
          <span class="tecla" aria-hidden="true">${k + 1}</span><b>${nombre}</b>${codigo === sugerido ? `<small>✓ ${marca}</small>` : ""}</button>`).join("")}</div>` });
  }
  async function elegirIdioma(codigo) {
    if (!IDIOMAS.some(([c]) => c === codigo)) return;
    E.config.idioma_ui = codigo;
    host.enviar("config", { idioma_ui: codigo });
    await cargarIdioma(codigo);
    E.bv = 1; pintar(); // el paso siguiente es otro diálogo: el foco va a su título
    for (const [texto, o] of avisosEnEspera.splice(0)) toast(texto, o);
  }
  function bienvenida() {
    const pasos = [
      ["", "", true],
      ["Hola, esto es Repasa", `<p>Una app para estudiar con lo que pasan en el colegio. Le sacan una foto al cuaderno y Repasa arma un resumen fácil, preguntas tipo prueba y tarjetas para memorizar. Las preguntas que cuestan vuelven hasta que se aprenden.</p><p class="nota">${MOVIL ? "Gratis, sin cuentas y sin publicidad. Todo queda en este teléfono." : "Gratis, sin cuentas y sin publicidad. Todo queda en este computador."}</p>`, true],
      MOVIL ? ["La IA", `<p>En el celular, Repasa usa la IA del propio teléfono: gratis, privada y sin internet. Si este teléfono no la tiene, igual pueden escribir temas a mano o elegirlos del catálogo.</p><div class="seccion">${filasIA()}</div>`, true]
        : ["Elijan la IA", `<p>Repasa usa la IA que ya tiene un adulto de la casa (Claude, ChatGPT o Gemini), con su cuenta. La probamos con una pregunta corta.</p><div class="seccion">${filasIA()}</div>`, !!E.config.ia],
    ];
    const [titulo, cuerpo, puede] = pasos[E.bv];
    const puntos = `<div class="pasos-bv">${pasos.map((_, i) => `<i class="${i <= E.bv ? "hecho" : ""}"></i>`).join("")}</div>`;
    if (E.bv === 0) return pasoIdioma(puntos); // sin «Lo hago después»: elegir es un solo toque
    const ultimo = E.bv >= pasos.length - 1;
    // Un id por paso: al avanzar, el foco va al título del paso nuevo (el lector de pantalla lo anuncia). Los puntos de avance van
    // antes del título (`antes`). Esc no la cierra (está «Lo hago después»).
    return dlg(`t-bv-${E.bv}`, titulo, cuerpo,
      `<button class="pz-boton pz-izq" data-bv="${E.bv - 1}">Atrás</button><button class="pz-boton" data-accion="bv-fin">Lo hago después</button>
        ${ultimo ? `<button class="pz-boton pz-principal" data-accion="bv-fin">Empezar</button>` : `<button class="pz-boton pz-principal" data-bv="${E.bv + 1}" ${puede ? "" : "disabled"}>Siguiente</button>`}`,
      { antes: puntos, clase: "bv", cerrable: false, sinEsc: true });
  }
  /** Un diálogo de Repasa con la pieza «componentes»: id del título, título (frase en español), cuerpo y botones del pie. */
  const dlg = (id, titulo, cuerpo, pie = "", o = {}) => ({ id, titulo, cuerpo, pie, ...o });
  function dialogos() {
    if (E.bv === 0) return bienvenida(); // la pantalla del idioma ya viene envuelta
    const d = E.nuevo ? dialogoNuevoTema() : E.prueba ? dialogoPrueba() : E.perfilEdit ? dialogoPerfil()
      : E.bv !== null ? bienvenida() : E.adultos ? dialogoAdultos() : null;
    return d ? ui.dialogo(d) : "";
  }
  /** Esc, el velo o ✕: cierra el diálogo de Repasa que está abierto (nunca mientras la IA arma un tema ni la bienvenida). */
  function cerrarDialogo() {
    if (E.nuevo?.paso === "creando" || (E.bv !== null && !E.nuevo && !E.prueba && !E.perfilEdit)) return;
    E.nuevo = null; E.prueba = null; E.perfilEdit = null; E.adultos = false;
    pintar();
  }

  // ───────────── Eventos ─────────────
  function leerNuevo() {
    const n = E.nuevo; if (!n) return;
    n.texto = $("#texto-tema")?.value ?? n.texto; n.ramo = $("#ramo-tema")?.value || n.ramo; n.curso = $("#curso-tema")?.value || n.curso;
    for (const k of ["titulo", "ramo", "curso", "resumen", "conceptos", "preguntas"]) { const el = $(`#mano-${k}`); if (el) n.mano[k] = el.value; }
  }
  function empezarSesion(claves) {
    if (!claves.length) return toast("No hay preguntas por ahora");
    E.sesion = { claves, i: 0, aciertos: 0, puntos: 0 }; pintar();
  }
  document.addEventListener("click", async (ev) => {
    if (tema.manejarClic(ev)) return mantener();
    if (ui.manejarClic(ev)) return; // de la pieza: ✕, el velo, confirmar, probar la IA, actualizaciones, enlaces y comentarios
    const el = ev.target.closest("[data-accion],[data-perfil],[data-tema],[data-pestana],[data-flip],[data-practicar],[data-responder],[data-quitar],[data-avatar],[data-editar-perfil],[data-bv],[data-idioma],[data-modo],[data-catalogo]");
    if (!el) return;
    const d = el.dataset;
    if (d.perfil) { E.perfil = d.perfil; E.vista = "inicio"; host.enviar("config", { ultimo_perfil: d.perfil }); return pintar(); }
    if (d.tema) { E.temaSel = d.tema; E.vista = "tema"; E.pestana = "resumen"; E.volteadas = {}; return pintar(); }
    if (d.pestana) { E.pestana = d.pestana; return mantener(); }
    if (d.flip != null) { E.volteadas[d.flip] = !E.volteadas[d.flip]; el.setAttribute("aria-pressed", String(!!E.volteadas[d.flip])); return; }
    if (d.practicar) { const t = temaPorId(d.practicar), p = prog(); return empezarSesion(t.preguntas.map((q) => `${t.id}/${q.id}`).sort((a, b) => (p.preguntas[a]?.caja || 0) - (p.preguntas[b]?.caja || 0)).slice(0, 12)); }
    if (d.responder != null) { const s = E.sesion, [tid, pid] = s.claves[s.i].split("/"), p = temaPorId(tid).preguntas.find((x) => x.id === pid); return responder(p.tipo === "vf" ? d.responder === "true" : Number(d.responder)); }
    if (d.quitar != null) { leerNuevo(); E.nuevo.archivos.splice(Number(d.quitar), 1); return mantener(); }
    if (d.avatar) { E.perfilEdit.nombre = $("#nombre-perfil")?.value ?? E.perfilEdit.nombre; E.perfilEdit.curso = $("#curso-perfil")?.value || E.perfilEdit.curso; E.perfilEdit.avatar = d.avatar; return mantener(); }
    if (d.editarPerfil) { E.adultos = false; E.perfilEdit = { ...E.perfiles.find((p) => p.id === d.editarPerfil) }; return pintar(); }
    if (d.idioma) return elegirIdioma(d.idioma);
    if (d.modo) { leerNuevo(); Object.assign(E.nuevo, { modo: d.modo, error: "", problemas: [] }); return mantener(); }
    if (d.catalogo) { E.nuevo.agregando = d.catalogo; E.nuevo.error = ""; host.enviar("agregarDelCatalogo", { id: d.catalogo }); return mantener(); }
    if (d.bv) { E.bv = Number(d.bv); return pintar(); }
    switch (d.accion) {
      case "cambiar-perfil": E.perfil = null; E.sesion = null; return pintar();
      case "nuevo-perfil": E.perfilEdit = { nombre: "", curso: "6b", avatar: AVATARES[E.perfiles.length % AVATARES.length] }; pintar(); return $("#nombre-perfil")?.focus();
      case "guardar-perfil": {
        const x = E.perfilEdit, nombre = ($("#nombre-perfil")?.value || "").trim();
        if (!nombre) { x.error = tr("Escribe un nombre o apodo."); return mantener(); }
        const p = { id: x.id || nombre.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "") + "-" + Date.now().toString(36).slice(-4), nombre: nombre.slice(0, 20), curso: $("#curso-perfil").value, avatar: x.avatar };
        E.perfiles = E.perfiles.filter((y) => y.id !== p.id).concat(p);
        host.enviar("guardarPerfil", { perfil: p }); E.perfilEdit = null; if (!x.id) E.perfil = p.id; return pintar();
      }
      case "volver": E.vista = "inicio"; return pintar();
      case "empezar": { const pf = perfil(); return empezarSesion(elegirSesion(temasDe(pf), prog(), E.hoy, E.pruebas.filter((x) => x.perfil === pf.id))); }
      case "siguiente": { const s = E.sesion; if (s.i + 1 >= s.claves.length) return terminarSesion(); s.i++; delete s.respuesta; delete s.explicacion; pintar(); return $("#respuesta")?.focus(); }
      case "no-entendi": { const s = E.sesion, [tid, pid] = s.claves[s.i].split("/"); s.explicacion = "cargando"; host.enviar("explicar", { tema: tid, pregunta: pid, respondio: String(s.respuesta ?? "") }); return mantener(); }
      case "salir-sesion": if (E.sesion.i > 0 || E.sesion.respuesta !== undefined) guardarProgreso(); E.sesion = null; return pintar();
      case "cerrar-sesion": E.sesion = null; E.vista = "inicio"; return pintar();
      case "nuevo-tema": {
        const curso = perfil().curso;
        E.nuevo = { paso: "elegir", modo: "ia", archivos: [], texto: "", ramo: "auto", curso, mano: { titulo: "", ramo: temasDe(perfil())[0]?.ramo || "lenguaje", curso, resumen: "", conceptos: "", preguntas: "" } };
        return pintar();
      }
      case "elegir-material": leerNuevo(); return host.enviar("elegirMaterial", { origen: d.origen || "" });
      case "crear-tema": {
        leerNuevo(); const n = E.nuevo;
        if (!n.archivos.length && !n.texto.trim()) { n.error = tr("Agrega una foto, un PDF o pega el texto."); return mantener(); }
        n.paso = "creando"; n.error = ""; n.avance = null; n.desde = "ia";
        host.enviar("crearTema", { curso: n.curso, ramo: n.ramo, texto: n.texto, archivos: n.archivos.map((a) => a.ruta) }); return pintar();
      }
      case "revisar-a-mano": {
        leerNuevo(); const n = E.nuevo, m = n.mano;
        if (!m.titulo.trim()) { n.error = "Escribe un título."; n.problemas = []; return mantener(); }
        n.desde = "mano"; n.error = ""; n.problemas = [];
        host.enviar("temaAMano", { titulo: m.titulo, ramo: m.ramo, curso: m.curso, resumen: m.resumen, conceptos: m.conceptos, preguntas: m.preguntas }); return;
      }
      case "otra-vez": E.nuevo.paso = "elegir"; return pintar();
      case "guardar-tema": host.enviar("guardarTema", { tema: E.nuevo.tema, archivos: E.nuevo.desde === "mano" ? [] : E.nuevo.archivos.map((a) => a.ruta) }); return;
      case "nueva-prueba": E.prueba = { ramo: temasDe(perfil())[0]?.ramo || "historia", temas: [], fecha: "" }; return pintar();
      case "editar-prueba": E.prueba = { ...E.pruebas.find((x) => x.id === d.prueba) }; return pintar();
      case "guardar-prueba": {
        const x = E.prueba; x.ramo = $("#ramo-prueba").value; x.fecha = $("#fecha-prueba").value || sumarDias(E.hoy, 7);
        x.temas = [...document.querySelectorAll("[data-tema-prueba]:checked")].map((c) => c.dataset.temaPrueba);
        const p = { id: x.id || `prueba-${Date.now().toString(36)}`, perfil: E.perfil, ramo: x.ramo, temas: x.temas, fecha: x.fecha };
        E.pruebas = E.pruebas.filter((y) => y.id !== p.id).concat(p); host.enviar("guardarPruebas", { pruebas: E.pruebas }); E.prueba = null; pintar(); return toast("Prueba guardada");
      }
      case "borrar-prueba": {
        const id = E.prueba.id;
        if (!(await ui.confirmar({ titulo: "¿Borrar esta prueba?", texto: "Los temas siguen aquí; solo se quita la fecha de la prueba.", si: "Borrar", no: "Dejarla", peligro: true }))) return;
        E.pruebas = E.pruebas.filter((y) => y.id !== id); host.enviar("guardarPruebas", { pruebas: E.pruebas }); E.prueba = null; return pintar();
      }
      case "adultos": E.adultos = true; return pintar();
      case "cerrar": if (E.nuevo?.paso !== "creando") E.nuevo = null; E.prueba = null; E.perfilEdit = null; E.adultos = false; return pintar();
      case "abrir-carpeta": return host.enviar("abrirCarpeta", {});
      case "bv-fin": E.bv = null; E.bvCerrada = true; host.enviar("config", { bienvenida: true }); return pintar();
      case "guardar-copia": case "traer-copia": {
        const frase = $("#frase-copia")?.value || "";
        if (!frase) { E.copia = { frase, estado: "", error: "Escribe la frase de la familia." }; mantener(); return $("#frase-copia")?.focus(); }
        E.copia = { frase, estado: d.accion === "guardar-copia" ? "guardando" : "trayendo", error: "" };
        if (d.accion === "guardar-copia") host.enviar("guardarCopia", { frase }); else host.enviar("traerCopia", { frase });
        return mantener();
      }
    }
  });
  document.addEventListener("input", (ev) => { if (ev.target.id === "frase-copia") E.copia.frase = ev.target.value; });

  // Arrastrar fotos o PDF a «Nuevo tema» (computador). La app los guarda en .repasa/temporal/ y responde materialElegido, igual que
  // al elegirlos. Fuera de ese diálogo, soltar un archivo no hace nada (nunca abre el archivo dentro de la ventana).
  const SOLTABLES = /\.(jpe?g|png|webp|heic|gif|pdf)$/i, MAX_SOLTAR = 25 * 1024 * 1024;
  const puedeSoltar = () => !MOVIL && E.nuevo?.paso === "elegir" && (E.nuevo.modo || "ia") === "ia" && E.capacidades.ia !== false;
  document.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    const ok = puedeSoltar();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = ok ? "copy" : "none";
    $(".soltar")?.classList.toggle("encima", ok);
  });
  document.addEventListener("dragleave", (ev) => { if (!ev.relatedTarget) $(".soltar")?.classList.remove("encima"); });
  document.addEventListener("drop", (ev) => {
    ev.preventDefault();
    $(".soltar")?.classList.remove("encima");
    if (!puedeSoltar()) return;
    leerNuevo();
    const archivos = [...(ev.dataTransfer?.files || [])];
    const sirven = archivos.filter((f) => SOLTABLES.test(f.name) && f.size > 0 && f.size <= MAX_SOLTAR).slice(0, 10);
    if (sirven.length < archivos.length) toast("Solo fotos (JPG, PNG) o PDF de hasta 25 MB.");
    for (const f of sirven) {
      const r = new FileReader();
      r.onload = () => host.enviar("soltarMaterial", { nombre: f.name, base64: String(r.result).split(",")[1] || "" });
      r.readAsDataURL(f);
    }
  });
  document.addEventListener("submit", (ev) => { if (ev.target.matches("[data-form-completar]")) { ev.preventDefault(); const v = $("#respuesta").value; if (v.trim()) responder(v); } });
  document.addEventListener("change", async (ev) => {
    const ds = ev.target.dataset || {};
    if (ev.target.id === "ramo-prueba") { E.prueba.ramo = ev.target.value; E.prueba.fecha = $("#fecha-prueba").value; return mantener(); }
    if (ds.config) { E.config[ds.config] = ev.target.value; host.enviar("config", { [ds.config]: ev.target.value }); if (ds.config === "idioma_ui") await cargarIdioma(ev.target.value); return mantener(); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ui.manejarTecla(ev)) return; // Esc cierra el diálogo de más arriba; Tab no se escapa de él
    if (E.bv === 0 && /^[12]$/.test(ev.key) && !ev.target.closest?.("input, textarea, select")) { ev.preventDefault(); return elegirIdioma(IDIOMAS[Number(ev.key) - 1][0]); }
    const s = E.sesion;
    // Las teclas del repaso (1–5 y Enter) solo cuando no hay un diálogo encima.
    if (!s || s.fin || ev.target.closest?.("input, textarea, select") || $(".pz-capa")) return;
    if (s.respuesta === undefined && /^[1-5]$/.test(ev.key)) { const b = document.querySelectorAll("[data-responder]")[Number(ev.key) - 1]; if (b) b.click(); }
    else if (s.respuesta !== undefined && ev.key === "Enter" && document.activeElement?.id !== "siguiente") { ev.preventDefault(); $("#siguiente")?.click(); }
  });

  // ───────────── Lo que manda la app (queda en window.Repasa) ─────────────
  host.responder({
    async estado(e) {
      Object.assign(E, { hoy: e.hoy, perfiles: e.perfiles || [], temas: e.temas || [], progreso: e.progreso || {}, pruebas: e.pruebas || [], config: e.config || {},
        ias: e.ias || [], version: e.version || "", carpeta: e.carpeta || "", actualizacion: e.actualizacion || { hay: false },
        capacidades: e.capacidades || {}, catalogo: Array.isArray(e.catalogo) ? e.catalogo : null });
      tema.aplicar(tema.elegir({ config: E.config.tema }));
      ui.actualizacionDisponible(E.actualizacion?.hay ? E.actualizacion : null, { pintar: false }); // `detalle` (Mac) = notas
      if (E.perfil && !E.perfiles.some((p) => p.id === E.perfil)) E.perfil = null;
      if (!E.config.bienvenida && E.bv === null && !E.bvCerrada) E.bv = 0;
      await cargarIdioma();
      pintar();
    },
    materialElegido(lista) { if (!E.nuevo) return; leerNuevo(); const ya = new Set(E.nuevo.archivos.map((a) => a.ruta)); E.nuevo.archivos.push(...(lista || []).filter((a) => !ya.has(a.ruta))); mantener(); },
    temaCreado(r) {
      if (!E.nuevo) return;
      Object.assign(E.nuevo, r.ok ? { paso: "vista", tema: r.tema, avisos: r.avisos || [], error: "" } : { paso: "elegir", error: r.error, problemas: r.problemas || [] });
      pintar();
    },
    /** Por dónde va (celular): leer las fotos y escribir el tema por partes. */
    temaAvance(r) { if (E.nuevo?.paso !== "creando") return; E.nuevo.avance = r; mantener(); },
    temaGuardado(r) {
      if (!r.ok) { if (E.nuevo) { if (E.nuevo.agregando) E.nuevo.agregando = null; else E.nuevo.paso = "vista"; E.nuevo.error = r.error; } toast(r.error || "No se pudo guardar"); return pintar(); }
      E.temas = E.temas.filter((t) => t.id !== r.tema.id).concat(r.tema); E.nuevo = null; E.temaSel = r.tema.id; E.vista = "tema"; E.pestana = "resumen"; pintar(); toast("Tema guardado");
    },
    explicado(r) { const s = E.sesion; if (!s) return; s.explicacion = r.ok ? r.texto : tr(r.error || "No se pudo explicar ahora."); mantener(); },
    iaProbada: (r) => ui.iaProbada(r),
    copiaLista(r) { E.copia = r.ok ? { frase: "", estado: "guardada", cantidad: r.cantidad, error: "" } : { ...E.copia, estado: "", error: r.cancelado ? "" : r.error }; mantener(); },
    copiaTraida(r) { E.copia = r.ok ? { frase: "", estado: "traida", resumen: r.resumen, error: "" } : { ...E.copia, estado: "", error: r.cancelado ? "" : r.error }; mantener(); },
    actualizacionRevisada: (r) => ui.actualizacionRevisada(r), // la app de Mac manda `detalle`: la pieza lo acepta
    actualizacionProgreso: (a) => ui.actualizacionProgreso(a),
    /** Vista previa y pruebas: `f(E, ui)` cambia el estado (también el de la pieza: ui.act, ui.ia) y se vuelve a pintar. */
    _probar(f) { f(E, ui, tema); pintar(); },
  });
  window.Repasa._pruebas = { actualizarCaja, esCorrecta, elegirSesion, actualizarRacha, sumarDias, normalizar };

  // ───────────── Vista previa en el navegador (datos ficticios de demo.json) ─────────────
  let DEMO = null;
  const COMUNES = window.PiezaHost.simulacionesComunes({ espera: 500 }); // buscar y actualizar, abrir un enlace https
  function simular(accion, d, c) {
    if (!DEMO) return;
    const A = window.Repasa, luego = c.luego;
    switch (accion) {
      case "listo": return A.estado(JSON.parse(JSON.stringify(DEMO)));
      case "config": Object.assign(DEMO.config, d); return;
      case "guardarProgreso": case "guardarPerfil": case "guardarPruebas": return;
      case "elegirMaterial": return luego(200, () => A.materialElegido([{ ruta: "/demo/cuaderno.jpg", nombre: "cuaderno.jpg" }]));
      case "crearTema": return luego(1600, () => {
        const t = JSON.parse(JSON.stringify(DEMO.temas[0]));
        t.id = "independencia-de-chile-2"; t.titulo = tr("La Independencia de Chile (de tu cuaderno)"); t.curso = d.curso; t.fuente = ["cuaderno.jpg"]; t.autor = "ia";
        A.temaCreado({ ok: true, tema: t });
      });
      case "guardarTema": return luego(300, () => A.temaGuardado({ ok: true, tema: d.tema }));
      case "temaAMano": return luego(300, () => {
        // En la vista previa no corre el motor: un tema de ejemplo con el título escrito (en la app lo arma motor/lineas.js).
        if (!(d.preguntas || "").includes("*")) return A.temaCreado({ ok: false, error: "preguntas: entre 3 y 60.", problemas: ["Bloque 1: marca la respuesta correcta con *.", "preguntas: entre 3 y 60."] });
        const t = JSON.parse(JSON.stringify(DEMO.temas[2])); Object.assign(t, { id: "tema-a-mano", titulo: d.titulo, ramo: d.ramo, curso: d.curso });
        A.temaCreado({ ok: true, tema: t });
      });
      case "agregarDelCatalogo": return luego(300, () => A.temaGuardado({ ok: true, tema: { ...JSON.parse(JSON.stringify(DEMO.temas[1])), id: d.id } }));
      case "guardarCopia": return luego(600, () => A.copiaLista({ ok: true, cantidad: 7 }));
      case "traerCopia": return luego(600, () => A.copiaTraida({ ok: true, resumen: { temas: 1, progreso: 2 } }));
      case "explicar": return luego(1100, () => A.explicado({ ok: true, texto: tr("Piensa en una carrera de postas: la Patria Vieja fue la primera vuelta, en Rancagua se cayó el bastón (la Reconquista) y con Chacabuco el equipo lo recuperó y siguió corriendo: la Patria Nueva. (En la vista previa esta explicación es de ejemplo; en la app la escribe tu IA para cada pregunta.)") }));
      case "probarIA": return luego(500, () => { DEMO.config.ia = d.ia; A.iaProbada({ ia: d.ia, ok: true }); });
      case "abrirCarpeta": return toast("En la app, aquí se abre la carpeta");
      case "soltarMaterial": return luego(200, () => A.materialElegido([{ ruta: `/demo/${d.nombre}`, nombre: d.nombre }]));
      default: return COMUNES[accion]?.(d, c);
    }
  }

  const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2f5bea"/><path d="M14 18c6-3 12-3 18 1v30c-6-4-12-4-18-1z" fill="#fffefa"/><path d="M50 18c-6-3-12-3-18 1v30c6-4 12-4 18-1z" fill="#e8eeff"/><path d="M36 33l5 5 9-11" fill="none" stroke="#ffd84d" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  async function iniciar() {
    if (HOST === "web") {
      try { DEMO = await (await fetch("demo.json")).json(); } catch { DEMO = { hoy: new Date().toISOString().slice(0, 10), perfiles: [], temas: [], progreso: {}, pruebas: [], config: {}, ias: [] }; }
      const q = new URLSearchParams(location.search);
      DEMO.config.bienvenida = !q.has("bienvenida");
      if (q.has("vacio")) { DEMO.perfiles = []; DEMO.temas = []; }
    }
    const perfilPedido = new URLSearchParams(location.search).get("perfil"); // vista previa y pruebas: entrar directo a un perfil
    if (perfilPedido) E.perfil = perfilPedido;
    host.enviar("listo");
  }
  iniciar();
})();
