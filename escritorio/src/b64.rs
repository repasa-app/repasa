//! Base64 estándar (con «=»), sin dependencias: lo que manda la interfaz al soltar una foto y el material de la copia cifrada.

const LETRAS: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn codificar(datos: &[u8]) -> String {
    let mut s = String::with_capacity(datos.len().div_ceil(3) * 4);
    for trozo in datos.chunks(3) {
        let b = [trozo[0], *trozo.get(1).unwrap_or(&0), *trozo.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for (i, corrimiento) in [18, 12, 6, 0].into_iter().enumerate() {
            if i <= trozo.len() {
                s.push(LETRAS[((n >> corrimiento) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

/// None si no es base64 estándar.
pub fn decodificar(s: &str) -> Option<Vec<u8>> {
    let valor = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let b = s.trim().as_bytes();
    if !b.len().is_multiple_of(4) {
        return None;
    }
    let mut r = Vec::with_capacity(b.len() / 4 * 3);
    for (k, trozo) in b.chunks(4).enumerate() {
        let ultimo = k == b.len() / 4 - 1;
        let relleno = trozo.iter().rev().take_while(|c| **c == b'=').count();
        if relleno > 2 || (relleno > 0 && !ultimo) {
            return None;
        }
        let mut n = 0u32;
        for c in &trozo[..4 - relleno] {
            n = (n << 6) | valor(*c)?;
        }
        n <<= 6 * relleno as u32;
        let bytes = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
        r.extend_from_slice(&bytes[..3 - relleno]);
    }
    Some(r)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn ida_y_vuelta() {
        for (texto, b64) in [("", ""), ("f", "Zg=="), ("fo", "Zm8="), ("foo", "Zm9v"), ("foob", "Zm9vYg=="), ("Ñandú", "w5FhbmTDug==")] {
            assert_eq!(codificar(texto.as_bytes()), b64);
            assert_eq!(decodificar(b64).unwrap(), texto.as_bytes());
        }
        let todos: Vec<u8> = (0..=255).collect();
        assert_eq!(decodificar(&codificar(&todos)).unwrap(), todos);
    }

    #[test]
    fn rechaza_lo_que_no_es() {
        for malo in ["Zg", "Z===", "Zg==Zg==", "Zm9*", "Zm 9v"] {
            assert!(decodificar(malo).is_none(), "{malo}");
        }
    }
}
