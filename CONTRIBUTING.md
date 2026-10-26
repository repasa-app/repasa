# Cómo aportar a Repasa

Repasa es gratis y abierta, y la hacemos entre todos: familias, profes, estudiantes y gente que programa. *(English below.)*

## Sin programar
- **Temas para el catálogo:** un tema de un contenido del currículum (por ejemplo "Fracciones equivalentes, 5° básico"), escrito a mano
  o armado con tu IA y revisado por ti. El formato está en [`temas/README.md`](temas/README.md). Que no traiga nombres de personas ni de
  colegios, ni fotos de cuadernos.
- **¿Eres profe?** Revisa que las preguntas y explicaciones de los temas de ejemplo estén bien y al nivel del curso.
- **Conversa:** dudas, ideas o cómo lo usan en tu casa → [Discussions](https://github.com/repasa-app/repasa/discussions).
- **Cuéntanos qué falla o qué te gustaría** en [issues](https://github.com/repasa-app/repasa/issues/new/choose).
- **Pruébala** con la [vista previa](https://repasa-app.github.io/repasa/demo/), en celular, tablet o con lector de pantalla.
- **Traducciones:** revisa o mejora `ui/idiomas/en.json`, o propón otro idioma.

## Programando (con o sin IA)
1. Lee [`AGENTS.md`](AGENTS.md): cómo funciona, reglas y cómo se conectan las piezas. Sirve igual para personas y para tu IA
   (`CLAUDE.md` y `GEMINI.md` solo apuntan a ese archivo).
2. Haz un fork, una rama y tu cambio. La sección "Desarrollo" del [README](README.md#desarrollo) explica cómo correrla.
3. Corre `bash pruebas/correr.sh` (lo mismo que revisa GitHub en cada cambio).
4. Abre un pull request contando qué cambia para quien usa Repasa y cómo lo probaste.

Reglas que importan: es una app para niños (nada de cuentas, anuncios, chat, compras ni enlaces a redes); código, comentarios y textos
en español (todo texto nuevo de la interfaz con su traducción en `ui/idiomas/en.json`); **nunca subas fotos de cuadernos reales ni
datos de niños** (usa material inventado); solo biblioteca estándar en Python; y no romper el
[formato de los datos](README.md#formato-de-los-datos).

Los aportes entran con la licencia del proyecto, [AGPL-3.0](LICENSE).

## Cómo revisamos
Todo entra por pull request y lo junta alguien que mantiene el proyecto: nadie puede subir cambios directo. Revisamos:
- **Siempre:** que las pruebas de GitHub pasen, que no haya datos personales y que el cambio haga lo que dice. Si es tu primer
  aporte, GitHub espera a que aprobemos correr las pruebas (es normal).
- **Código:** que no agregue dependencias, conexiones a internet nuevas, enlaces externos ni nada que mande datos afuera, y que los
  textos nuevos sean amables y tengan su traducción.
- **Temas:** que sean válidos (`temas.validar`), correctos, apropiados para la edad y sin datos de nadie.
- **Traducciones:** que una persona que hable el idioma revise el texto.

¿Buscas por dónde empezar? Mira los issues con la etiqueta
[`good first issue`](https://github.com/repasa-app/repasa/labels/good%20first%20issue) o pregunta en Discussions.

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md).

---

## Contributing (English)
- **No code needed:** write curriculum topics for the catalog (format in `temas/README.md`, no names or notebook photos), review the
  sample topics if you're a teacher, chat in [Discussions](https://github.com/repasa-app/repasa/discussions), report bugs or ideas,
  test the preview and help with translations.
- **Code (with or without AI):** read [`AGENTS.md`](AGENTS.md), fork, branch, run `bash pruebas/correr.sh` and open a pull request.
  It's an app for kids: no accounts, ads, chat, purchases or social links. Code and comments are in Spanish; UI text needs its English
  entry in `ui/idiomas/en.json`; never commit real notebook photos or children's data.
- **Review:** everything goes through a pull request and a maintainer merges it. Contributions are licensed under AGPL-3.0.
