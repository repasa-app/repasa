// Motor de Repasa en JavaScript (ES modules, sin dependencias): lo que en el computador hace Python en bin/, para el celular.
// Mismas reglas y mismos casos (pruebas/casos.json); `node pruebas/motor.mjs` revisa que JS y Python den lo mismo.
// El cifrado es la pieza «cifrado» (ui/cifrado.js, script clásico): se carga antes que el motor (ver motor/copia.js).
export * as temas from "./temas.js";
export * as lineas from "./lineas.js";
export * as crearTema from "./crear_tema.js";
export * as explicar from "./explicar.js";
export * as datos from "./datos.js";
export * as copia from "./copia.js";
export * as carpeta from "./carpeta.js";
