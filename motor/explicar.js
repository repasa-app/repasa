// «No entendí»: la IA explica una pregunta de otra forma. El mismo pedido y la misma limpieza que bin/explicar.py (la prueba del
// motor los compara con Python). La IA solo ve el tema (resumen) y esa pregunta, nunca quién pregunta.
import { RAMOS, nombreCurso, validar } from "./temas.js";

export function respuestaCorrecta(p) {
  if (p.tipo === "alternativas") return p.opciones[p.correcta];
  if (p.tipo === "vf") return p.correcta ? "Verdadero" : "Falso";
  return p.correcta[0];
}

export function pedido(t, p, respondio) {
  const r = [...String(respondio || "")].slice(0, 100).join("");
  return `Eres un profesor chileno muy paciente. Un estudiante de ${nombreCurso(t.curso)} no entendió esta pregunta
de ${RAMOS[t.ramo]} sobre «${t.titulo}».

Lo que dice el tema: ${t.resumen}
Pregunta: ${p.enunciado}
Respuesta correcta: ${respuestaCorrecta(p)}
${respondio ? `El estudiante respondió: ${r}` : ""}

Explícale de OTRA forma, más simple que «${p.explicacion}»: usa un ejemplo de la vida diaria o una comparación, en 3 a 5 frases
cortas, hablándole de tú y con cariño. Si respondió mal, dile sin retarlo por qué su respuesta no era. Solo texto plano, sin títulos
ni listas ni emojis de más (uno como máximo). No agregues datos que no estén en el tema.`;
}

/** Solo texto plano corto: sin Markdown ni HTML, hasta 900 caracteres. */
export const limpiar = (texto) => [...String(texto || "").replace(/[#*_`<>]/g, "").trim()].slice(0, 900).join("");

/** `preguntar(prompt, opciones)` devuelve el texto o lanza un Error con un mensaje para la persona. */
export async function explicar(preguntar, tema, preguntaId, respondio) {
  if (!tema || validar(tema).length) return { ok: false, error: "No encontré ese tema." };
  const p = tema.preguntas.find((x) => x.id === preguntaId);
  if (!p) return { ok: false, error: "No encontré esa pregunta." };
  try {
    const texto = limpiar(await preguntar(pedido(tema, p, respondio), { maxTokens: 400, temperatura: 0.5 }));
    return texto ? { ok: true, texto, pregunta: preguntaId } : { ok: false, error: "No se pudo explicar ahora." };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
