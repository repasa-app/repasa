# Repasa — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Repasa es una app de estudio para niñas y niños de 5° básico a 4° medio, pensada para el computador de la casa. Le sacan una foto al
cuaderno (o agregan un PDF o texto) y la IA de un adulto (Claude Code, Codex o Gemini, con su cuenta) arma un **tema**: resumen fácil,
conceptos, preguntas tipo prueba y tarjetas. El repaso diario usa cajas de Leitner; antes de una prueba se priorizan sus temas. Puntos y
racha para que den ganas de volver. Interfaz web única; apps de escritorio para Mac, Windows y Linux en camino.

**Principios que no se negocian**
1. **Es para niños.** Sin cuentas, correos, chat entre usuarios, publicidad, compras ni enlaces a redes sociales. Nada que empuje a
   pasar más tiempo del necesario (sin rachas que castiguen, sin notificaciones insistentes). Lenguaje amable, nunca humillante.
2. **Los datos son de la familia.** Viven en el computador (`~/Repasa`), en formato abierto. No hay servidores propios ni telemetría.
   Un perfil es solo un nombre o apodo, un curso y un personaje.
3. **La IA es la de un adulto** y ve lo mínimo: el material del tema, el curso y la pregunta. Nunca el nombre del perfil ni el progreso.
   Las fotos pueden traer nombres escritos: el prompt pide no usarlos y `temas.validar` limita lo que vuelve.
4. **Temas = solo datos.** Todo lo que viene de afuera (respuestas de la IA, temas del catálogo, traducciones) se valida antes de usarse
   y se escapa antes de mostrarse. La IA corrige con lo que dice el material; si algo no se lee, se deja fuera.
5. **Gratis y abierto** (AGPL-3.0).
6. **Nada personal en el código.** Ejemplos, pruebas y `ui/demo.json` solo con datos ficticios (Martina, Diego) y material inventado.
   Nunca una foto de un cuaderno real.

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `bin/` | Python **solo biblioteca estándar**. `datos.py` (carpetas, escritura atómica, ids), `temas.py` (`validar`, ramos y cursos), `ia.py` (`preguntar()` con la IA del adulto; pasa fotos y PDF como copias), `crear_tema.py` (material → tema validado; `guardar`), `explicar.py` (explicar de nuevo una pregunta). El último argumento de cada script es la ruta del JSON de salida. |
| `temas/` | Temas de ejemplo incluidos (vista previa y primeras pruebas) y `README.md` con el formato. |
| `ui/` | Interfaz web única (`app.js`, `app.css`), `demo.json` (ficticio, se genera con `herramientas/generar_demo.py`) e `idiomas/en.json`. |
| `docs/` | Página pública (GitHub Pages). `pagina.yml` la publica junto a `ui/` en `/demo/`. |
| `pruebas/` | `correr.sh` (todo), `test_python.py`, `interfaz.mjs` (Playwright), `casos.json` (casos compartidos), `ia_falsa.py`, `datos/` (material ficticio). |
| `herramientas/` | `revisar_privacidad.sh`, `generar_demo.py`. |

## Cómo funciona
- **Crear un tema:** `crear_tema.py <curso> <ramo|auto> "<texto>" [archivos…] <salida.json>` copia el material a una carpeta temporal
  (`material-1.jpg`…), se lo pasa a la IA y valida el JSON que responde. No guarda nada: la app muestra una vista previa y, si la
  persona dice que sí, `crear_tema.py guardar <tema.json> [archivos…] <salida.json>` lo deja en `~/Repasa/temas/<id>/` con su material.
- **Repaso:** en `ui/app.js` (`elegirSesion`, `actualizarCaja`, `esCorrecta`, `actualizarRacha`), probado con `pruebas/casos.json`.
  Cajas 1–5 → próxima vez en 1, 3, 7, 14 y 30 días; un error vuelve a la caja 1 y la pregunta toca de nuevo hoy. Una sesión (hasta 12
  preguntas) junta primero lo que toca, después preguntas nuevas (de las más fáciles) y, si hay prueba en los próximos 4 días, pone
  primero sus temas y adelanta lo que aún no está en la caja 5. Completar acepta mayúsculas, tildes y, en palabras de 6+ letras, una letra de diferencia.
- **Explicar de nuevo:** `explicar.py <tema> <pregunta> "<lo que respondió>" <salida.json>` devuelve texto plano corto (sin Markdown
  ni HTML, máx. 900 caracteres).

## Puente interfaz ↔ app
La UI llama `host.enviar(accion, datos)` y la app responde con `window.Repasa.<funcion>(json)`. En el navegador, `simular()` responde
con datos ficticios. Acciones: `listo, config, guardarProgreso, guardarPerfil, guardarPruebas, elegirMaterial, crearTema, guardarTema,
explicar, probarIA, abrirEnlace, abrirCarpeta, buscarActualizacion`. Respuestas: `estado, materialElegido, temaCreado, temaGuardado,
explicado, iaProbada, actualizacionRevisada`. Una acción nueva va en `ui/app.js`, en cada app nativa y simulada en `simular()`.

## Reglas al cambiar cosas
- Código, comentarios, commits y textos en **español** (de Chile neutro). Todo texto nuevo visible va con su traducción en
  `ui/idiomas/en.json` en el mismo cambio, como frase completa con marcadores (`T("Acertaste {a} de {n}…", {a, n})`), nunca pedazos.
- Contenido del usuario y de la IA con `esc()` y `data-sin-traducir`.
- Textos para niños: cortos, cálidos, sin sarcasmo; un error nunca se marca como "malo" (ver `BIEN` y `CASI` en `app.js`).
- Accesible: se puede usar entero con teclado (1–5 para alternativas, Enter para seguir), contraste AA, botones grandes.
- No cambies el formato de los datos (README, "Formato de los datos") sin compatibilidad.
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`, `?vacio`, `?perfil=martina`, `window.Repasa._probar(E => …)`), también a ancho de celular.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, scripts de instalación, red nueva, dependencias nuevas, binarios, cualquier cosa que lea claves o mande datos
afuera, enlaces externos en la interfaz). Los temas nuevos se validan con `temas.validar`, se revisa que el contenido sea correcto y
apropiado para la edad, y que no traigan nombres de personas ni de colegios. Detalle en `CONTRIBUTING.md`.
