// Preguntas, conceptos y tarjetas escritos como texto simple: lo que escribe un adulto «a mano» y lo que responde una IA chica
// (la del teléfono), que se equivoca mucho menos con este formato que con un JSON largo. La misma lógica que bin/lineas.py,
// probada con pruebas/casos.json (sección «lineas»).
//
//   ¿Qué se formó el 18 de septiembre de 1810?        ← enunciado (la primera línea del bloque)
//   * La Primera Junta Nacional de Gobierno            ← * la correcta
//   - El Congreso Nacional                             ← - una incorrecta (con incorrectas: alternativas, de 3 a 5 opciones)
//   - El Ejército de los Andes
//   > Ese día se formó la Primera Junta.                ← > la explicación (opcional)
//                                                      ← una línea en blanco separa las preguntas
//   La Primera Junta gobernaba en nombre del rey.      ← sin «-»: verdadero o falso…
//   * Verdadero
//
//   En 1814 se perdió la batalla de ___.               ← …o completar, si el enunciado lleva ___ (1 a 4 respuestas con *)
//   * Rancagua
//
// Conceptos: una línea por término, «Término: definición».

const CORRECTA = /^[*✓✔]\s*/u;
const INCORRECTA = /^[-–—]\s*/u;
const EXPLICACION = /^>\s*/;
const NUMERO = /^(?:[0-9]{1,3}\s*[.)-]|pregunta\s*[0-9]{1,3}\s*[:.)-]?)\s*/iu;
const VIÑETA = /^(?:[-*•–—]|[0-9]{1,3}\s*[.)])\s*/u;
const VERDADERO = new Set(["verdadero", "v", "true", "t", "si", "cierto", "correcto"]);
const FALSO = new Set(["falso", "f", "false", "no", "incorrecto"]);
const TEXTOS = {
  es: { respuesta: "La respuesta correcta es: {r}.", verdadero: "Verdadero", falso: "Falso", que_es: "¿Qué es «{t}»?" },
  en: { respuesta: "The correct answer is: {r}.", verdadero: "True", falso: "False", que_es: "What is “{t}”?" },
};
const textos = (idioma) => TEXTOS[idioma] || TEXTOS.es;
const limpiar = (l) => l.replaceAll("**", "").trim();
const sinTildes = (t) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.!¡*]/g, "").trim();

/** Bloques separados por líneas en blanco; cada bloque es la lista de sus líneas (limpias, sin vacías). */
function bloques(texto) {
  const r = [];
  let actual = [];
  for (const cruda of String(texto || "").replace(/\r\n?/g, "\n").split("\n")) {
    const l = limpiar(cruda);
    if (!l) { if (actual.length) r.push(actual); actual = []; } else actual.push(l);
  }
  if (actual.length) r.push(actual);
  return r;
}

/** Lee preguntas en el formato de arriba. Devuelve {preguntas, problemas}: lo que no se entiende no se usa y se dice por qué. */
export function leerPreguntas(texto, idioma = "es") {
  const T = textos(idioma), preguntas = [], problemas = [];
  bloques(texto).forEach((lineas, k) => {
    const donde = `Bloque ${k + 1}`;
    const enunciado = [], opciones = [], correctas = [], explicacion = [];
    let marcado = false;
    for (const l of lineas) {
      if (CORRECTA.test(l)) { marcado = true; const o = l.replace(CORRECTA, "").trim(); if (o) { correctas.push(o); opciones.push([o, true]); } }
      else if (INCORRECTA.test(l)) { marcado = true; const o = l.replace(INCORRECTA, "").trim(); if (o) opciones.push([o, false]); }
      else if (EXPLICACION.test(l)) { marcado = true; const x = l.replace(EXPLICACION, "").trim(); if (x) explicacion.push(x); }
      else if (marcado) explicacion.push(l);
      else enunciado.push(l);
    }
    const e = enunciado.join(" ").replace(NUMERO, "").trim();
    if (!e) { problemas.push(`${donde}: falta la pregunta.`); return; }
    if (!correctas.length) { problemas.push(`${donde}: marca la respuesta correcta con *.`); return; }
    const p = { id: "", tipo: "", enunciado: e, correcta: null, explicacion: "", dificultad: 1 };
    let respuesta;
    if (opciones.some(([, ok]) => !ok)) {
      if (correctas.length !== 1 || opciones.length < 3 || opciones.length > 5) { problemas.push(`${donde}: en alternativas va una sola correcta (*) y en total de 3 a 5 opciones.`); return; }
      p.tipo = "alternativas"; p.opciones = opciones.map(([o]) => o); p.correcta = opciones.findIndex(([, ok]) => ok); respuesta = correctas[0];
    } else if (e.includes("___")) {
      p.tipo = "completar"; p.correcta = correctas.slice(0, 4); respuesta = correctas[0];
    } else if (correctas.length === 1 && (VERDADERO.has(sinTildes(correctas[0])) || FALSO.has(sinTildes(correctas[0])))) {
      p.tipo = "vf"; p.correcta = VERDADERO.has(sinTildes(correctas[0])); respuesta = p.correcta ? T.verdadero : T.falso;
    } else { problemas.push(`${donde}: no sé qué tipo de pregunta es (agrega opciones con -, ___ para completar, o * Verdadero / * Falso).`); return; }
    p.explicacion = explicacion.join(" ") || T.respuesta.replace("{r}", respuesta);
    p.id = `p${preguntas.length + 1}`;
    preguntas.push(p);
  });
  return { preguntas, problemas };
}

/** «Término: definición», una por línea (hasta 30). Las líneas sin «:» no se usan. */
export function leerConceptos(texto) {
  const r = [];
  for (const cruda of String(texto || "").replace(/\r\n?/g, "\n").split("\n")) {
    const l = limpiar(cruda).replace(VIÑETA, "");
    const i = l.indexOf(":");
    if (i < 1) continue;
    const termino = l.slice(0, i).trim(), definicion = l.slice(i + 1).trim();
    if (termino && definicion && r.length < 30) r.push({ termino, definicion });
  }
  return r;
}

/** Tarjetas para memorizar a partir de los conceptos: «¿Qué es «X»?» → la definición (hasta 40). */
export function tarjetasDe(conceptos, idioma = "es") {
  const T = textos(idioma);
  return conceptos.slice(0, 40).map((c) => ({ frente: T.que_es.replace("{t}", c.termino), reverso: c.definicion }));
}
