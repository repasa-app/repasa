// El formato de un tema y su validación: el mismo `validar` que bin/temas.py, con los mismos mensajes.
// Un tema es un JSON de **solo datos** (formato en temas/README.md). Venga de la IA del teléfono, del computador, del catálogo o
// escrito a mano, pasa por `validar` antes de usarse; la interfaz escapa todo el texto antes de mostrarlo.
// Los casos de pruebas/casos.json (sección «validar») se corren en Python y en JS: si cambias una regla, cambia los dos lados.

export const FORMATO = 1;
export const RAMOS = { lenguaje: "Lenguaje", matematica: "Matemática", historia: "Historia", ciencias: "Ciencias", ingles: "Inglés",
  biologia: "Biología", quimica: "Química", fisica: "Física", filosofia: "Filosofía", artes: "Artes",
  tecnologia: "Tecnología", musica: "Música", otro: "Otro" };
export const CURSOS = ["5b", "6b", "7b", "8b", "1m", "2m", "3m", "4m"];
export const NOMBRE_CURSO = { "5b": "5° básico", "6b": "6° básico", "7b": "7° básico", "8b": "8° básico", "1m": "1° medio", "2m": "2° medio",
  "3m": "3° medio", "4m": "4° medio" };
const TIPOS = new Set(["alternativas", "vf", "completar"]);
const CLAVES = new Set(["formato", "id", "titulo", "ramo", "curso", "resumen", "conceptos", "preguntas", "tarjetas", "fuente", "autor", "creado", "notas"]);
const CLAVES_PREGUNTA = new Set(["id", "tipo", "enunciado", "opciones", "correcta", "explicacion", "dificultad"]);

/** Largo en caracteres como lo cuenta Python (puntos de código, no unidades UTF-16: un emoji cuenta 1). */
export const largo = (s) => [...s].length;
export const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esEntero = (v) => typeof v === "number" && Number.isInteger(v);
const texto = (v, maximo) => typeof v === "string" && largo(v.trim()) > 0 && largo(v.trim()) <= maximo && !v.includes("<");
const soloClaves = (o, permitidas) => Object.keys(o).every((k) => permitidas.has(k));

/** Lista de problemas (vacía = tema válido). */
export function validar(t) {
  if (!esObjeto(t)) return ["El tema no es un objeto JSON."];
  const e = [];
  if (t.formato !== FORMATO) e.push(`formato debe ser ${FORMATO}.`);
  const extra = Object.keys(t).filter((k) => !CLAVES.has(k)).sort();
  if (extra.length) e.push("Campos desconocidos: " + extra.join(", ") + ".");
  if (!(typeof t.id === "string" && /^[a-z0-9-]{2,60}$/.test(t.id))) e.push("id: minúsculas, números y guiones.");
  if (!texto(t.titulo, 80)) e.push("titulo: texto de 1 a 80 caracteres, sin HTML.");
  if (!(typeof t.ramo === "string" && Object.hasOwn(RAMOS, t.ramo))) e.push("ramo debe ser uno de: " + Object.keys(RAMOS).join(", ") + ".");
  if (!CURSOS.includes(t.curso)) e.push("curso debe ser uno de: " + CURSOS.join(", ") + ".");
  if (!texto(t.resumen, 3000)) e.push("resumen: la explicación fácil del tema (hasta 3000 caracteres, sin HTML).");
  const conceptos = "conceptos" in t ? t.conceptos : [];
  if (!Array.isArray(conceptos) || conceptos.length > 30 || !conceptos.every((c) => esObjeto(c) && texto(c.termino, 60) && texto(c.definicion, 400) && soloClaves(c, new Set(["termino", "definicion"]))))
    e.push("conceptos: lista de {termino, definicion} (máx. 30).");
  let preguntas = t.preguntas;
  if (!Array.isArray(preguntas) || !(preguntas.length >= 3 && preguntas.length <= 60)) { e.push("preguntas: entre 3 y 60."); preguntas = []; }
  const ids = new Set();
  preguntas.forEach((p, k) => e.push(...problemasDePregunta(p, `pregunta ${k + 1}`, ids)));
  const tarjetas = "tarjetas" in t ? t.tarjetas : [];
  if (!Array.isArray(tarjetas) || tarjetas.length > 40 || !tarjetas.every((c) => esObjeto(c) && texto(c.frente, 150) && texto(c.reverso, 300) && soloClaves(c, new Set(["frente", "reverso"]))))
    e.push("tarjetas: lista de {frente, reverso} (máx. 40).");
  return e;
}

/** Los problemas de una sola pregunta (los mismos mensajes que `validar`). `ids` lleva los ids ya vistos en el tema. */
export function problemasDePregunta(p, donde = "pregunta", ids = new Set()) {
  const e = [];
  if (!esObjeto(p)) { e.push(`${donde}: no es un objeto.`); return e; }
  if (!soloClaves(p, CLAVES_PREGUNTA)) e.push(`${donde}: campos desconocidos.`);
  if (!(typeof p.id === "string" && /^p[0-9]{1,3}$/.test(p.id)) || ids.has(p.id)) e.push(`${donde}: id como «p1», sin repetir.`);
  if (typeof p.id === "string") ids.add(p.id);
  if (!(typeof p.tipo === "string" && TIPOS.has(p.tipo))) e.push(`${donde}: tipo debe ser alternativas, vf o completar.`);
  if (!texto(p.enunciado, 300)) e.push(`${donde}: enunciado de 1 a 300 caracteres.`);
  if (!texto(p.explicacion, 500)) e.push(`${donde}: explicación de 1 a 500 caracteres.`);
  if (![1, 2, 3].includes(p.dificultad)) e.push(`${donde}: dificultad 1, 2 o 3.`);
  if (p.tipo === "alternativas") {
    const op = p.opciones;
    if (!(Array.isArray(op) && op.length >= 3 && op.length <= 5 && op.every((o) => texto(o, 120)) && new Set(op).size === op.length))
      e.push(`${donde}: de 3 a 5 opciones distintas.`);
    else if (!(esEntero(p.correcta) && p.correcta >= 0 && p.correcta < op.length))
      e.push(`${donde}: correcta es el número (desde 0) de la opción correcta.`);
  } else if (p.tipo === "vf") {
    if (typeof p.correcta !== "boolean" || "opciones" in p)
      e.push(`${donde}: en verdadero o falso, correcta es true o false y no lleva opciones.`);
  } else if (p.tipo === "completar") {
    const c = p.correcta;
    if (!(Array.isArray(c) && c.length >= 1 && c.length <= 4 && c.every((x) => texto(x, 40))) || "opciones" in p)
      e.push(`${donde}: en completar, correcta es la lista de respuestas aceptadas (1 a 4 palabras cortas).`);
    else if (!(typeof p.enunciado === "string" ? p.enunciado : "").includes("___"))
      e.push(`${donde}: el enunciado de completar lleva ___ donde va la respuesta.`);
  }
  return e;
}
export const nombreCurso = (c) => NOMBRE_CURSO[c] || c;

/** «Independencia de Chile» → «independencia-de-chile» (sin tildes, para nombres de carpeta). Igual que datos.id_de en Python. */
export function idDe(t) {
  const s = String(t).normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase();
  return s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "tema";
}
