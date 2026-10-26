# Formato de un tema

Un tema es un JSON de **solo datos**: lo que hay que estudiar de una materia. Repasa lo valida (`bin/temas.py`, `validar`) antes de
usarlo, venga de la IA, del catálogo o escrito a mano. Los de esta carpeta vienen con la app como ejemplo y para la vista previa.

```json
{
  "formato": 1,
  "id": "fracciones",                       // minúsculas, números y guiones; es el nombre de la carpeta
  "titulo": "Fracciones: comparar y sumar", // hasta 80 caracteres
  "ramo": "matematica",                     // lenguaje, matematica, historia, ciencias, ingles, biologia, quimica, fisica, filosofia, artes, tecnologia, musica, otro
  "curso": "6b",                            // 5b, 6b, 7b, 8b (básico) · 1m, 2m, 3m, 4m (medio)
  "resumen": "Explicado fácil, hasta 3000 caracteres.",
  "conceptos": [{"termino": "Numerador", "definicion": "El número de arriba…"}],        // hasta 30
  "preguntas": [                                                                        // entre 3 y 60, ids p1, p2…
    {"id": "p1", "tipo": "alternativas", "enunciado": "…", "opciones": ["…", "…", "…"], "correcta": 1, "explicacion": "…", "dificultad": 1},
    {"id": "p2", "tipo": "vf", "enunciado": "…", "correcta": true, "explicacion": "…", "dificultad": 1},
    {"id": "p3", "tipo": "completar", "enunciado": "El número de abajo se llama ___.", "correcta": ["denominador"], "explicacion": "…", "dificultad": 2}
  ],
  "tarjetas": [{"frente": "…", "reverso": "…"}],                                        // hasta 40
  "autor": "ia"                                                                         // opcional: "ia" o el usuario de GitHub de quien lo aportó
}
```

- **alternativas:** de 3 a 5 opciones distintas; `correcta` es la posición (desde 0).
- **vf:** `correcta` es `true` o `false`.
- **completar:** el enunciado lleva `___`; `correcta` es una lista con 1 a 4 respuestas aceptadas (Repasa ignora mayúsculas, tildes y,
  en palabras largas, una letra de diferencia).
- `dificultad` va de 1 (fácil) a 3 (difícil). La `explicacion` se muestra cuando la respuesta no es la correcta: que sea corta y amable.

Para aportar un tema al catálogo, que sea de un contenido del currículum (no de un colegio ni de una persona) y que no traiga nombres,
fotos de cuadernos ni nada que identifique a alguien.
