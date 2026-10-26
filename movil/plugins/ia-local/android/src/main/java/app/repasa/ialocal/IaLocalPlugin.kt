package app.repasa.ialocal

import android.net.Uri
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

/**
 * La IA del propio teléfono para Repasa (Android). Texto: Gemini Nano con ML Kit GenAI (Prompt API), en los teléfonos que lo
 * traen (AICore). Fotos del cuaderno: ML Kit Text Recognition con el modelo incluido en la app. Todo corre en el teléfono: sin
 * cuentas ni llaves. Lo que responde el modelo lo valida el motor JS (motor/crear_tema.js) antes de usarlo.
 *
 * JS: IaLocal.disponible() → {texto, ocr, motivo, plataforma, modelo, contexto}
 *     IaLocal.preparar()   → {estado}   si Gemini Nano se puede bajar, AICore (el sistema) lo baja
 *     IaLocal.leerTexto({ruta})  → {texto}   ruta: file:// dentro de la app
 *     IaLocal.preguntar({prompt, maxTokens, temperatura}) → {texto}
 *     Errores con código: NO_DISPONIBLE, CONTEXTO, FOTO, PEDIDO, IA.
 */
@CapacitorPlugin(name = "IaLocal")
class IaLocalPlugin : Plugin() {
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val modelo: GenerativeModel by lazy { Generation.getClient() }

    @PluginMethod
    fun disponible(call: PluginCall) {
        alcance.launch {
            val (lista, motivo) = estado()
            val contexto = if (lista) runCatching { modelo.getTokenLimit() }.getOrDefault(4000) else 4000
            val r = JSObject()
            r.put("plataforma", "android")
            r.put("modelo", "gemini-nano")
            r.put("ocr", true)
            r.put("texto", lista)
            r.put("motivo", motivo)
            r.put("contexto", contexto)
            call.resolve(r)
        }
    }

    private suspend fun estado(): Pair<Boolean, String> = try {
        when (modelo.checkStatus()) {
            FeatureStatus.AVAILABLE -> Pair(true, "")
            FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING -> Pair(false, "descargando")
            else -> Pair(false, "dispositivo")
        }
    } catch (e: Exception) {
        Pair(false, "dispositivo")
    }

    @PluginMethod
    fun preparar(call: PluginCall) {
        alcance.launch {
            val status = runCatching { modelo.checkStatus() }.getOrDefault(FeatureStatus.UNAVAILABLE)
            if (status == FeatureStatus.DOWNLOADABLE) {
                // La descarga la hace AICore (el sistema), no Repasa; aquí solo se pide y se sigue sin esperar.
                alcance.launch { runCatching { modelo.download().collect { } } }
            }
            val r = JSObject()
            r.put("estado", status)
            call.resolve(r)
        }
    }

    @PluginMethod
    fun preguntar(call: PluginCall) {
        val prompt = call.getString("prompt")
        if (prompt.isNullOrEmpty()) {
            call.reject("Falta el pedido.", "PEDIDO")
            return
        }
        val maxTokens = (call.getInt("maxTokens") ?: 800).coerceIn(1, 3000)
        val temperatura = (call.getDouble("temperatura") ?: 0.3).coerceIn(0.0, 1.0).toFloat()
        alcance.launch {
            try {
                if (modelo.checkStatus() != FeatureStatus.AVAILABLE) {
                    call.reject("La IA de este teléfono no está disponible.", "NO_DISPONIBLE")
                    return@launch
                }
                val respuesta = modelo.generateContent(generateContentRequest(TextPart(prompt)) {
                    temperature = temperatura
                    maxOutputTokens = maxTokens
                })
                val r = JSObject()
                r.put("texto", respuesta.candidates.firstOrNull()?.text ?: "")
                call.resolve(r)
            } catch (e: GenAiException) {
                val codigo = when (e.errorCode) {
                    GenAiException.ErrorCode.REQUEST_TOO_LARGE -> "CONTEXTO"
                    GenAiException.ErrorCode.NOT_AVAILABLE, GenAiException.ErrorCode.NOT_SUPPORTED -> "NO_DISPONIBLE"
                    else -> "IA"
                }
                call.reject(e.message ?: "La IA del teléfono no pudo responder.", codigo)
            } catch (e: Exception) {
                call.reject(e.message ?: "La IA del teléfono no pudo responder.", "IA")
            }
        }
    }

    @PluginMethod
    fun leerTexto(call: PluginCall) {
        val archivo = archivoDeLaApp(call.getString("ruta"))
        if (archivo == null) {
            call.reject("Falta la foto.", "FOTO")
            return
        }
        val imagen = try {
            InputImage.fromFilePath(context, Uri.fromFile(archivo)) // respeta la rotación de la foto (EXIF)
        } catch (e: Exception) {
            call.reject("No pude abrir la foto.", "FOTO")
            return
        }
        val lector = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        lector.process(imagen)
            .addOnSuccessListener { resultado ->
                val r = JSObject()
                r.put("texto", resultado.text)
                call.resolve(r)
                lector.close()
            }
            .addOnFailureListener {
                call.reject("No pude leer la foto.", "FOTO")
                lector.close()
            }
    }

    /** Solo archivos dentro de la app (las fotos que la app misma guardó): nada de rutas a otras partes del teléfono. */
    private fun archivoDeLaApp(ruta: String?): File? {
        if (ruta.isNullOrEmpty()) return null
        val camino = if (ruta.startsWith("file://")) Uri.parse(ruta).path else ruta
        val archivo = File(camino ?: return null).canonicalFile
        val casa = context.filesDir.canonicalFile.parentFile ?: return null
        return if (archivo.path.startsWith(casa.path + File.separator) && archivo.isFile) archivo else null
    }

    override fun handleOnDestroy() {
        alcance.cancel()
        super.handleOnDestroy()
    }
}
