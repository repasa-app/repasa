//! La copia cifrada: la misma del celular. El cifrado lo hace la página con el motor JS (ui/escritorio.js sobre motor/copia.js
//! y la pieza «cifrado»): el host lee y escribe los archivos de ~/Repasa y se los pide con `pedir` («escritorioArmar»,
//! «escritorioTraer»: `host.atender` en ui/app.js), como argumentos, nunca pegados en código. Lo que vuelve para escribir se
//! revisa otra vez (`permitida`). Lo mismo que hacía Copia.swift con callAsyncJavaScript.

use crate::pieza::host::{ComoGuardar, Host};
use crate::{b64, base, responder};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::time::Duration;

const MAXIMO: usize = 300 * 1024 * 1024;
/// Armar o juntar una copia grande (muchas fotos) en la página puede tardar.
const ESPERA: Duration = Duration::from_secs(600);
const NO_LISTA: &str = "La copia no está lista en esta app todavía. Prueba después de actualizar Repasa.";

/// Una ruta relativa a ~/Repasa que puede entrar o salir de una copia (igual que RUTA_PERMITIDA en motor/copia.js).
pub fn permitida(ruta: &str) -> bool {
    const PATRON: &str = r"^(perfiles\.json|pruebas\.json|progreso/[a-z0-9-]{1,80}\.json|temas/[a-z0-9-]{2,60}/tema\.json|temas/[a-z0-9-]{2,60}/material/material-[0-9]{1,3}\.(jpg|jpeg|png|webp|heic|gif|pdf))$";
    !ruta.contains("..") && regex::Regex::new(PATRON).map(|r| r.is_match(ruta)).unwrap_or(false)
}

fn nombres(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir)
        .map(|l| l.filter_map(|x| x.ok()).map(|x| x.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

/// Lo que entra en una copia, leído de `raiz`: JSON como texto y el material en base64 (o vacío si solo importa que existe).
pub fn archivos_de(raiz: &Path, con_material: bool) -> Map<String, Value> {
    let mut r = Map::new();
    let mut texto = |rel: &str| {
        if let Ok(s) = std::fs::read_to_string(raiz.join(rel)) {
            r.insert(rel.into(), json!({"texto": s}));
        }
    };
    texto("perfiles.json");
    texto("pruebas.json");
    for n in nombres(&raiz.join("progreso")).into_iter().filter(|n| n.ends_with(".json")) {
        texto(&format!("progreso/{n}"));
    }
    let temas = raiz.join("temas");
    let ids: Vec<String> = nombres(&temas);
    for id in &ids {
        texto(&format!("temas/{id}/tema.json"));
    }
    for id in &ids {
        for f in nombres(&temas.join(id).join("material")) {
            let rel = format!("temas/{id}/material/{f}");
            if !permitida(&rel) {
                continue;
            }
            let v = if con_material {
                match std::fs::read(raiz.join(&rel)) {
                    Ok(b) => b64::codificar(&b),
                    Err(_) => continue,
                }
            } else {
                String::new()
            };
            r.insert(rel, json!({"base64": v}));
        }
    }
    r.retain(|k, _| permitida(k));
    r
}

/// Escribe lo que juntó el motor, revisado otra vez: solo rutas permitidas, dentro de `raiz`, archivos 0600.
pub fn escribir(raiz: &Path, lista: &Value) -> usize {
    let mut n = 0;
    for x in lista.as_array().into_iter().flatten() {
        let Some(ruta) = x["ruta"].as_str().filter(|r| permitida(r)) else { continue };
        let datos = if let Some(t) = x["texto"].as_str() {
            Some(t.as_bytes().to_vec())
        } else {
            x["base64"].as_str().and_then(b64::decodificar).filter(|d| !d.is_empty())
        };
        let Some(datos) = datos else { continue };
        let destino = raiz.join(ruta);
        if let Some(arriba) = destino.parent() {
            if std::fs::create_dir_all(arriba).is_err() {
                continue;
            }
            crate::pieza::enchufe::solo_persona(arriba);
        }
        if crate::pieza::enchufe::escribir_atomico(&destino, &datos, 0o600).is_ok() {
            n += 1;
        }
    }
    n
}

pub fn registrar(host: &Host) {
    host.registrar("guardarCopia", |d, h, _| {
        h.ocupar();
        guardar(h, d["frase"].as_str().unwrap_or(""));
        h.soltar_ocupada();
    });
    host.registrar("traerCopia", |d, h, _| traer(h, d["frase"].as_str().unwrap_or("")));
}

/// Leer ~/Repasa va en la fila; cifrar, en la página. Mientras tanto la app está «ocupada» (no se cierra ni se actualiza a
/// medio armar).
fn guardar(h: &Host, frase: &str) {
    let archivos = h.fila.agregar(|| archivos_de(&base(), true));
    let Some(r) = h.pedir("escritorioArmar", json!({"archivos": archivos, "frase": frase}), ESPERA) else {
        return responder(h, "copiaLista", json!({"ok": false, "error": h.t(NO_LISTA)}));
    };
    let Some(texto) = r["texto"].as_str().filter(|_| r["ok"] == true) else {
        return responder(h, "copiaLista", json!({"ok": false, "error": r["error"].as_str().unwrap_or("No se pudo guardar la copia.")}));
    };
    let hoy: String = r["hoy"].as_str().unwrap_or("").chars().filter(|c| c.is_ascii_digit() || *c == '-').take(10).collect();
    // En iCloud Drive si la persona lo tiene (Mac). El archivo queda solo para la persona (0600).
    let icloud = crate::pieza::enchufe::casa().join("Library/Mobile Documents/com~apple~CloudDocs");
    let como = ComoGuardar {
        privado: Some(true),
        maximo: MAXIMO,
        desde: cfg!(target_os = "macos").then_some(icloud),
        titulo: Some("Dónde guardar la copia cifrada".into()),
    };
    let nombre = if hoy.is_empty() { "Repasa-copia".to_string() } else { format!("Repasa-copia-{hoy}") };
    match h.guardar_archivo_con(&nombre, "repasa", texto.as_bytes(), como) {
        Ok(_) => responder(h, "copiaLista", json!({"ok": true, "cantidad": r["cantidad"].as_i64().unwrap_or(0)})),
        Err("cancelado") => responder(h, "copiaLista", json!({"ok": false, "cancelado": true})),
        Err(_) => responder(h, "copiaLista", json!({"ok": false, "error": h.t("No se pudo guardar la copia.")})),
    }
}

fn traer(h: &Host, frase: &str) {
    let titulo = h.t("Elige la copia de Repasa (archivo .repasa)");
    let Some(origen) = h.dialogo_archivos(Some(titulo), &["repasa"], false, None).into_iter().next() else {
        return responder(h, "copiaTraida", json!({"ok": false, "cancelado": true}));
    };
    // Una copia con muchas fotos puede ser grande, pero no infinita (igual que el celular).
    let cabe = std::fs::metadata(&origen).map(|m| m.len() as usize <= MAXIMO).unwrap_or(false);
    let Some(texto) = cabe.then(|| std::fs::read_to_string(&origen).ok()).flatten() else {
        return responder(h, "copiaTraida", json!({"ok": false, "error": h.t("No se pudo abrir el archivo.")}));
    };
    h.ocupar();
    // Leer, juntar en la página y escribir van juntos en la fila: nada se guarda entremedio.
    let r = h.fila.agregar(|| {
        let raiz = base();
        let archivos = archivos_de(&raiz, false);
        let Some(r) = h.pedir("escritorioTraer", json!({"archivos": archivos, "texto": texto, "frase": frase}), ESPERA) else {
            return json!({"ok": false, "error": h.t(NO_LISTA)});
        };
        if r["ok"] != true {
            return json!({"ok": false, "error": r["error"].as_str().unwrap_or("No se pudo abrir el archivo.")});
        }
        escribir(&raiz, &r["escribir"]);
        json!({"ok": true, "resumen": r.get("resumen").cloned().unwrap_or(json!({}))})
    });
    h.soltar_ocupada();
    let ok = r["ok"] == true;
    responder(h, "copiaTraida", r);
    if ok {
        h.enviar_estado();
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn rutas_de_una_copia() {
        for bien in ["perfiles.json", "pruebas.json", "progreso/martina.json", "temas/fracciones-5b/tema.json", "temas/fracciones-5b/material/material-2.pdf"] {
            assert!(permitida(bien), "{bien}");
        }
        for mal in ["config.json", ".repasa/config.json", "progreso/../perfiles.json", "temas/x/tema.json", "temas/fracciones/material/foto.jpg",
            "/etc/passwd", "temas/fracciones/material/material-1.exe", "perfiles.json.bak"] {
            assert!(!permitida(mal), "{mal}");
        }
    }

    #[test]
    fn leer_y_escribir_solo_lo_permitido() {
        let raiz = std::env::temp_dir().join(format!("repasa-copia-{}", crate::pieza::enchufe::aleatorio_hex(4)));
        std::fs::create_dir_all(raiz.join("temas/fracciones/material")).unwrap();
        std::fs::create_dir_all(raiz.join("progreso")).unwrap();
        std::fs::write(raiz.join("perfiles.json"), "[]").unwrap();
        std::fs::write(raiz.join("progreso/martina.json"), "{}").unwrap();
        std::fs::write(raiz.join("temas/fracciones/tema.json"), "{}").unwrap();
        std::fs::write(raiz.join("temas/fracciones/material/material-1.jpg"), b"\xff\xd8").unwrap();
        std::fs::write(raiz.join("temas/fracciones/material/otra.jpg"), b"x").unwrap();
        let a = archivos_de(&raiz, true);
        let claves: Vec<&String> = a.keys().collect();
        assert_eq!(claves, ["perfiles.json", "progreso/martina.json", "temas/fracciones/material/material-1.jpg", "temas/fracciones/tema.json"]);
        assert_eq!(a["temas/fracciones/material/material-1.jpg"]["base64"], "/9g=");
        assert_eq!(archivos_de(&raiz, false)["temas/fracciones/material/material-1.jpg"]["base64"], "");

        let n = escribir(&raiz, &json!([
            {"ruta": "pruebas.json", "texto": "[1]"},
            {"ruta": "temas/nuevo-tema/material/material-1.png", "base64": "iVBO"},
            {"ruta": "../fuera.json", "texto": "x"},
            {"ruta": "config.json", "texto": "x"},
            {"ruta": "temas/nuevo-tema/tema.json", "base64": "no es"}
        ]));
        assert_eq!(n, 2);
        assert_eq!(std::fs::read_to_string(raiz.join("pruebas.json")).unwrap(), "[1]");
        assert!(raiz.join("temas/nuevo-tema/material/material-1.png").is_file());
        assert!(!raiz.join("config.json").exists() && !raiz.parent().unwrap().join("fuera.json").exists());
        std::fs::remove_dir_all(raiz).unwrap();
    }
}
