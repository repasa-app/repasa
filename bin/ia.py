"""La IA de la familia (Claude Code, Codex o Gemini), con la cuenta de un adulto. Solo biblioteca estándar.

Repasa nunca llama a una IA con una cuenta propia: arma el comando del CLI que ya está instalado. La IA corre en una carpeta
temporal y en modo solo lectura, y ve únicamente el texto que le mandamos y COPIAS del material (fotos del cuaderno, PDF).
"""
import os
import shutil
import subprocess
import tempfile

import datos

HOME = os.path.expanduser("~")
IMAGENES = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif")


def _preparar_path():
    """La app no hereda el PATH de la terminal: agrega donde suelen quedar los CLI de IA (Mac, Linux y Windows)."""
    extra = [os.path.join(HOME, ".local", "bin"), os.path.join(HOME, ".claude", "local"), os.path.join(HOME, ".npm-global", "bin"),
             os.path.join(HOME, ".volta", "bin"), os.path.join(HOME, ".bun", "bin"), os.path.join(HOME, ".codex", "bin"),
             "/opt/homebrew/bin", "/usr/local/bin"]
    nvm = os.path.join(HOME, ".nvm", "versions", "node")
    if os.path.isdir(nvm):
        extra += [os.path.join(nvm, v, "bin") for v in sorted(os.listdir(nvm), reverse=True)]
    if os.name == "nt":
        extra += [os.path.join(os.environ.get("APPDATA", ""), "npm"), os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "claude")]
    os.environ["PATH"] = os.pathsep.join([os.environ.get("PATH", "")] + [d for d in extra if os.path.isdir(d)])


_preparar_path()

IAS = {"claude": (("claude",), "Claude"), "codex": (("codex",), "ChatGPT (Codex)"), "gemini": (("agy", "gemini"), "Gemini")}


def elegida():
    ia = datos.config().get("ia")
    return ia if ia in IAS else "claude"


def nombre():
    return IAS[elegida()][1]


def ejecutar_ia(prompt, timeout=600, archivos=()):
    """Le pasa el prompt (y copias de los archivos) a la IA y devuelve un CompletedProcess (stdout = respuesta)."""
    ia = elegida()
    comando = next((r for r in map(shutil.which, IAS[ia][0]) if r), IAS[ia][0][0])
    with tempfile.TemporaryDirectory(prefix="repasa-ia-") as tmp:
        copias = []
        for k, a in enumerate(archivos):
            destino = os.path.join(tmp, f"material-{k + 1}{os.path.splitext(a)[1].lower()}")
            try:
                shutil.copy2(a, destino)
                copias.append(destino)
            except OSError:
                pass
        if ia == "codex":
            salida = os.path.join(tmp, "respuesta.txt")
            cmd = [comando, "exec", "--skip-git-repo-check", "-s", "read-only", "-C", tmp, "-o", salida]
            for c in copias:
                if c.endswith(IMAGENES):
                    cmd += ["-i", c]
            cmd.append("-")
            r = subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp)
            texto = open(salida, encoding="utf-8").read() if os.path.exists(salida) else ""
            return subprocess.CompletedProcess(cmd, r.returncode, texto, r.stderr)
        es_agy = os.path.basename(comando).lower().split(".")[0] in ("agy", "antigravity")
        if ia == "gemini" and es_agy:
            with open(os.path.join(tmp, "instrucciones.md"), "w", encoding="utf-8") as f:
                f.write(prompt)
            pedido = ("Lee el archivo instrucciones.md de esta carpeta (y el material que menciona) y haz exactamente lo que pide. "
                      "Entrega solo el resultado pedido, sin comentarios. No modifiques ni crees archivos.")
            cmd = [comando, "--output-format", "text", "--sandbox", "--add-dir", tmp, "-p", pedido]
            return subprocess.run(cmd, stdin=subprocess.DEVNULL, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp)
        if ia == "gemini":
            cmd = [comando, "-p", "Responde a las instrucciones de arriba. Entrega solo el resultado pedido.", "-o", "text"]
        else:
            # Sin servidores MCP de la persona; con material, solo puede leer (las copias en la carpeta temporal); sin material, nada.
            cmd = [comando, "-p", "--output-format", "text", "--strict-mcp-config"]
            cmd += ["--allowedTools", "Read"] if copias else ["--disallowedTools", "*"]
        return subprocess.run(cmd, input=prompt, text=True, encoding="utf-8", capture_output=True, timeout=timeout, cwd=tmp)


def preguntar(prompt, timeout=600, archivos=()):
    """Devuelve (texto, error). El error es un mensaje para la persona, con el nombre de su IA."""
    try:
        r = ejecutar_ia(prompt, timeout, archivos)
    except FileNotFoundError:
        return "", f"No encontré {nombre()} en este computador. Revisa en Ajustes → Tu IA."
    except subprocess.TimeoutExpired:
        return "", f"{nombre()} se demoró demasiado en responder. Inténtalo de nuevo."
    if r.returncode != 0 or not (r.stdout or "").strip():
        detalle = (r.stderr or "").strip().splitlines()[-1:] or [""]
        return "", f"{nombre()} no respondió. {detalle[0]}".strip()
    return r.stdout, ""
