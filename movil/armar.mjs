// Arma la carpeta web de la app del celular (www/) sin copiar nada a mano: la misma interfaz de ui/, el motor/ y el anfitrión del
// teléfono (host/). Después: npx cap sync. Uso: node armar.mjs [--salida carpeta]
// - index.html carga host/arranque.js antes de app.js y host/host.js (módulo) después; viewport con viewport-fit=cover (notch).
// - Sin la vista previa (demo.json, demo/): en el teléfono los datos son los de la familia.
// - Los temas de ejemplo (temas/*.json, validados) van como catálogo incluido, con temas/index.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validar } from "../motor/temas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..");
const i = process.argv.indexOf("--salida");
const SALIDA = path.resolve(i > 0 ? process.argv[i + 1] : path.join(AQUI, "www"));
const version = JSON.parse(fs.readFileSync(path.join(AQUI, "package.json"), "utf8")).version;

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });
const copiar = (de, a, filtro = () => true) => fs.cpSync(de, a, { recursive: true, filter: (f) => filtro(path.relative(de, f)) });
copiar(path.join(RAIZ, "ui"), SALIDA, (r) => r !== "demo.json" && r !== "demo" && !r.startsWith("demo" + path.sep));
copiar(path.join(RAIZ, "motor"), path.join(SALIDA, "motor"));
copiar(path.join(AQUI, "host"), path.join(SALIDA, "host"));
fs.writeFileSync(path.join(SALIDA, "host", "arranque.js"), fs.readFileSync(path.join(AQUI, "host", "arranque.js"), "utf8").replace("__VERSION__", version));

const temas = [];
fs.mkdirSync(path.join(SALIDA, "temas"));
for (const f of fs.readdirSync(path.join(RAIZ, "temas")).filter((x) => x.endsWith(".json")).sort()) {
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, "temas", f), "utf8"));
  const problemas = validar(t);
  if (problemas.length) throw new Error(`temas/${f} no es válido: ${problemas[0]}`);
  fs.writeFileSync(path.join(SALIDA, "temas", f), JSON.stringify(t));
  temas.push(t.id);
}
fs.writeFileSync(path.join(SALIDA, "temas", "index.json"), JSON.stringify(temas));

let html = fs.readFileSync(path.join(SALIDA, "index.html"), "utf8");
const cambios = [
  ['<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'],
  ['<script src="app.js"></script>', '<script src="host/arranque.js"></script>\n  <script src="app.js"></script>\n  <script type="module" src="host/host.js"></script>'],
];
for (const [a, b] of cambios) {
  if (!html.includes(a)) throw new Error("ui/index.html cambió: no encuentro " + a);
  html = html.replace(a, b);
}
fs.writeFileSync(path.join(SALIDA, "index.html"), html);
console.log(`✓ ${path.relative(process.cwd(), SALIDA) || "."}: ui + motor + host, ${temas.length} temas de catálogo (versión ${version})`);
