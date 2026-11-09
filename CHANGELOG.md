# Cambios · Changelog

Lo que cambia para quien usa Repasa, en palabras simples. Cada versión publicada se descarga desde
[Releases](https://github.com/repasa-app/repasa/releases).
*What changes for people using Repasa, in plain words. Each published version can be downloaded from Releases.*

## Sin publicar · Unreleased

## 0.2.0 · 2026-11-08

- La app de Mac es más liviana: ahora está hecha con Rust y Tauri, sobre el navegador del sistema. Todo sigue igual: tus perfiles,
  temas, progreso, la copia cifrada y tus ajustes. · *The Mac app is lighter: it's now built with Rust and Tauri, on the system's
  browser. Everything stays the same: your profiles, topics, progress, the encrypted copy and your settings.*

## 0.1.0 · 2026-11-02

- **La primera versión para descargar:** la app de Mac (macOS 15, Apple Silicon) ya se baja lista desde la
  [página](https://repasa-app.github.io/repasa/) o desde [Releases](https://github.com/repasa-app/repasa/releases), sin armarla
  desde el código. Todavía no tiene firma de Apple: la primera vez, intenta abrirla y después ve a Ajustes del
  Sistema → Privacidad y seguridad → «Abrir igualmente». Cuando hay una versión nueva, avisa en «Para adultos» y se instala con un botón.
  *The first version to download: the Mac app (macOS 15, Apple Silicon) now comes ready from the
  [website](https://repasa-app.github.io/repasa/) or from Releases, no need to build it from source. It isn't signed by Apple yet:
  the first time, try to open it, then go to System Settings → Privacy & Security → «Open Anyway». When there's a new version, it
  says so in «For grown-ups» and installs with one button.*
- En la primera pantalla, el idioma también se elige con las flechas, y dice que se cambia en «Para adultos». Si eligen el idioma y
  cierran la app antes de terminar, al volver siguen desde el saludo. En el Mac, los paneles para elegir fotos o una copia y para
  guardarla vuelven a decir qué elegir.
  *On the first screen you can also pick the language with the arrow keys, and it says it can be changed in «For grown-ups». If you
  pick the language and close the app before finishing, you continue from the greeting. On the Mac, the panels for choosing photos
  or a copy and for saving it say again what to choose.*
- **La app de Mac, sobre la base compartida de Pieza:** la ventana, los menús, los ajustes y las actualizaciones ahora son los de la
  familia de apps. Para ti se ve igual: la misma carpeta `~/Repasa`, los mismos perfiles, temas y ajustes, los mismos menús y
  atajos («Para adultos…» con ⌘,), y las versiones nuevas siguen apareciendo solo en «Para adultos». Ahora cada tarea tiene un tiempo
  máximo (si la IA se queda pegada, Repasa la corta y lo dice) y, al cerrar, nada queda corriendo por detrás.
  *The Mac app, on Pieza's shared base: the window, menus, settings and updates now come from the family of apps. For you it looks
  the same: the same `~/Repasa` folder, the same profiles, topics and settings, the same menus and shortcuts («For grown-ups…» with
  ⌘,), and new versions still show up only in «For grown-ups». Every task now has a time limit (if the AI gets stuck, Repasa stops
  it and says so) and, when you quit, nothing keeps running behind.*
- En pantallas táctiles todos los botones siguen siendo grandes, para dedos chicos. En el celular, «El computador de la casa» ya no
  ofrece «Revisar de nuevo» (todavía no existe: llega muy pronto). Las copias en tu nube se guardan y se abren igual que antes.
  *On touch screens every button stays large, for small fingers. On the phone, «The home computer» no longer offers «Check again»
  (it doesn't exist yet: coming soon). Copies in your cloud are saved and opened just like before.*
- Ahora puedes elegir en «Para adultos» si Repasa se ve clara, oscura o como el sistema. El rojo y el verde de las respuestas se leen
  mejor, borrar una prueba pregunta antes, Esc cierra cualquier ventana y «Acerca de» trae «Enviar comentarios» (abre GitHub con el
  mensaje listo; nunca es obligatorio).
  *You can now choose in «For grown-ups» whether Repasa looks light, dark or matches the system. The red and green of answers are
  easier to read, deleting a test asks first, Esc closes any window and «About» has «Send feedback» (opens GitHub with the message
  ready; never required).*
- Al abrir una ventana, el lector de pantalla anuncia su título primero; al borrar una prueba, el botón elegido es «Dejarla», así un
  Enter apurado no borra nada. En el celular, si la IA del teléfono no está lista, «Revisar de nuevo» la vuelve a buscar.
  *When a window opens, the screen reader announces its title first; when deleting a test, «Keep it» is selected, so a hurried
  Enter deletes nothing. On the phone, if the phone's AI isn't ready, «Check again» looks for it again.*
- **Por dentro, piezas de Pieza:** la IA, los ajustes y los idiomas ahora usan las piezas compartidas de la familia (`nucleo`, `ia`,
  `i18n`). Al tocar «Usar», la IA se prueba con las mismas protecciones que cuando arma un tema, y los ajustes solo guardan lo que
  Repasa conoce. Tus temas y el avance de cada perfil siguen donde estaban.
  *Under the hood, Pieza pieces: the AI, settings and languages now use the family's shared pieces (`nucleo`, `ia`, `i18n`). When
  you tap «Use», the AI is tested with the same protections as when it builds a topic, and settings only keep what Repasa knows.
  Your topics and each profile's progress stay where they were.*
- Al traer una copia en tu nube, Repasa ahora te dice si el archivo no es una copia de Repasa, si viene de una versión más nueva
  («Actualiza la app») o si todavía se está copiando. Las copias que ya guardaste se siguen abriendo con su frase.
  *When bringing a copy from your cloud, Repasa now tells you if the file isn't a Repasa copy, if it comes from a newer version
  («Update the app») or if it's still being copied. The copies you already saved still open with their passphrase.*
- Abrir «Para adultos» o cerrar un diálogo es más rápido cuando hay muchos temas, y un diálogo ya no salta arriba al tocar algo dentro (por ejemplo, «Usar y probar» en la IA o «Guardar copia»).
  *Opening «For grown-ups» or closing a dialog is faster with many topics, and a dialog no longer jumps to the top when you tap something inside it (for example, «Use and test» on an AI or «Save copy»).*
- Cuando la IA lee las fotos del cuaderno, ahora solo puede leerlas: tiene prohibido ejecutar, escribir o salir a internet, y ya no recibe los datos internos de Repasa ni tu memoria de Claude.
  *When the AI reads the notebook photos, it can now only read them: it may not run, write or go online, and it no longer receives Repasa's internal settings or your Claude memory.*
- Los nombres y títulos se muestran siempre como texto, nunca como parte de la página.
  *Names and titles are always shown as plain text, never as part of the page.*
