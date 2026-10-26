// Repasa en el celular: se carga ANTES que ui/app.js (script clásico, sin módulos) para que la interfaz sepa desde el primer momento
// que corre en el teléfono. Lo que la interfaz mande mientras carga el anfitrión (host.js, un módulo) queda en cola y se atiende
// apenas esté listo. El contenido de este archivo lo arma movil/armar.mjs (versión).
(() => {
  "use strict";
  window.REPASA_HOST = "movil";
  window.REPASA_VERSION = "__VERSION__";
  const cola = [];
  window.repasaMovil = { cola, enviar(msg) { cola.push(msg); } };
})();
