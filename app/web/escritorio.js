// Copia cifrada en las apps de escritorio, con el mismo motor que el celular (motor/copia.js y motor/cifrado.js, WebCrypto).
// La app de Mac lo copia a ui/escritorio.js (y motor/ a ui/motor/) al empaquetar y lo carga como módulo en su WebView; la app
// lee y escribe los archivos de ~/Repasa y este módulo solo cifra, descifra y junta, sobre un almacén en memoria.
//
//   RepasaEscritorio.armar(archivos, frase, hoy)  → {ok, texto, cantidad} | {ok: false, error}
//   RepasaEscritorio.traer(archivos, texto, frase) → {ok, resumen, escribir: [{ruta, texto} | {ruta, base64}]} | {ok: false, error}
//
// `archivos` es {ruta: {texto} | {base64}} con rutas relativas a la carpeta Repasa (las de copia.RUTA_PERMITIDA). Para traer, el
// material puede venir con base64 vacío: solo importa que existe (juntar nunca pisa una foto). Lo que hay que escribir vuelve en
// `escribir` y la app lo revisa otra vez antes de tocar el disco (solo rutas permitidas, nunca fuera de ~/Repasa).
import { Almacen, adaptadorMemoria } from "./motor/datos.js";
import { armarCopia, abrirCopia, juntar, RUTA_PERMITIDA } from "./motor/copia.js";
import { revisarFrase } from "./motor/cifrado.js";

const NO_SE_PUDO = { armar: "No se pudo guardar la copia.", traer: "No se pudo abrir el archivo." };

/** Un almacén en memoria con lo que mandó la app (solo rutas permitidas y valores de texto). */
function almacenDe(archivos) {
  const mapa = new Map();
  for (const [ruta, valor] of Object.entries(archivos && typeof archivos === "object" ? archivos : {})) {
    if (!RUTA_PERMITIDA.test(ruta) || !valor || typeof valor !== "object") continue;
    if (typeof valor.texto === "string") mapa.set(ruta, { texto: valor.texto });
    else if (typeof valor.base64 === "string") mapa.set(ruta, { base64: valor.base64 });
  }
  return { almacen: new Almacen(adaptadorMemoria(mapa)), mapa };
}

export async function armar(archivos, frase, hoy) {
  const problema = revisarFrase(frase);
  if (problema) return { ok: false, error: problema };
  try {
    const { almacen } = almacenDe(archivos);
    const { texto, cantidad } = await armarCopia(almacen, frase, String(hoy || ""));
    return { ok: true, texto, cantidad };
  } catch {
    return { ok: false, error: NO_SE_PUDO.armar };
  }
}

export async function traer(archivos, texto, frase) {
  if (typeof frase !== "string" || !frase) return { ok: false, error: "La frase no es la correcta." };
  if (typeof texto !== "string" || !texto) return { ok: false, error: NO_SE_PUDO.traer };
  const { almacen, mapa } = almacenDe(archivos);
  const antes = new Map([...mapa].map(([k, v]) => [k, JSON.stringify(v)]));
  try {
    const entradas = await abrirCopia(texto, frase);
    const resumen = await juntar(almacen, entradas);
    // Solo lo que cambió: lo nuevo o distinto, nunca lo que ya estaba igual.
    const escribir = [...mapa].filter(([k, v]) => antes.get(k) !== JSON.stringify(v) && RUTA_PERMITIDA.test(k)).map(([ruta, v]) => ({ ruta, ...v }));
    return { ok: true, resumen, escribir };
  } catch (e) {
    // ErrorFrase / ErrorDañado traen un mensaje listo para mostrar («La frase no es la correcta.», «El archivo está dañado…»).
    return { ok: false, error: e?.message && e.constructor?.name !== "Error" ? e.message : NO_SE_PUDO.traer };
  }
}

if (typeof window !== "undefined") window.RepasaEscritorio = Object.freeze({ armar, traer });
