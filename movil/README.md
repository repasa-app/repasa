# Repasa en el celular (iPhone y Android) — fase 1

La misma interfaz de `ui/` dentro de una app de [Capacitor](https://capacitorjs.com) 7, con el motor JS de `motor/` (lo mismo que
hace Python en `bin/`) y la **IA del propio teléfono**. Todo queda en el teléfono; no hay servidores, cuentas, llaves de API ni
telemetría.

| Ruta | Qué es |
|---|---|
| `armar.mjs` | Arma `www/` (no se versiona): copia `ui/` (sin la vista previa), `motor/`, `host/` y los temas de ejemplo como catálogo. |
| `host/arranque.js`, `host/host.js` | El anfitrión del teléfono: atiende `host.enviar(...)` de la interfaz con el motor y los plugins (como `Ventana.swift` en el Mac). |
| `plugins/ia-local/` | Plugin propio: iOS (Swift) con Apple Foundation Models + Vision; Android (Kotlin) con Gemini Nano (ML Kit GenAI) + ML Kit Text Recognition. `disponible()`, `preparar()`, `leerTexto({ruta})`, `preguntar({prompt, maxTokens, temperatura})`. |
| `plugins/carpeta/` | Plugin propio: guardar y traer la copia cifrada con el selector de archivos del sistema (iCloud Drive, Google Drive…). |
| `ios/`, `android/` | Proyectos nativos (Xcode con Swift Package Manager; Gradle). Se versionan; `www/` y `node_modules/` no. |
| `iconos.mjs` | Íconos y pantallas de carga desde `ui/favicon.svg` (solo si cambia el logo). |

Versiones fijas (sin `^`): `@capacitor/core`, `cli`, `ios`, `android` 7.6.9, `@capacitor/camera` 7.0.5, `@capacitor/filesystem`
7.1.9. Kotlin 2.2.20, ML Kit Text Recognition 16.0.1 (modelo incluido en la app) y ML Kit GenAI Prompt 1.0.0-beta4.

## Compilar en el Mac

Necesitas Node 22, Xcode 26.2 y Android Studio (con el Android SDK 35 y su JDK 21). En la carpeta del repo:

```bash
cd movil
npm ci                       # instala exactamente lo de package-lock.json (incluye los plugins propios, por ruta), sin scripts de instalación (.npmrc)
npx cap telemetry off        # la herramienta de Capacitor no manda estadísticas de uso (una vez por computador)
npm run sync                 # = node armar.mjs && npx cap sync   (repetir cada vez que cambie ui/, motor/ o host/)
```

### iPhone: simulador
```bash
npx cap open ios             # abre ios/App/App.xcodeproj en Xcode
```
En Xcode: arriba elige el esquema **App** y un simulador (por ejemplo «iPhone 17 Pro», iOS 26) → ▶︎ (⌘R). La primera vez Xcode
baja los paquetes de Swift (Capacitor y los plugins oficiales, desde GitHub).
- La IA del teléfono funciona en el simulador si el Mac tiene **Apple Intelligence activado** (macOS 26, Mac con Apple Silicon).
- Para ver cómo se ve un teléfono sin IA: Product → Scheme → Edit Scheme → Run → Options → **Simulated Foundation Models
  Availability** (por ejemplo «Apple Intelligence Not Enabled»).
- Desde la terminal también sirve: `npx cap run ios --list` y `npx cap run ios --target <id del simulador>`.

### iPhone: en tu teléfono, sin cuenta pagada
1. Xcode → Settings → Accounts → **+** → tu Apple ID (queda un «Personal Team»).
2. En el proyecto: target **App** → Signing & Capabilities → Team: *tu nombre (Personal Team)*. Si dice que el identificador
   `app.repasa.movil` no está disponible, cámbialo por uno tuyo (por ejemplo `app.repasa.movil.casa`).
3. Conecta el iPhone por cable, desbloquéalo y acepta «Confiar en este computador». En el iPhone: Ajustes → Privacidad y
   seguridad → **Modo de desarrollador** → activar (se reinicia).
4. En Xcode elige tu iPhone arriba y ▶︎. La primera vez, en el iPhone: Ajustes → General → VPN y gestión de dispositivos → tu
   Apple ID → **Confiar**.
5. Con una cuenta gratis la app dura **7 días** instalada: para renovarla, conecta el iPhone y vuelve a ▶︎ (los datos se mantienen).

La IA del teléfono necesita iOS 26, un iPhone 15 Pro o más nuevo y Apple Intelligence activado (Ajustes → Apple Intelligence y
Siri). En otros iPhone la app funciona igual (leer fotos, temas a mano, catálogo, repaso) y lo dice claro donde hace falta la IA.

### Android: emulador
```bash
npx cap open android         # abre android/ en Android Studio (espera a que termine «Gradle sync»)
```
En Android Studio: Device Manager → crea o elige un emulador (API 35) → ▶︎ Run 'app'. Desde la terminal:
```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
npx cap run android --list
npx cap run android --target <id del emulador>
```
El emulador no trae Gemini Nano: ahí se prueba leer fotos (ML Kit), temas a mano, catálogo, repaso y la copia cifrada.

### Android: APK para tu teléfono
```bash
cd android
./gradlew assembleDebug      # → app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk    # con «Depuración por USB» activada en el teléfono
```
O manda el `.apk` al teléfono y ábrelo (Android pide permitir «instalar apps desconocidas» para esa app). Es una versión de
prueba firmada con la llave de depuración de tu computador; para las tiendas se firma aparte (más adelante).

Gemini Nano está en algunos teléfonos recientes con AICore (por ejemplo Pixel 9 en adelante o Galaxy S25). Si el teléfono lo
puede bajar, «Para adultos → La IA → Revisar de nuevo» se lo pide al sistema (lo baja AICore, no Repasa) y avisa cuando está listo.

### Mirar la interfaz por dentro
- iOS (versión de prueba): Safari del Mac → Desarrollo → *simulador o iPhone* → Repasa.
- Android (versión de prueba): Chrome → `chrome://inspect`.

## Cómo funciona
- **Datos:** los mismos archivos que en el computador (README, «Formato de los datos») dentro de la app (`Repasa/` en los datos de
  la app: Documents en iOS, archivos internos en Android). `host/host.js` los lee y escribe con `motor/datos.js` sobre Capacitor
  Filesystem (escritura en un temporal + renombrar; una cosa a la vez).
- **Fotos del cuaderno:** cámara o galería (Capacitor Camera) → `.repasa/temporal/` → `IaLocal.leerTexto` (Vision / ML Kit) →
  texto. Al guardar el tema, las fotos quedan en `temas/<id>/material/`; si no se guarda, se borran al abrir la app.
- **IA del teléfono:** modelos chicos (~4.000 tokens entre pedido y respuesta), así que `motor/crear_tema.js` (`crearLocal`) pide el
  tema por partes y en texto simple (`motor/lineas.js`): título y resumen, conceptos, y preguntas en dos tandas. Lo que no cumple el
  formato se deja fuera y el tema completo pasa por `temas.validar` antes de mostrarse. «No entendí» usa el mismo pedido que
  `bin/explicar.py`.
- **Sin IA en el teléfono:** la app lo dice (con el motivo: equipo, Apple Intelligence apagado, modelo bajando) y deja escribir el
  tema a mano o elegir uno del catálogo incluido. Nunca pide una llave de API.
- **Copia cifrada:** «Para adultos → Copia en tu nube». `motor/copia.js` cifra todo con la frase de la familia (PBKDF2-SHA256 de
  600.000 vueltas + AES-256-GCM) y `Carpeta.exportar` abre el selector del sistema para guardarla donde quieran (iCloud Drive,
  Google Drive). «Traer copia» la abre con la misma frase y **junta** (nunca borra): perfiles y pruebas por id, el avance pregunta
  por pregunta, temas nuevos. La frase no se guarda en ninguna parte.

## Qué falta (fase 2)
- **Sincronizar solo** con una carpeta cifrada en la nube de la familia, elegida una vez con el selector del sistema (en iOS con un
  marcador de seguridad; en Android con permiso persistente de Storage Access Framework) y la frase en el Llavero / Keystore. El
  formato ya está hecho y probado en `motor/carpeta.js` (archivos con nombres opacos, uno por archivo de `Repasa/`).
- **El computador hace el trabajo:** si el teléfono no tiene IA, deja un pedido cifrado en `pedidos/` de esa carpeta; la app de
  escritorio lo abre con la frase, corre `crear_tema.py` o `explicar.py` con la suscripción del adulto y deja la respuesta cifrada
  en `respuestas/`. El teléfono la valida como cualquier respuesta de IA. Formato y pruebas en `motor/carpeta.js`; falta el lado
  del computador y la sincronización.
- Leer PDF en el teléfono, tiendas (App Store y Google Play) y firma para distribuir.
