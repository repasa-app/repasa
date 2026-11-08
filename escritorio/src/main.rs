// Repasa para Mac (y Windows y Linux cuando lleguen), sobre la pieza «host-tauri» (src/pieza/): la ventana con la interfaz de
// ui/, el puente con sus guardas (la ventana nunca sale de ui/), config e idioma desde app.json, los menús en el idioma elegido,
// la apariencia, guardar al salir y las acciones declaradas en acciones.json (guardar perfil, progreso y pruebas en la fila,
// tema a mano, del catálogo, explicar y probar la IA: solo corren un script). Aquí queda lo propio de Repasa: el material del
// tema (material.rs), la copia cifrada (copia.rs), los enlaces de Repasa, la carpeta y lo que se suma al estado.
// Reemplaza a app/Sources/Repasa (Swift). Los datos de la familia viven en ~/Repasa, fuera de la app: actualizar nunca borra nada.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod pieza;
#[path = "pieza/actualizaciones.rs"]
mod actualizaciones;
mod b64;
mod copia;
mod material;

use pieza::host::{arrancar, Host, ItemMenu, MenuPropio, Opciones, Ventana};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;

/// ~/Repasa: los datos de la familia (perfiles, progreso, pruebas, temas). La carpeta interna (~/Repasa/.repasa: config,
/// temporal, desarrollo) es `host.datos` (app.json → "datos": "visible").
pub fn base() -> PathBuf {
    pieza::enchufe::casa().join("Repasa")
}

/// Los únicos enlaces que abre la app (es para niños): el sitio y el repositorio de Repasa.
fn enlace_nuestro(u: &str) -> bool {
    let Ok(u) = url::Url::parse(u) else { return false };
    if u.scheme() != "https" || !u.username().is_empty() || u.password().is_some() || u.port().is_some() {
        return false;
    }
    match u.host_str() {
        Some("repasa-app.github.io") => u.path().starts_with("/repasa/"),
        Some("github.com") => u.path().starts_with("/repasa-app/"),
        _ => false,
    }
}

fn abrir_carpeta() {
    let b = base();
    if std::fs::create_dir_all(&b).is_ok() {
        pieza::enchufe::solo_persona(&b);
    }
    let _ = opener::open(&b);
}

fn main() {
    let menu = MenuPropio {
        archivo: vec![ItemMenu::Nativo { etiqueta: "Abrir la carpeta de Repasa".into(), atajo: None, f: Arc::new(|_: &Host| abrir_carpeta()) }],
        ..Default::default()
    };
    let op = Opciones {
        // La ventana de siempre: mismo tamaño y mínimo que la de Swift.
        ventana: Ventana { ancho: 1180.0, alto: 800.0, min_ancho: 420.0, min_alto: 560.0, ..Default::default() },
        global: Some("Repasa".into()),
        sitio: Some("https://repasa-app.github.io/repasa/".into()),
        codigo: Some("https://github.com/repasa-app/repasa".into()),
        // Sin menú Ayuda: los enlaces de Repasa están en «Acerca de», dentro de Para adultos.
        ayuda: false,
        // estado.py corre en la fila: un estado nunca se lee a medio guardar.
        estado_en_fila: true,
        // «Ajustes…» se llama «Para adultos…» (lo atiende la interfaz con menu({accion: "ajustes"}), nunca en la bienvenida).
        titulo_ajustes: Some(Some("Para adultos…".into())),
        menu,
        // Pieza «actualizaciones»: solo los Releases de este repo (Repasa-macOS.zip + .sha256). Nunca con un script en curso
        // (la IA armando un tema). La interfaz la muestra solo en «Para adultos».
        actualizaciones: actualizaciones::Actualizaciones::nuevas("repasa-app/repasa", "Repasa").ok().map(|a| Arc::new(a) as _),
        ..Default::default()
    };
    arrancar(tauri::generate_context!(), op, |host| {
        // Fotos o PDF arrastrados para un tema que no se guardó la vez anterior.
        let _ = std::fs::remove_dir_all(material::temporal(host));

        host.al_estado(|mut e, _| {
            // Si estado.py no pudo, la interfaz pinta lo que hay.
            for k in ["codigo", "texto", "valores"] {
                e.remove(k);
            }
            e.insert("carpeta".into(), json!(if cfg!(windows) { base().to_string_lossy().into_owned() } else { "~/Repasa".into() }));
            e.insert("capacidades".into(), json!({"copia": true, "camara": false}));
            e
        });

        // Es para niños: solo el sitio y el repositorio de Repasa. El host también manda aquí un https tocado en la ventana.
        host.registrar("abrirEnlace", |d, _, _| {
            let u = d["url"].as_str().unwrap_or("");
            if enlace_nuestro(u) {
                pieza::sistema::abrir_enlace(u);
            }
        });
        host.registrar("abrirCarpeta", |_, _, _| abrir_carpeta());
        // El motor JS (motor/*.js) para la copia cifrada: ui/escritorio.js lo importa desde «../motor/». Solo archivos .js de
        // motor/, junto a ui/ en los recursos de la app (app.json → empaquetado.carpetas).
        host.registrar_medios("motor", |ruta, h| {
            let ok = ruta.len() <= 40 && ruta.ends_with(".js") && ruta[..ruta.len() - 3].chars().all(|c| c.is_ascii_lowercase() || c == '_');
            ok.then(|| h.recursos.join("motor").join(ruta)).filter(|p| p.is_file())
        });
        material::registrar(host);
        copia::registrar(host);
    });
}

/// Hacia la interfaz (sin destino: la ventana principal).
pub fn responder(h: &Host, funcion: &str, datos: Value) {
    h.llamar(funcion, datos, None);
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn solo_enlaces_de_repasa() {
        assert!(enlace_nuestro("https://repasa-app.github.io/repasa/"));
        assert!(enlace_nuestro("https://github.com/repasa-app/repasa/issues/new"));
        for malo in [
            "http://repasa-app.github.io/repasa/",
            "https://repasa-app.github.io/otra/",
            "https://github.com/otra/repasa",
            "https://ana@github.com/repasa-app/repasa",
            "https://github.com:444/repasa-app/repasa",
            "https://ejemplo.cl/",
            "javascript:alert(1)",
        ] {
            assert!(!enlace_nuestro(malo), "{malo}");
        }
    }
}
