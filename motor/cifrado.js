// Cifrado de lo que sale del teléfono hacia la nube de la familia (iCloud Drive, Google Drive): WebCrypto, sin dependencias.
// - La llave sale de una **frase que solo conoce la familia** con PBKDF2-SHA256 (600.000 vueltas, sal aleatoria de 16 bytes).
//   De esos 512 bits, 256 son la llave AES-256-GCM y 256 una llave HMAC-SHA256 para los nombres de archivo (así la nube no ve
//   ni el nombre de un perfil ni el de un tema).
// - Cada sobre lleva su propio IV aleatorio de 12 bytes; GCM detecta cualquier cambio. Los datos adicionales (AAD) atan cada sobre
//   a su lugar: un archivo cambiado de nombre o de copia no se abre.
// - Un «verificador» (la palabra «repasa» cifrada) permite decir «la frase no es la correcta» antes de tocar nada.
// La frase nunca se guarda en el archivo ni se manda a ninguna parte.

export const ITERACIONES = 600000;
export const MIN_ITERACIONES = 100000; // al abrir: un archivo con menos vueltas no se acepta (no se baja la seguridad)
const subtle = () => globalThis.crypto.subtle;
const utf8 = new TextEncoder(), deUtf8 = new TextDecoder("utf-8", { fatal: true });

export class ErrorFrase extends Error {}
export class ErrorDañado extends Error {}
export const MENSAJES = { frase: "La frase no es la correcta.", dañado: "El archivo está dañado o no es una copia de Repasa." };

export function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function deBase64(b64) {
  if (typeof b64 !== "string" || b64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw new ErrorDañado(MENSAJES.dañado);
  let s;
  try { s = atob(b64); } catch { throw new ErrorDañado(MENSAJES.dañado); } // un archivo raro nunca da un error sin explicar
  const r = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) r[i] = s.charCodeAt(i);
  return r;
}
export const aBytes = (texto) => utf8.encode(texto);
export const aTexto = (bytes) => deUtf8.decode(bytes);
export const azar = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Llaves desde la frase. La frase se normaliza (NFC) para que «canción» escrita en un iPhone y en un Android sea la misma. */
export async function derivarLlaves(frase, sal, iteraciones = ITERACIONES) {
  if (typeof frase !== "string" || !frase) throw new ErrorFrase(MENSAJES.frase);
  if (!Number.isInteger(iteraciones) || iteraciones < MIN_ITERACIONES || iteraciones > 10000000) throw new ErrorDañado(MENSAJES.dañado);
  const base = await subtle().importKey("raw", aBytes(frase.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones }, base, 512));
  const aes = await subtle().importKey("raw", bits.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const hmac = await subtle().importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  bits.fill(0);
  return { aes, hmac, sal, iteraciones };
}

/** Un sobre: {iv, datos} en base64. `aad` es un texto que ata el sobre a su lugar. */
export async function cifrar(llaves, bytes, aad) {
  const iv = azar(12);
  const datos = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aBytes(aad), tagLength: 128 }, llaves.aes, bytes));
  return { iv: aBase64(iv), datos: aBase64(datos) };
}
export async function descifrar(llaves, sobre, aad) {
  if (!sobre || typeof sobre !== "object") throw new ErrorDañado(MENSAJES.dañado);
  const iv = deBase64(sobre.iv), datos = deBase64(sobre.datos);
  if (iv.length !== 12 || datos.length < 16) throw new ErrorDañado(MENSAJES.dañado);
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aBytes(aad), tagLength: 128 }, llaves.aes, datos));
  } catch { throw new ErrorDañado(MENSAJES.dañado); }
}
export const cifrarJSON = async (llaves, valor, aad) => cifrar(llaves, aBytes(JSON.stringify(valor)), aad);
export async function descifrarJSON(llaves, sobre, aad) {
  try { return JSON.parse(aTexto(await descifrar(llaves, sobre, aad))); } catch (e) { throw e instanceof ErrorDañado ? e : new ErrorDañado(MENSAJES.dañado); }
}

/** Nombre de archivo que no dice nada (32 caracteres hexadecimales) pero siempre es el mismo para la misma ruta y la misma frase. */
export async function nombreOpaco(llaves, ruta) {
  const firma = new Uint8Array(await subtle().sign("HMAC", llaves.hmac, aBytes("repasa:ruta:" + ruta)));
  return [...firma.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const VERIFICADOR = "repasa", AAD_VERIFICADOR = "repasa:verificador";

/** Cabecera nueva (sal, vueltas y verificador; nada secreto) y las llaves para seguir cifrando. */
export async function nuevaCabecera(frase, iteraciones = ITERACIONES) {
  const sal = azar(16);
  const llaves = await derivarLlaves(frase, sal, iteraciones);
  const verificador = await cifrar(llaves, aBytes(VERIFICADOR), AAD_VERIFICADOR);
  return { cabecera: { kdf: { alg: "PBKDF2-SHA256", iteraciones, sal: aBase64(sal) }, cifrado: "AES-256-GCM", verificador }, llaves };
}

/** Abre una cabecera con la frase: devuelve las llaves o lanza ErrorFrase («La frase no es la correcta.»). */
export async function abrirCabecera(cabecera, frase) {
  const k = cabecera?.kdf;
  if (!k || k.alg !== "PBKDF2-SHA256" || cabecera.cifrado !== "AES-256-GCM") throw new ErrorDañado(MENSAJES.dañado);
  const sal = deBase64(k.sal);
  if (sal.length < 16) throw new ErrorDañado(MENSAJES.dañado);
  const llaves = await derivarLlaves(frase, sal, k.iteraciones);
  let v;
  try { v = aTexto(await descifrar(llaves, cabecera.verificador, AAD_VERIFICADOR)); } catch { throw new ErrorFrase(MENSAJES.frase); }
  if (v !== VERIFICADOR) throw new ErrorFrase(MENSAJES.frase);
  return llaves;
}

/** Una frase sirve si es larga: 12 caracteres o más (mejor 4 palabras). Devuelve el problema o "". */
export function revisarFrase(frase) {
  if (typeof frase !== "string" || [...frase.trim()].length < 12) return "Usa una frase de al menos 12 caracteres (por ejemplo, cuatro palabras).";
  return "";
}
