# Seguridad

Repasa es gratis y abierta, y la usan niñas y niños: la seguridad y su privacidad van primero. Si encuentras una falla de seguridad, gracias por avisar: la arreglamos antes de contarla.
*(English below.)*

## Cómo reportar una falla (en privado)
**No abras un issue público ni lo cuentes en Discussions.** Usa el reporte privado de GitHub:
[**Reportar una vulnerabilidad**](https://github.com/repasa-app/repasa/security/advisories/new) (pestaña *Security* → *Report a vulnerability*).
Solo lo ven quienes mantienen el proyecto.

Cuéntanos qué pasa, cómo repetirlo (pasos, archivo o tema de ejemplo **con datos ficticios**), qué versión o commit usas y en qué
sistema. Nunca mandes datos de niños, nombres reales ni fotos de un cuaderno real: arma el ejemplo con material inventado.

Qué puedes esperar:
- Respuesta en **7 días** como máximo, diciendo si lo pudimos repetir.
- Mientras lo arreglamos te contamos cómo va. Cuando salga la versión con el arreglo publicamos un aviso (GitHub Security Advisory)
  y, si quieres, te damos el crédito.
- Pedimos no publicar detalles hasta que el arreglo esté disponible (como regla general, 90 días como máximo).

## Qué cuenta
- Que un **tema** (del catálogo, a mano o de la IA), una **copia cifrada** o una traducción logren ejecutar código, mostrar HTML o
  escribir fuera de la carpeta de Repasa.
- Fallas del **cifrado** de la copia (`ui/cifrado.js` —pieza «cifrado» de Pieza—, `motor/copia.js`, `motor/carpeta.js`): abrirla sin la frase, cambiarla sin que se note, o que
  deje ver nombres o temas.
- La app del celular: el puente entre la página y los plugins nativos (`movil/plugins`), permisos, archivos de la app expuestos,
  respaldos o cualquier dato que salga del teléfono sin cifrar.
- La app de Mac: el puente entre la página y la app (`app/Sources/Repasa/Ventana.swift`), leer o escribir fuera de `~/Repasa`, correr
  comandos con lo que manda la interfaz, o colar una actualización que no venga de los Releases de Repasa con su huella.
- Cualquier cosa que mande datos de la familia afuera, muestre publicidad o contenido inapropiado para la edad, o permita contactar
  a un niño.
- Problemas en los workflows de GitHub o en cómo se arma la app que permitan colar código.

No cuentan: fallas de tu IA (Claude Code, Codex, Gemini) o de Apple Intelligence, Gemini Nano o Capacitor (repórtalas a ellos; si Repasa las expone de más, sí cuenta); ataques que ya necesitan control total del
computador o del teléfono; o pedir encabezados que GitHub Pages no deja configurar en la página pública.

## Cómo nos protegemos
- Todo entra por pull request y lo junta quien mantiene el proyecto, después de leer el diff completo (ver [CONTRIBUTING.md](CONTRIBUTING.md)).
- Las GitHub Actions están fijadas por SHA, con permisos mínimos y sin `pull_request_target`; Dependabot propone actualizaciones con
  unos días de espera (`.github/dependabot.yml`).
- Python solo con biblioteca estándar y motor JS sin dependencias. La app del celular instala versiones exactas (`npm ci` con `package-lock.json`) y sin scripts de instalación (`movil/.npmrc`).
- La interfaz tiene una Content-Security-Policy sin `unsafe-eval` ni scripts en línea; todo lo que viene de afuera se valida y se escapa.

---

## Security policy (English)
**Please don't open a public issue.** Report vulnerabilities privately through GitHub:
[**Report a vulnerability**](https://github.com/repasa-app/repasa/security/advisories/new). Include what happens, how to reproduce it (with
**fictional data only**), the version or commit and your OS. We reply within **7 days**, keep you posted, publish a GitHub Security
Advisory with the fix and credit you if you want. Please don't disclose details until a fix is out (90 days at most as a general rule).

In scope: code execution or HTML injection through topics, encrypted copies or translations; weaknesses in the backup encryption; the WebView ↔ native bridge, permissions, backups or app files on the phone; the Mac app's bridge, file access outside `~/Repasa` or updates that don't come from Repasa's own releases with a matching checksum; anything that sends family data out, shows ads or age-inappropriate content, or lets someone contact a child; CI/build issues that let code slip in. Out of scope: bugs in your own AI CLI or in Apple Intelligence, Gemini Nano or Capacitor, attacks that already require full control of the
device, and headers GitHub Pages can't set.
