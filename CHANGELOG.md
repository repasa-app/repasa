# Cambios · Changelog

Lo que cambia para quien usa Repasa, en palabras simples. Las versiones anteriores a este archivo están en
[Releases](https://github.com/repasa-app/repasa/releases).
*What changes for people using Repasa, in plain words. Earlier versions are listed in Releases.*

## Sin publicar · Unreleased

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
- Cuando la IA lee las fotos del cuaderno, ahora solo puede leerlas: tiene prohibido ejecutar, escribir o salir a internet, y ya no recibe los datos internos de Repasa ni tu memoria de Claude.
  *When the AI reads the notebook photos, it can now only read them: it may not run, write or go online, and it no longer receives Repasa's internal settings or your Claude memory.*
- Los nombres y títulos se muestran siempre como texto, nunca como parte de la página.
  *Names and titles are always shown as plain text, never as part of the page.*
