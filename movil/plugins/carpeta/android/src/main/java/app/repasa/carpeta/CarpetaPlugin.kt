package app.repasa.carpeta

import android.app.Activity
import android.content.Intent
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Guardar y traer la copia cifrada de Repasa con el selector de archivos del sistema (Storage Access Framework): la persona
 * elige dónde (Google Drive, Descargas…). Repasa no se conecta a ninguna nube: el sistema guarda el archivo donde la persona dijo.
 * La copia ya viene cifrada desde el motor JS (motor/copia.js); aquí solo se escribe y se lee el texto.
 *
 * JS: Carpeta.exportar({nombre, texto}) → {ok}      Carpeta.importar() → {texto}      Cancelar: error con código CANCELADO.
 */
@CapacitorPlugin(name = "Carpeta")
class CarpetaPlugin : Plugin() {
    private val maximo = 300L * 1024 * 1024

    @PluginMethod
    fun exportar(call: PluginCall) {
        if (call.getString("texto") == null) {
            call.reject("Falta la copia.", "COPIA")
            return
        }
        val nombre = (call.getString("nombre") ?: "Repasa-copia.repasa").filter { it.isLetterOrDigit() || it in "._-" }.ifEmpty { "Repasa-copia.repasa" }
        val intento = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_TITLE, nombre)
        }
        startActivityForResult(call, intento, "alExportar")
    }

    @ActivityCallback
    private fun alExportar(call: PluginCall?, resultado: ActivityResult) {
        if (call == null) return
        val uri = resultado.data?.data
        if (resultado.resultCode != Activity.RESULT_OK || uri == null) {
            call.reject("cancelado", "CANCELADO")
            return
        }
        try {
            val texto = call.getString("texto") ?: ""
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(texto.toByteArray(Charsets.UTF_8)) }
                ?: throw IllegalStateException("sin salida")
            val r = JSObject()
            r.put("ok", true)
            call.resolve(r)
        } catch (e: Exception) {
            call.reject("No se pudo guardar la copia.", "COPIA")
        }
    }

    @PluginMethod
    fun importar(call: PluginCall) {
        val intento = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        startActivityForResult(call, intento, "alImportar")
    }

    @ActivityCallback
    private fun alImportar(call: PluginCall?, resultado: ActivityResult) {
        if (call == null) return
        val uri = resultado.data?.data
        if (resultado.resultCode != Activity.RESULT_OK || uri == null) {
            call.reject("cancelado", "CANCELADO")
            return
        }
        Thread {
            try {
                val tamano = context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else 0L
                } ?: 0L
                if (tamano > maximo) throw IllegalStateException("muy grande")
                val texto = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                    ?: throw IllegalStateException("sin entrada")
                val r = JSObject()
                r.put("texto", texto)
                call.resolve(r)
            } catch (e: Exception) {
                call.reject("No se pudo abrir el archivo.", "ARCHIVO")
            }
        }.start()
    }
}
