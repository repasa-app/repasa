# Repasa — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Repasa es una app de estudio para niñas y niños de 5° básico a 4° medio, pensada para el computador de la casa. Le sacan una foto al
cuaderno (o agregan un PDF o texto) y la IA de un adulto (Claude Code, Codex o Gemini, con su cuenta) arma un **tema**: resumen fácil,
conceptos, preguntas tipo prueba y tarjetas. El repaso diario usa cajas de Leitner; antes de una prueba se priorizan sus temas. Puntos y
racha para que den ganas de volver. Interfaz web única; app de Mac (`app/`, en pruebas), Windows y Linux en camino; app para iPhone y
Android (`movil/`, fase 1) con la IA del propio teléfono.

**Principios que no se negocian**
1. **Es para niños.** Sin cuentas, correos, chat entre usuarios, publicidad, compras ni enlaces a redes sociales. Nada que empuje a
   pasar más tiempo del necesario (sin rachas que castiguen, sin notificaciones insistentes). Lenguaje amable, nunca humillante.
2. **Los datos son de la familia.** Viven en el computador (`~/Repasa`) o en el teléfono, en formato abierto. No hay servidores propios
   ni telemetría. Lo que sale a la nube de la familia sale **cifrado** con una frase que solo ella conoce. Un perfil es solo un nombre o
   apodo, un curso y un personaje.
3. **La IA es la de un adulto** (en el computador, su suscripción de Claude, ChatGPT o Gemini) **o la del propio teléfono** (Apple
   Foundation Models, Gemini Nano): nunca una llave de API ni una cuenta nuestra. Ve lo mínimo: el material del tema, el curso y la
   pregunta. Nunca el nombre del perfil ni el progreso.
   Las fotos pueden traer nombres escritos: el prompt pide no usarlos y `temas.validar` limita lo que vuelve.
4. **Temas = solo datos.** Todo lo que viene de afuera (respuestas de la IA, temas del catálogo, traducciones) se valida antes de usarse
   y se escapa antes de mostrarse. La IA corrige con lo que dice el material; si algo no se lee, se deja fuera.
5. **Gratis y abierto** (AGPL-3.0).
6. **Nada personal en el código.** Ejemplos, pruebas y `ui/demo.json` solo con datos ficticios (Martina, Diego) y material inventado.
   Nunca una foto de un cuaderno real.

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `bin/` | Python **solo biblioteca estándar**. `datos.py` (carpetas, escritura atómica, ids, perfiles, progreso y pruebas con las reglas de `motor/datos.js`), `temas.py` (`validar`, ramos y cursos), `ia.py` (`preguntar()` con la IA del adulto; pasa fotos y PDF como copias), `crear_tema.py` (material → tema validado; `pedido`; `amano`; `guardar`), `lineas.py` (preguntas y conceptos en texto simple), `explicar.py` (explicar de nuevo una pregunta). Scripts que llaman las apps de escritorio: `estado.py` (todo lo que pinta la interfaz, más el catálogo incluido) y `guardar.py` (perfil, progreso, pruebas). Lo que manda la interfaz llega en un archivo de entrada, nunca como argumento. El último argumento de cada script es la ruta del JSON de salida. |
| `motor/` | El motor en **JavaScript** (ES modules, sin dependencias) para el celular: lo mismo que `bin/` (`temas.js`, `lineas.js`, `crear_tema.js`, `explicar.js`, `datos.js` sobre un adaptador de almacenamiento) más `cifrado.js` (WebCrypto), `copia.js` (copia cifrada y juntar) y `carpeta.js` (formato de la carpeta de la fase 2). |
| `app/` | App de Mac (SwiftPM, macOS 15, sin proyecto de Xcode). `RepasaApp.swift` (arranque y menús), `Ventana.swift` (WKWebView + puente: un `case` por acción; material por `repasa://material/…`; copia cifrada), `Servicios.swift` (rutas, config, idioma, IA del adulto, `Procesador` con la fila de archivos), `Actualizaciones.swift` (GitHub Releases o `git pull` en un checkout de desarrollo). `web/escritorio.js` (copia cifrada con el motor JS, en el WebView), `Info.plist`, `Repasa.icns` (sale de `herramientas/icono_mac.mjs`). |
| `build.sh`, `herramientas/empaquetar.sh` | Arman `dist/Repasa.app` (Python portátil verificado por SHA-256; `bin/`, `temas/` y `ui/` con `motor/` y `escritorio.js` adentro) + zip + `.sha256`; `build.sh` la instala en `~/Applications`. |
| `movil/` | App de iPhone y Android con Capacitor 7: `armar.mjs` (arma `www/` con `ui/` + `motor/` + `host/`), `host/` (el anfitrión del teléfono), `plugins/ia-local` (Swift: Foundation Models + Vision; Kotlin: Gemini Nano + ML Kit), `plugins/carpeta` (selector de archivos del sistema), `ios/` y `android/` (proyectos nativos). Comandos en `movil/README.md`. |
| `temas/` | Temas de ejemplo incluidos (vista previa y primeras pruebas) y `README.md` con el formato. |
| `ui/` | Interfaz web única (`app.js`, `app.css`), `demo.json` (ficticio, se genera con `herramientas/generar_demo.py`) e `idiomas/en.json`. |
| `docs/` | Página pública (GitHub Pages). `pagina.yml` la publica junto a `ui/` en `/demo/`. |
| `CHANGELOG.md` | Lo que cambia para quien usa la app, en palabras simples (ver «Lo que rodea a un cambio»). |
| `pruebas/` | `correr.sh` (todo), `test_python.py`, `motor.mjs` (motor JS: igual que Python, cifrado, copia), `escritorio.mjs` (copia cifrada del escritorio), `contrato.py` (puente, plugins y app de Mac), `interfaz.mjs` (Playwright; `MOVIL=1` con el anfitrión del teléfono), `movil.mjs` (la app del celular de punta a punta), `capacitor_falso.js`, `casos.json` (casos compartidos Python ↔ JS), `ia_falsa.py`, `datos/` (material ficticio). |
| `herramientas/` | `revisar_privacidad.sh`, `generar_demo.py`, `empaquetar.sh` (app de Mac), `icono_mac.mjs`, `imagenes.mjs` (imágenes de la página). |

## Cómo funciona
- **Crear un tema:** `crear_tema.py <curso> <ramo|auto> "<texto>" [archivos…] <salida.json>` copia el material a una carpeta temporal
  (`material-1.jpg`…), se lo pasa a la IA y valida el JSON que responde. No guarda nada: la app muestra una vista previa y, si la
  persona dice que sí, `crear_tema.py guardar <tema.json> [archivos…] <salida.json>` lo deja en `~/Repasa/temas/<id>/` con su material.
- **Repaso:** en `ui/app.js` (`elegirSesion`, `actualizarCaja`, `esCorrecta`, `actualizarRacha`), probado con `pruebas/casos.json`.
  Cajas 1–5 → próxima vez en 1, 3, 7, 14 y 30 días; un error vuelve a la caja 1 y la pregunta toca de nuevo hoy. Una sesión (hasta 12
  preguntas) junta primero lo que toca, después preguntas nuevas (de las más fáciles) y, si hay prueba en los próximos 4 días, pone
  primero sus temas y adelanta lo que aún no está en la caja 5. Completar acepta mayúsculas, tildes y, en palabras de 6+ letras, una letra de diferencia.
- **Bienvenida (primer uso, `bienvenida()` en `ui/app.js`):** lo primero es el idioma (paso 0: «Elige tu idioma · Choose your
  language», Español/English escritos cada uno en su idioma, el del sistema marcado como sugerido; teclas 1 y 2). Mientras no se
  elige no se pinta nada más (ni perfiles ni ajustes). Elegir guarda `idioma_ui` con `config`, igual que Ajustes, y el resto
  (presentación, la IA) ya sale en ese idioma. Quien ya tiene `bienvenida: true` no la vuelve a ver; el idioma se cambia en Ajustes.
- **Pintar (`pintar()` en `ui/app.js`):** arma el HTML de tres partes (barra, pantalla y diálogo) y reemplaza solo la que cambió
  (al cambiar el idioma, todo). Lo que se ve tiene que salir de `E`: un cambio hecho a mano en el DOM se pierde o queda pegado.
  Un diálogo que se vuelve a pintar con `mantener()` conserva su scroll. Probado en `pruebas/interfaz.mjs` («Pintar por partes»).
- **Explicar de nuevo:** `explicar.py <tema> <pregunta> "<lo que respondió>" <salida.json>` devuelve texto plano corto (sin Markdown
  ni HTML, máx. 900 caracteres).
- **Sin IA: a mano y catálogo.** «Nuevo tema» tiene tres formas: fotos con la IA, **a mano** y **catálogo** (los temas de `temas/`).
  A mano, las preguntas van en texto simple (`bin/lineas.py` = `motor/lineas.js`): un bloque por pregunta, `*` la correcta, `-` las
  incorrectas, `>` la explicación, `___` para completar; conceptos «Término: definición» (también se vuelven tarjetas).
  `crear_tema.py amano <entrada.json> <salida.json>` en el computador, `temaAMano` en el motor JS.
- **Motor JS = Python.** `motor/` repite las reglas de `bin/` para el celular. Casos compartidos en `pruebas/casos.json` (`validar`,
  `id_de`, `lineas`, `conceptos`, `a_mano`, `datos`) que corren los dos lados, y `pruebas/motor.mjs` compara en vivo los pedidos a la IA
  (`crear_tema.prompt`, `explicar.pedido`, `limpiar`, `completar`) con los de Python. **Si cambias una regla, cambia los dos lados
  y el caso.**
- **Celular (`movil/`, fase 1):** la misma `ui/` (la copia `movil/armar.mjs`, nunca a mano) con `window.REPASA_HOST = "movil"` y el
  anfitrión `movil/host/host.js`, que atiende las acciones del puente con el motor y los plugins por `Capacitor.nativePromise` (sin
  empaquetador). Datos con el mismo formato en `Repasa/` dentro de la app. En la interfaz, `MOVIL` cambia textos («este teléfono»),
  muestra cámara y galería, la copia cifrada, y esconde carpeta y actualizaciones. Áreas seguras con `env(safe-area-inset-*)`;
  a ancho de celular lo que se toca va abajo (botón «Nuevo tema», «Siguiente» fijo, diálogos como hojas con el pie fijo).
- **IA del teléfono:** `IaLocal.disponible()` dice si hay modelo y por qué no (`motivo`: dispositivo, desactivada, descargando,
  version). Los modelos son chicos (~4.000 tokens), así que `crearLocal` pide el tema por partes en texto simple (título y resumen,
  conceptos, preguntas en dos tandas), deja fuera lo que no cumple y valida el tema entero. Leer la foto: Vision / ML Kit, en el
  teléfono. Sin IA, la app lo dice y ofrece a mano y catálogo. **Nunca una llave de API.**
- **Relevo por el computador (fase 2, diseñado):** carpeta cifrada de la familia en su nube (`motor/carpeta.js`): `datos/` con
  nombres opacos (HMAC de la ruta), `pedidos/` (teléfono → computador) y `respuestas/` (computador → teléfono). El computador abre
  los pedidos con la frase (en su WebView, con este motor), corre `crear_tema.py` / `explicar.py` y responde cifrado; el teléfono
  valida como si fuera cualquier IA.
- **Cifrado:** `motor/cifrado.js`: PBKDF2-SHA256 (600.000 vueltas, sal de 16 bytes, frase normalizada NFC) → AES-256-GCM (IV de 12
  bytes por sobre, AAD que ata cada sobre a su lugar) + HMAC-SHA256 para nombres. Un verificador dice «la frase no es la correcta»
  sin tocar nada. La frase nunca se guarda. Copia manual (fase 1): `motor/copia.js` arma un solo archivo `.repasa` con todo (sin los
  ajustes), y al traerla **junta** sin borrar (`juntarProgreso`: gana lo respondido más tarde, puntos el mayor, sesiones unidas).

## Puente interfaz ↔ app
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Repasa.<funcion>(json)`. En el navegador, `simular()` responde
con datos ficticios. Acciones: `listo, config, guardarProgreso, guardarPerfil, guardarPruebas, elegirMaterial, soltarMaterial,
crearTema, temaAMano, agregarDelCatalogo, guardarTema, explicar, probarIA, abrirEnlace, abrirCarpeta, buscarActualizacion, actualizar,
guardarCopia, traerCopia` (`soltarMaterial` y `actualizar`: solo el computador). Respuestas: `estado, materialElegido, temaAvance,
temaCreado, temaGuardado, explicado, iaProbada, actualizacionRevisada, actualizacionProgreso, copiaLista, copiaTraida`. `estado` puede traer `capacidades` ({ia, iaDetalle, ocr, copia, camara}) y `catalogo` (sin ellos, la interfaz se porta
como antes); cada IA de `ias` puede traer `detalle` (por qué no está lista). Una acción nueva va en `ui/app.js`, en
`movil/host/host.js`, en cada app nativa y simulada en `simular()`; `pruebas/contrato.py` lo revisa (y que cada método nativo que usa
el celular exista en Swift, en Kotlin y en `pruebas/capacitor_falso.js`).

## App de Mac
- Datos en `~/Repasa` (0700; archivos 0600); el código va dentro de la app (`Contents/Resources/repasa`) y los scripts corren con el
  Python portátil incluido (`REPASA_RECURSOS` apunta ahí; las variables `REPASA_*` de afuera no llegan a los scripts ni a la IA, y sin
  `__pycache__` dentro de la app). La app nunca usa `ui/demo.json` (se quita al empaquetar). `window.REPASA_HOST = "mac"`.
- **Puente** (`Ventana.swift`): solo el marco principal con origen `file` (la interfaz de `ui/`); la ventana nunca navega fuera de
  `ui/` (un enlace https de Repasa se abre en el navegador; otros, nada). Lo que manda la interfaz no arma comandos: va en un JSON de
  entrada (`crear_tema.py pedido`, `explicar.py <entrada>`, `guardar.py`). Crear y guardar un tema solo aceptan archivos que la persona
  eligió en esta sesión (`NSOpenPanel` o arrastrados: `soltarMaterial` manda el contenido y queda en `.repasa/temporal/`).
- **Fila:** guardar perfil, progreso y pruebas, leer el estado (`estado.py`), guardar un tema y juntar una copia van de a uno
  (`Procesador.enFila`): un estado nunca se lee a medio guardar. Lo que espera a la IA no entra en la fila.
- **Material:** `repasa://material/<tema>/material-N.<ext>` (`EsquemaMaterial`), solo lectura de esa carpeta.
- **Copia cifrada:** la misma del celular. `empaquetar.sh` copia `motor/` a `ui/motor/` y `app/web/escritorio.js` a `ui/escritorio.js`,
  que se carga como módulo en el WebView. La app lee `~/Repasa`, `RepasaEscritorio.armar/traer` cifra, descifra y junta en memoria
  (`callAsyncJavaScript`, con los datos como argumentos) y lo que hay que escribir se revisa otra vez (`Rutas.permitidaEnCopia`).
  Probado en `pruebas/escritorio.mjs`.
- **IA del adulto:** `bin/ia.py` y la prueba de `IA.probar`: Claude sin MCP (`--strict-mcp-config`) y sin herramientas
  (`--disallowedTools "*"`; con material, solo `Read` de las copias y `--disallowedTools` con Bash, Edit, Write, MultiEdit,
  NotebookEdit, WebFetch, WebSearch y Task), sin la memoria de la persona (`SIN_MEMORIA_CLAUDE`), Codex `-s read-only`. Ninguna
  IA recibe las variables `REPASA_*` (`ia._entorno`); las de las pruebas se llaman `PRUEBA_*`.
- **Arranque:** menús y ventana de inmediato; lo que corre solo (revisar actualizaciones, al abrir y cada 6 horas) parte con
  `RepasaApp.iniciarTareas()` recién cuando hay idioma elegido. Una versión nueva se ofrece solo en «Para adultos» (nunca en la
  pantalla de los niños ni con alertas del sistema) y no se instala mientras la IA arma un tema.
- **Actualizaciones** (`Actualizaciones.swift`): Release `Repasa-macOS.zip` + `.sha256` solo desde
  `https://github.com/repasa-app/repasa/releases/download/…`, huella verificada, la app anterior queda como respaldo hasta que la nueva
  está en su lugar. Instalación de desarrollo (`~/Repasa/.repasa/desarrollo`): `git pull --ff-only` + `empaquetar.sh`. En los
  guiones, todo lo variable va con `comillas()` (`pruebas/contrato.py` lo revisa).
- Desarrollo en el Mac: el checkout va en `~/Developer/repasa` (macOS no distingue mayúsculas: `~/repasa` chocaría con `~/Repasa`);
  `bash build.sh` (se niega si la IA está armando un tema) e instala en `~/Applications/Repasa.app`. Compilar solo:
  `cd app && swift build -c release`. Swift solo compila en un Mac (o en el job `mac` de GitHub, que corre si cambió `app/`).
- Una acción nueva del puente va en `ui/app.js`, `simular()`, `movil/host/host.js` (o en `SOLO_ESCRITORIO` de `pruebas/contrato.py`)
  y en `Ventana.swift`.

## Reglas al cambiar cosas
- Código, comentarios, commits y textos en **español** (de Chile neutro). Todo texto nuevo visible va con su traducción en
  `ui/idiomas/en.json` en el mismo cambio, como frase completa con marcadores (`T("Acertaste {a} de {n}…", {a, n})`), nunca pedazos.
- Contenido del usuario y de la IA con `esc()` y `data-sin-traducir`. `T()` ya escapa sus valores (no les pongas `esc()`); para
  meter HTML armado por el código (con lo de la persona ya escapado) está `Thtml()`.
- Textos para niños: cortos, cálidos, sin sarcasmo; un error nunca se marca como "malo" (ver `BIEN` y `CASI` en `app.js`).
- Accesible: se puede usar entero con teclado (1–5 para alternativas, Enter para seguir), contraste AA, botones grandes.
- No cambies el formato de los datos (README, "Formato de los datos") sin compatibilidad.
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`, `?vacio`, `?perfil=martina`, `window.Repasa._probar(E => …)`), también a ancho de celular.
- Celular: después de cambiar `ui/`, `motor/` o `movil/host/`, `cd movil && npm run sync`. Swift y Kotlin no se compilan en Linux ni en
  GitHub todavía: compílalos en el Mac (Xcode y Android Studio) antes de dar por bueno un cambio en `movil/plugins` o `movil/ios|android`.
  Nada de red nueva en la app (la página tiene `connect-src 'self'`), ni dependencias nuevas sin conversarlo (versiones exactas).
  ML Kit (Android) trae un canal de métricas de uso para Google: `android/app/src/main/AndroidManifest.xml` le quita la salida
  (backend «cct» de datatransport). Toda librería nativa nueva se revisa por lo mismo.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.

## Lo que rodea a un cambio
Un cambio está listo cuando la app **y lo que la cuenta** dicen lo mismo. Antes de empezar, anota qué tipo de cambio es; al terminar,
revisa cada fila ("no aplica" se decide, no se supone):

| Si el cambio… | Deja al día |
|---|---|
| agrega o cambia una función | la página (`docs/`: funciones, «cómo funciona», comparación, preguntas frecuentes), el README y la guía si la hay |
| cambia lo que se ve | capturas de la página y del README (datos ficticios, español e inglés, normal y celular) e imagen para compartir si sale esa vista |
| cambia un flujo o un paso | instrucciones paso a paso, preguntas frecuentes, textos de la bienvenida e instalación si la toca |
| quita algo | bórralo de la página, el README y las guías: nada que prometa lo que ya no hace |
| cambia el formato de datos o el puente | la documentación del formato, `ejemplos/` si existe y esta guía |
| cambia carpetas, reglas o pruebas | esta guía (`AGENTS.md`) y `CONTRIBUTING.md` |
| resuelve un issue | ciérralo con «Resuelto en …» dando crédito y abre issues para lo que quedó pendiente |
| lo nota quien usa Repasa | `CHANGELOG.md`: una línea en «Sin publicar», en lenguaje de persona («Ahora puedes…»), en español e inglés |

Todo texto nuevo de la página y del README va en los dos idiomas, sin nada inventado. Antes de cerrar, busca con `grep` en `docs/` y el
README el nombre o el texto viejo de lo que cambió. Al publicar una versión, las líneas de «Sin publicar» pasan a su número.
Los issues que abrimos para una tarea traen una sección «Qué actualizar alrededor» con las filas de esta tabla que le tocan.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, scripts de instalación, red nueva, dependencias nuevas, binarios, cualquier cosa que lea claves o mande datos
afuera, enlaces externos en la interfaz). Los temas nuevos se validan con `temas.validar`, se revisa que el contenido sea correcto y
apropiado para la edad, y que no traigan nombres de personas ni de colegios. Detalle en `CONTRIBUTING.md`.

**Seguridad** ([SECURITY.md](SECURITY.md)): las fallas se reportan en privado. Las actions van fijadas por SHA completo con su versión en un
comentario (Dependabot las sube), con `permissions` mínimos, `persist-credentials: false`, nunca `pull_request_target` ni
`${{ github.event.* }}` dentro de `run:`. La página de `docs/` tiene una Content-Security-Policy con la huella de cada script en
línea: si cambias uno, `pruebas/test_python.py` (clase `Seguridad`) dice la huella nueva para `script-src`.
En `movil/`, `npm ci` sin scripts de instalación (`movil/.npmrc`) y `pruebas/contrato.py` revisa la configuración nativa: sin
`server.url` ni http en claro, Android con `allowBackup="false"` y sin componentes exportados de más, iOS sin excepciones de ATS.
