//! El material de un tema (fotos del cuaderno o un PDF): elegirlo o arrastrarlo, crear el tema con la IA y guardarlo con su
//! material. Crear y guardar un tema solo aceptan archivos que la persona eligió en esta sesión (el diálogo del sistema o
//! arrastrados), nunca una ruta cualquiera que llegue desde la página. Lo mismo que hacía Material.swift.

use crate::pieza::enchufe as e;
use crate::pieza::host::Host;
use crate::pieza::procesador::Opciones;
use crate::{b64, base, responder};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

pub const EXTENSIONES: [&str; 7] = ["jpg", "jpeg", "png", "webp", "heic", "gif", "pdf"];
const MAXIMO: u64 = 25 * 1024 * 1024;
/// crear_tema.py le da a la IA hasta 900 s (ia.preguntar): el host lo corta un poco después.
const LIMITE_CREAR: u64 = 960;

/// Lo que la persona eligió (diálogo o arrastrar) en esta sesión.
static ELEGIDOS: Mutex<Option<HashSet<String>>> = Mutex::new(None);
static SOLTADOS: AtomicUsize = AtomicUsize::new(0);

/// Fotos o PDF arrastrados a «Nuevo tema» mientras el tema no se guarda (se borran al abrir la app).
pub fn temporal(h: &Host) -> PathBuf {
    h.datos.join("temporal")
}

fn anotar(ruta: &Path) {
    if let Ok(mut g) = ELEGIDOS.lock() {
        g.get_or_insert_with(HashSet::new).insert(ruta.to_string_lossy().into_owned());
    }
}

/// Solo rutas que la persona eligió en esta sesión y que siguen ahí.
fn elegidos_de(v: &Value) -> Vec<String> {
    let g = ELEGIDOS.lock().ok();
    let lista = g.as_ref().and_then(|g| g.as_ref());
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .filter(|r| lista.is_some_and(|l| l.contains(*r)) && Path::new(r).is_file())
                .take(20)
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

fn extension(nombre: &str) -> String {
    Path::new(nombre).extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default()
}

fn cumple(texto: &str, patron: &str) -> bool {
    regex::Regex::new(patron).map(|r| r.is_match(texto)).unwrap_or(false)
}

/// <base>material/<tema>/material-N.<ext>: las fotos del material de un tema guardado (ui/app.js, rutaMaterial). Solo
/// archivos material-N.<ext> de ~/Repasa/temas/<tema>/material/; cualquier otra cosa no existe.
pub fn archivo(ruta: &str) -> Option<PathBuf> {
    let partes: Vec<&str> = ruta.split('/').collect();
    if partes.len() != 2 || !cumple(partes[0], r"^[a-z0-9-]{2,60}$") || !cumple(partes[1], r"^material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf)$") {
        return None;
    }
    Some(base().join("temas").join(partes[0]).join("material").join(partes[1]))
}

pub fn registrar(host: &Host) {
    host.registrar_medios("material", |ruta, _| archivo(ruta));
    host.registrar("elegirMaterial", |_, h, _| elegir(h));
    host.registrar("soltarMaterial", |d, h, _| soltar(h, d["nombre"].as_str().unwrap_or(""), d["base64"].as_str().unwrap_or("")));
    host.registrar("crearTema", |d, h, _| crear(h, &d));
    host.registrar("guardarTema", |d, h, _| guardar(h, &d["tema"], elegidos_de(&d["archivos"])));
}

fn elegir(h: &Host) {
    let titulo = h.t("Elige las fotos del cuaderno o la guía, o un PDF");
    let lista: Vec<Value> = h
        .dialogo_archivos(Some(titulo), &EXTENSIONES, true, None)
        .into_iter()
        .filter(|u| EXTENSIONES.contains(&extension(&u.to_string_lossy()).as_str()))
        .filter(|u| std::fs::metadata(u).map(|m| m.len() <= MAXIMO).unwrap_or(false))
        .take(20)
        .map(|u| {
            anotar(&u);
            json!({"ruta": u.to_string_lossy(), "nombre": u.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()})
        })
        .collect();
    responder(h, "materialElegido", Value::Array(lista));
}

/// Una foto o PDF arrastrado a «Nuevo tema»: la interfaz manda el contenido (no hay ruta) y queda en .repasa/temporal/.
fn soltar(h: &Host, nombre: &str, base64: &str) {
    let ext = extension(nombre);
    if !EXTENSIONES.contains(&ext.as_str()) || base64.len() as u64 > MAXIMO / 3 * 4 + 4 {
        return;
    }
    let Some(datos) = b64::decodificar(base64).filter(|d| !d.is_empty() && d.len() as u64 <= MAXIMO) else { return };
    let n = SOLTADOS.fetch_add(1, Ordering::SeqCst) + 1;
    let destino = temporal(h).join(format!("soltado-{n}-{}.{ext}", e::aleatorio_hex(4)));
    if e::escribir_atomico(&destino, &datos, 0o600).is_err() {
        return;
    }
    anotar(&destino);
    let corto: String = Path::new(nombre).file_name().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default().chars().take(80).collect();
    responder(h, "materialElegido", json!([{"ruta": destino.to_string_lossy(), "nombre": corto}]));
}

/// `crear_tema.py pedido <entrada>`: lo que escribió la persona va en el archivo de entrada, nunca como argumento. Fuera de la
/// fila (espera a la IA); mientras corre, el host no instala una versión nueva (cuenta como «algo en curso»).
fn crear(h: &Host, d: &Value) {
    let ramo: String = d["ramo"].as_str().unwrap_or("auto").chars().filter(|c| c.is_ascii_lowercase()).take(20).collect();
    let curso: String = d["curso"].as_str().unwrap_or("").chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit()).take(4).collect();
    let texto: String = d["texto"].as_str().unwrap_or("").chars().take(20000).collect();
    let pedido = json!({"curso": curso, "ramo": if ramo.is_empty() { "auto".into() } else { ramo }, "texto": texto, "archivos": elegidos_de(&d["archivos"])});
    let r = h.procesador.con_entrada("crear_tema.py", &["pedido".into()], pedido, Opciones { limite: Some(LIMITE_CREAR), ..Default::default() });
    responder(h, "temaCreado", r);
}

/// `crear_tema.py guardar <tema.json> [archivos…]`, en la fila del host (nunca a la vez que otro guardado o que leer el estado).
fn guardar(h: &Host, tema: &Value, archivos: Vec<String>) {
    let no_pude = || json!({"ok": false, "error": h.t("No pude terminar. Intenta de nuevo.")});
    if !tema.is_object() {
        return responder(h, "temaGuardado", no_pude());
    }
    let entrada = std::env::temp_dir().join(format!("repasa-tema-{}.json", e::aleatorio_hex(8)));
    let Ok(bytes) = serde_json::to_vec(tema) else { return responder(h, "temaGuardado", no_pude()) };
    if e::escribir_atomico(&entrada, &bytes, 0o600).is_err() {
        return responder(h, "temaGuardado", no_pude());
    }
    let temporal = temporal(h);
    let r = h.fila.agregar(|| {
        let mut args = vec!["guardar".to_string(), entrada.to_string_lossy().into_owned()];
        args.extend(archivos.iter().cloned());
        let r = h.procesador.correr_json("crear_tema.py", &args, Opciones { limite: Some(120), ..Default::default() });
        if r["ok"] == true {
            // Lo arrastrado ya quedó copiado en la carpeta del tema.
            for a in archivos.iter().filter(|a| Path::new(a).starts_with(&temporal)) {
                let _ = std::fs::remove_file(a);
            }
        }
        r
    });
    let _ = std::fs::remove_file(&entrada);
    responder(h, "temaGuardado", r);
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn medios_solo_material_de_un_tema() {
        assert!(archivo("fracciones-5b/material-1.jpg").unwrap().ends_with("Repasa/temas/fracciones-5b/material/material-1.jpg"));
        for malo in ["../material-1.jpg", "fracciones/../../x/material-1.jpg", "fracciones/material-1.exe", "fracciones/tema.json", "a/material-1.jpg",
            "fracciones/sub/material-1.jpg", "Fracciones/material-1.jpg"] {
            assert!(archivo(malo).is_none(), "{malo}");
        }
    }

    #[test]
    fn solo_lo_elegido_en_esta_sesion() {
        let dir = std::env::temp_dir().join(format!("repasa-prueba-{}", e::aleatorio_hex(4)));
        std::fs::create_dir_all(&dir).unwrap();
        let elegido = dir.join("foto.jpg");
        let otro = dir.join("otra.jpg");
        std::fs::write(&elegido, b"x").unwrap();
        std::fs::write(&otro, b"x").unwrap();
        anotar(&elegido);
        let r = elegidos_de(&json!([elegido.to_string_lossy(), otro.to_string_lossy(), "/etc/passwd", 3]));
        assert_eq!(r, vec![elegido.to_string_lossy().into_owned()]);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
