// Crear un tema: de material (texto de las fotos, lo que se pega o lo que escribe un adulto) a un tema validado.
// - `prompt`, `leerJsonIA` y `completar` son los mismos que bin/crear_tema.py (la prueba del motor los compara con Python).
// - `crearLocal` es para la IA del propio teléfono (Apple Foundation Models, Gemini Nano): modelos chicos con poco contexto
//   (~4.000 tokens), así que se les pide por partes y en texto simple (motor/lineas.js), no un JSON largo.
// - `temaAMano` es para crear un tema sin IA (igual que `crear_tema.py amano`).
// Nada de esto guarda: devuelve el tema validado y la app lo muestra para que la persona diga que sí.
import { RAMOS, CURSOS, nombreCurso, idDe, validar, problemasDePregunta, largo } from "./temas.js";
import { leerPreguntas, leerConceptos, tarjetasDe } from "./lineas.js";

export const EJEMPLO = {
  formato: 1, id: "fracciones-equivalentes", titulo: "Fracciones equivalentes", ramo: "matematica", curso: "5b",
  resumen: "Dos fracciones son equivalentes cuando representan la misma parte de un entero. Por ejemplo, 1/2 y 2/4: si partes una pizza en 2 y te comes 1, comes lo mismo que si la partes en 4 y te comes 2. Para encontrar una equivalente, multiplica o divide el numerador y el denominador por el mismo número.",
  conceptos: [{ termino: "Numerador", definicion: "El número de arriba: cuántas partes tomas." },
    { termino: "Denominador", definicion: "El número de abajo: en cuántas partes iguales se divide el entero." }],
  preguntas: [
    { id: "p1", tipo: "alternativas", enunciado: "¿Qué fracción es equivalente a 1/2?", opciones: ["2/3", "3/6", "1/4"], correcta: 1,
      explicacion: "3/6 es 1/2 multiplicando arriba y abajo por 3.", dificultad: 1 },
    { id: "p2", tipo: "vf", enunciado: "2/4 y 4/8 son fracciones equivalentes.", correcta: true,
      explicacion: "Las dos son iguales a 1/2.", dificultad: 1 },
    { id: "p3", tipo: "completar", enunciado: "El número de abajo de una fracción se llama ___.", correcta: ["denominador"],
      explicacion: "El denominador dice en cuántas partes iguales se divide el entero.", dificultad: 2 }],
  tarjetas: [{ frente: "¿Cómo encuentro una fracción equivalente?", reverso: "Multiplico o divido arriba y abajo por el mismo número." }],
};

const cortar = (t, n) => [...t].slice(0, n).join("");

/** El pedido completo (el mismo de Python): para una IA grande, la del computador o un modelo con mucho contexto. */
export function prompt(curso, ramo, texto, hayArchivos) {
  const material = hayArchivos
    ? "Lee TODO el material de esta carpeta (archivos material-1, material-2…: fotos del cuaderno, guías o PDF)" + (texto ? " y también este texto:\n" + texto : ".")
    : "Este es el material:\n" + texto;
  return `Eres un profesor chileno cercano y muy claro. Un estudiante de ${nombreCurso(curso)} necesita repasar
${ramo !== "auto" ? (RAMOS[ramo] ?? ramo) : "una materia del colegio"} para una prueba. ${material}

Con ese material arma un tema de repaso en JSON, con EXACTAMENTE este formato (ejemplo de otro tema):
${JSON.stringify(EJEMPLO, null, 1)}

Reglas:
- Usa SOLO lo que está en el material. No inventes fechas, nombres ni datos; si algo no se lee bien, déjalo fuera.
- Lenguaje para ${nombreCurso(curso)}: frases cortas, ejemplos de la vida diaria, sin tecnicismos innecesarios.
- resumen: «explicado fácil», de 3 a 8 frases. conceptos: los términos clave (hasta 12).
- preguntas: entre 10 y 20, variadas (alternativas, vf y completar), de dificultad 1 a 3, como las de una prueba. En alternativas,
  las opciones incorrectas son creíbles pero claramente incorrectas. En completar, «correcta» lista las formas aceptadas de la
  respuesta (1 palabra o 2) y el enunciado lleva ___. La explicación dice por qué, en una o dos frases.
- tarjetas: entre 5 y 12, para memorizar.
- ramo: ${ramo === "auto" ? "elige el que corresponda entre " + Object.keys(RAMOS).join(", ") : ramo}. curso: ${curso}. id: el título en minúsculas con guiones.
- Contenido apropiado para su edad. Nada de datos personales aunque aparezcan en el material (nombres de compañeros, del colegio).

Responde SOLO con el JSON, sin explicaciones.`;
}

/** El primer objeto JSON de la respuesta (las IA a veces lo envuelven en texto o en ```json). */
export function leerJsonIA(texto) {
  const m = /\{[\s\S]*\}/.exec(texto || "");
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Lo que no se le deja a la IA: formato, curso, ramo pedido, id desde el título, autor y fecha. */
export function completar(t, curso, ramo, hoy) {
  if (!("formato" in t)) t.formato = 1;
  t.curso = curso;
  if (ramo !== "auto") t.ramo = ramo;
  t.id = idDe(String(t.titulo || t.id || "tema"));
  t.autor = "ia";
  t.creado = hoy;
  return t;
}

const noSirve = (nombreIA, problema) => `Lo que armó ${nombreIA} no sirve todavía (${problema}). Inténtalo de nuevo o con una foto más clara.`;

function revisarEntrada(curso, texto) {
  if (!CURSOS.includes(curso)) return "Curso no válido.";
  if (!String(texto || "").trim()) return "Agrega una foto o escribe el texto que hay que estudiar.";
  return "";
}

/** Con una IA que entiende el pedido completo (como en el computador). `preguntar(prompt, opciones)` devuelve el texto. */
export async function crearCompleto(preguntar, { curso, ramo, texto, hoy, nombreIA = "tu IA" }) {
  const error = revisarEntrada(curso, texto);
  if (error) return { ok: false, error };
  let respuesta;
  try { respuesta = await preguntar(prompt(curso, ramo, cortar(String(texto).trim(), 20000), false), { maxTokens: 6000 }); }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
  const t = leerJsonIA(respuesta);
  if (t && typeof t === "object" && !Array.isArray(t)) completar(t, curso, ramo, hoy);
  const problemas = t && typeof t === "object" && !Array.isArray(t) ? validar(t) : ["no devolvió un tema"];
  return problemas.length ? { ok: false, error: noSirve(nombreIA, problemas[0]) } : { ok: true, tema: t };
}

// ───────────── La IA del teléfono: por partes y en texto simple ─────────────
const REGLAS = "Usa SOLO lo que dice el material: no inventes fechas, nombres ni datos; si algo no se entiende, déjalo fuera. " +
  "Escribe en el mismo idioma del material. Nada de datos personales aunque aparezcan (nombres de compañeros, profesores o del colegio).";
const FORMATO_PREGUNTAS = `¿Pregunta de alternativas?
* respuesta correcta
- respuesta incorrecta creíble
- otra respuesta incorrecta creíble
> por qué es la correcta, en una frase

Una afirmación que sea verdadera o falsa.
* Verdadero
> por qué, en una frase

Una frase con ___ donde va una palabra clave.
* la palabra que falta
> por qué, en una frase`;
// Si el modelo copia el ejemplo tal cual, esas «preguntas» no se usan.
const DEL_EJEMPLO = ["¿Pregunta de alternativas?", "Una afirmación que sea verdadera o falsa.", "Una frase con ___ donde va una palabra clave."];

function encabezado(curso, ramo, material) {
  return `Eres un profesor chileno cercano y muy claro. Este es material de ${ramo === "auto" ? "una materia del colegio" : RAMOS[ramo] ?? ramo} para un estudiante de ${nombreCurso(curso)}:
"""
${material}
"""
`;
}
export function promptResumen(curso, ramo, material) {
  return `${encabezado(curso, ramo, material)}
Responde SOLO con estas líneas, sin nada más:
TÍTULO: el tema en pocas palabras (máximo 60 letras)
${ramo === "auto" ? `RAMO: uno de estos: ${Object.keys(RAMOS).join(", ")}\n` : ""}RESUMEN: de 3 a 6 frases cortas que lo expliquen fácil, con un ejemplo de la vida diaria

${REGLAS}`;
}
export function promptConceptos(curso, ramo, material) {
  return `${encabezado(curso, ramo, material)}
Escribe los términos clave del material (entre 4 y 8), uno por línea, así:
Término: definición corta y fácil

Solo esas líneas, sin títulos ni números. ${REGLAS}`;
}
export function promptPreguntas(curso, ramo, material, n, yaEstan = []) {
  return `${encabezado(curso, ramo, material)}
Escribe ${n} preguntas tipo prueba sobre este material, de la más fácil a la más difícil, mezclando estos tres tipos. Usa EXACTAMENTE este formato, con una línea en blanco entre preguntas:

${FORMATO_PREGUNTAS}

Si la afirmación es falsa, escribe «* Falso». No numeres las preguntas.${yaEstan.length ? `\nYa están estas, no las repitas:\n${yaEstan.map((e) => "- " + e).join("\n")}` : ""}
${REGLAS}`;
}

/** Lee la respuesta de `promptResumen`: {titulo, ramo, resumen} (ramo solo si es uno conocido). */
export function leerResumen(texto) {
  const t = String(texto || "").replaceAll("**", "");
  const titulo = (/^\s*T[IÍ]TULO\s*:\s*(.+)$/imu.exec(t)?.[1] || "").trim();
  const ramoTxt = (/^\s*RAMO\s*:\s*(.+)$/imu.exec(t)?.[1] || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const ramo = Object.keys(RAMOS).find((r) => new RegExp(`\\b${r}\\b`).test(ramoTxt)) || "";
  const resumen = (/RESUMEN\s*:\s*([\s\S]+)/iu.exec(t)?.[1] || "").replace(/\s+/g, " ").trim();
  return { titulo: cortar(titulo, 80), ramo, resumen: cortar(resumen, 3000) };
}

/** Posición fija pero no siempre la primera para la correcta (los modelos chicos casi siempre la ponen arriba). */
function mezclar(p) {
  if (p.tipo !== "alternativas") return p;
  const n = p.opciones.length, destino = [...p.enunciado].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 9973, 7) % n;
  const correcta = p.opciones[p.correcta], resto = p.opciones.filter((_, i) => i !== p.correcta);
  resto.splice(destino, 0, correcta);
  return { ...p, opciones: resto, correcta: destino };
}
const clave = (e) => e.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Crea un tema con la IA del teléfono. `preguntar(prompt, {maxTokens, temperatura})` devuelve el texto o lanza un Error con un
 * mensaje para la persona. `capacidad.contexto` es la ventana del modelo en tokens. `avance(paso, total)` va mostrando por dónde va.
 */
export async function crearLocal(preguntar, { curso, ramo, texto, hoy, idioma = "es", nombreIA = "la IA del teléfono", capacidad = {}, avance = () => {} }) {
  const error = revisarEntrada(curso, texto);
  if (error) return { ok: false, error };
  const contexto = Math.max(2048, Number(capacidad.contexto) || 4096);
  // Lo que cabe del material: la ventana menos instrucciones y respuesta, a ~2,2 caracteres por token (español, tokenizadores chicos).
  const limite = Math.min(12000, Math.floor((contexto - 1700) * 2.2));
  const completo = String(texto).trim(), material = cortar(completo, limite);
  const avisos = largo(completo) > limite ? ["El material era largo y usé solo la primera parte. Para un tema largo, créalo en dos partes."] : [];
  const pedir = async (p, maxTokens, temperatura = 0.3) => String(await preguntar(p, { maxTokens, temperatura }) || "");
  try {
    avance(1, 4);
    const r = leerResumen(await pedir(promptResumen(curso, ramo, material), 500));
    if (!r.titulo || !r.resumen) return { ok: false, error: noSirve(nombreIA, "no escribió el título y el resumen") };
    avance(2, 4);
    const conceptos = leerConceptos(await pedir(promptConceptos(curso, ramo, material), 600))
      .filter((c) => largo(c.termino) <= 60 && largo(c.definicion) <= 400 && !(c.termino + c.definicion).includes("<")).slice(0, 12);
    const preguntas = [];
    for (let vuelta = 0; vuelta < 2 && preguntas.length < 8; vuelta++) {
      avance(3 + vuelta, 4 + vuelta);
      const leidas = leerPreguntas(await pedir(promptPreguntas(curso, ramo, material, vuelta ? 4 : 6, preguntas.map((p) => p.enunciado)), 1400, vuelta ? 0.6 : 0.3), idioma);
      for (const p of leidas.preguntas) {
        if (DEL_EJEMPLO.includes(p.enunciado) || preguntas.some((q) => clave(q.enunciado) === clave(p.enunciado))) continue;
        if (problemasDePregunta({ ...p, id: "p1" }).length) continue; // lo que no cumple el formato se deja fuera, no tumba el tema
        preguntas.push(mezclar(p));
      }
    }
    const n = preguntas.length;
    preguntas.forEach((p, i) => { p.id = `p${i + 1}`; p.dificultad = i < n / 3 ? 1 : i < (2 * n) / 3 ? 2 : 3; });
    const t = completar({ formato: 1, titulo: r.titulo, ramo: ramo === "auto" ? r.ramo || "otro" : ramo, resumen: r.resumen,
      conceptos, preguntas, tarjetas: tarjetasDe(conceptos, idioma) }, curso, ramo, hoy);
    const problemas = validar(t);
    if (problemas.length) return { ok: false, error: noSirve(nombreIA, problemas[0]) };
    return { ok: true, tema: t, avisos };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Un tema escrito por un adulto, sin IA (igual que `crear_tema.py amano`). */
export function temaAMano(d, hoy) {
  d = d && typeof d === "object" ? d : {};
  const idioma = d.idioma === "en" ? "en" : "es";
  const titulo = String(d.titulo || "").trim();
  if (!titulo) return { ok: false, error: "Escribe un título.", problemas: [] };
  const conceptos = leerConceptos(d.conceptos);
  const leidas = leerPreguntas(d.preguntas, idioma);
  const resumen = String(d.resumen || "").trim() || cortar(conceptos.map((c) => `${c.termino}: ${c.definicion}`).join(" "), 3000).trim() || titulo;
  const t = { formato: 1, id: idDe(titulo), titulo, ramo: d.ramo, curso: d.curso, resumen, conceptos, preguntas: leidas.preguntas,
    tarjetas: tarjetasDe(conceptos, idioma), creado: hoy };
  const problemas = [...leidas.problemas, ...validar(t)];
  return problemas.length ? { ok: false, error: problemas[0], problemas } : { ok: true, tema: t };
}
