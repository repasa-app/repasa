<p align="center"><img src="docs/img/logo.png" width="96" alt="Repasa"></p>

<h1 align="center">Repasa</h1>

<p align="center"><b>Estudiar con lo que pasan en el colegio, de 5° básico a 4° medio.</b><br>
Le sacas una foto al cuaderno y Repasa arma un resumen fácil, preguntas tipo prueba y tarjetas para memorizar.<br>
Las preguntas que cuestan vuelven hasta que se aprenden. Gratis, de código abierto y sin cuentas.</p>

<p align="center"><a href="https://repasa-app.github.io/repasa/">Sitio</a> ·
<a href="https://repasa-app.github.io/repasa/demo/">Vista previa</a> ·
<a href="https://github.com/repasa-app/repasa/discussions">Comunidad</a> ·
<a href="CONTRIBUTING.md">Cómo aportar</a> ·
<a href="#english">English</a></p>

---

## Qué hace
- **De la foto al repaso:** fotos del cuaderno o de la guía, un PDF o texto pegado. La IA de un adulto de la casa (Claude, ChatGPT o
  Gemini, con su cuenta) arma el resumen, los conceptos, entre 3 y 60 preguntas (alternativas, verdadero o falso, completar) y tarjetas.
  Nada se guarda hasta que la persona revisa que calce con su cuaderno.
- **Repaso de cada día:** unos minutos al día con repetición espaciada (cajas de Leitner): lo que sale bien vuelve en días o semanas,
  lo que cuesta vuelve mañana.
- **Prepara la prueba:** dices la fecha y los temas, y Repasa les da prioridad los días antes.
- **"No entendí":** si una explicación no basta, la IA lo explica de otra forma, con un ejemplo de la vida diaria.
- **Ganas de volver:** puntos, racha de días seguidos y una celebración al terminar. Sin anuncios, sin compras dentro de la app.
- **Para adultos:** cómo le va a cada hijo o hija por ramo y en la semana, qué IA se usa e idioma. Varios perfiles en un mismo computador.

## Hecha para niñas y niños
- **Sin cuentas ni correos.** Cada perfil es solo un nombre o apodo, un curso y un personaje.
- **Todo queda en el computador**, en una carpeta con archivos abiertos (JSON). No hay servidores de Repasa, ni publicidad, ni telemetría.
- **La IA es la de un adulto** y solo ve el material que se agrega, el curso (para ajustar el nivel) y las preguntas. Nunca el nombre
  ni el progreso de nadie.
- **Respuestas validadas:** todo lo que viene de la IA o del catálogo se revisa (formato, largo, sin HTML) antes de mostrarse.

## Estado
Versión 0.1, recién nacida. Ya funcionan el motor (crear temas con la IA, explicar de nuevo, validar) y la interfaz completa, que
puedes [probar con datos ficticios](https://repasa-app.github.io/repasa/demo/). Las apps de Mac, Windows y Linux vienen en camino.

## Cómo funciona
```
fotos / PDF / texto ──► IA del adulto ──► tema (validado) ──► repaso diario con cajas ──► progreso por perfil
                         (resumen, preguntas, tarjetas)       (+ prioridad antes de una prueba)
```

## Formato de los datos
Todo vive en `~/Repasa/` (en Windows, `C:\Users\<tú>\Repasa`). Si lo cambiamos, será de forma compatible y avisando.

| Archivo | Qué guarda |
|---|---|
| `perfiles.json` | `[{"id", "nombre", "curso", "avatar"}]`: solo un nombre o apodo. |
| `temas/<id>/tema.json` | Lo que hay que estudiar. Formato en [`temas/README.md`](temas/README.md). |
| `temas/<id>/material/` | Copias de las fotos o PDF de donde salió el tema. |
| `progreso/<perfil>.json` | `{"puntos", "racha", "ultimo_dia", "preguntas": {"<tema>/<pregunta>": {"caja", "proxima"}}, "sesiones": [...]}` |
| `pruebas.json` | `[{"id", "perfil", "ramo", "temas": [...], "fecha"}]` |
| `.repasa/` | Ajustes de la app y temas descargados del catálogo. |

## Desarrollo
Necesitas Python 3 (solo biblioteca estándar) y Node para las pruebas de la interfaz.
```bash
cd ui && python3 -m http.server 8765      # interfaz con datos ficticios: http://localhost:8765 (?idioma=en, ?bienvenida, ?vacio)
python3 bin/crear_tema.py 6b historia "" foto.jpg /tmp/tema.json   # crear un tema con tu IA (no guarda nada)
bash pruebas/correr.sh                    # todas las pruebas
```
Lee [`AGENTS.md`](AGENTS.md) antes de cambiar algo: sirve igual para personas y para tu IA.

## Licencia
[AGPL-3.0](LICENSE). Puedes usar, estudiar, cambiar y compartir Repasa. Si la ofreces como servicio o la distribuyes modificada,
tienes que publicar tu código con la misma licencia.

---

## English
**Repasa** ("review") is a free, open-source study app for kids from 5th to 12th grade, made for the family computer. Snap a photo of
the school notebook or worksheet (or add a PDF or text) and a grown-up's own AI (Claude, ChatGPT or Gemini, with their account) builds
an easy summary, test-style questions and flashcards. Daily spaced-repetition reviews bring back what's hard until it's learned, a test
date makes Repasa prioritize those topics, and points and streaks keep it fun. No accounts, no ads, no servers: everything stays on the
computer in open files. Spanish-first, English included. Licensed under AGPL-3.0.
