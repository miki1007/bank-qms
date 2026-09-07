package com.bankqms.mobilecore

import android.content.Context
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Router
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

class ServerEndpointStore(
    context: Context,
    namespace: String,
) {
    private val preferences = context.applicationContext.getSharedPreferences(
        "bank_qms_${namespace}_server",
        Context.MODE_PRIVATE,
    )

    fun confirmedUrl(allowHttp: Boolean): String? {
        if (!preferences.getBoolean(CONFIRMED_KEY, false)) return null
        val stored = preferences.getString(URL_KEY, null) ?: return null
        val normalized = runCatching { EndpointPolicy.normalize(stored, allowHttp) }.getOrNull()
        if (normalized == null) requireSetup()
        return normalized
    }

    fun draftUrl(fallback: String): String = preferences.getString(URL_KEY, fallback) ?: fallback

    fun confirm(raw: String, allowHttp: Boolean): String {
        val normalized = EndpointPolicy.normalize(raw, allowHttp)
        preferences.edit()
            .putString(URL_KEY, normalized)
            .putBoolean(CONFIRMED_KEY, true)
            .apply()
        return normalized
    }

    fun requireSetup() {
        preferences.edit().putBoolean(CONFIRMED_KEY, false).apply()
    }

    private companion object {
        const val URL_KEY = "api_url"
        const val CONFIRMED_KEY = "confirmed"
    }
}

object ServerConnectionVerifier {
    private val client = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .writeTimeout(6, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun verify(raw: String, allowHttp: Boolean): String = withContext(Dispatchers.IO) {
        val normalized = EndpointPolicy.normalize(raw, allowHttp)
        val request = Request.Builder()
            .url("${EndpointPolicy.socketOrigin(normalized)}/health/ready")
            .header("Accept", "application/json")
            .get()
            .build()
        val response = try {
            client.newCall(request).execute()
        } catch (_: IOException) {
            throw IllegalStateException(
                "Cannot reach Bank QMS. Start the API, use the computer's IPv4 address, keep both devices on the same Wi-Fi, and allow port 3000.",
            )
        }
        response.use {
            if (!it.isSuccessful) {
                throw IllegalStateException(
                    "The server responded, but Bank QMS is not ready (HTTP ${it.code}). Check PostgreSQL and the API.",
                )
            }
        }
        normalized
    }
}

@Composable
fun ServerSetupScreen(
    productLabel: String,
    accent: Color,
    initialUrl: String,
    allowHttp: Boolean,
    onConnected: (String) -> Unit,
) {
    var url by remember { mutableStateOf(initialUrl) }
    var checking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    BankQmsTheme(accent) {
        Box(Modifier.fillMaxSize()) {
            AnimatedBackdrop(accent)
            Column(
                Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 30.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(70.dp)
                        .clip(RoundedCornerShape(22.dp))
                        .background(Brush.linearGradient(listOf(accent, accent.copy(alpha = .55f)))),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Rounded.Router, null, tint = Color(0xFF061410), modifier = Modifier.size(38.dp))
                }
                Text(
                    "Connect this phone",
                    style = MaterialTheme.typography.headlineLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 24.dp),
                )
                Text(
                    "$productLabel connects directly to your secure Bank QMS backend. We verify the server before opening the app.",
                    color = QmsMuted,
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier.padding(top = 10.dp, bottom = 26.dp),
                )

                Card(
                    shape = QmsCardShape,
                    colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(alpha = .94f)),
                ) {
                    Column(Modifier.padding(20.dp)) {
                        Text("BANK QMS SERVER", color = accent, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp)
                        OutlinedTextField(
                            value = url,
                            onValueChange = {
                                url = it
                                error = null
                            },
                            label = { Text("API address") },
                            leadingIcon = { Icon(Icons.Rounded.Dns, null) },
                            supportingText = {
                                Text(
                                    if (allowHttp) {
                                        "Phone example: http://192.168.1.20:3000/api/v1"
                                    } else {
                                        "Production example: https://api.your-domain.com/api/v1"
                                    },
                                )
                            },
                            singleLine = true,
                            enabled = !checking,
                            shape = RoundedCornerShape(18.dp),
                            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                        )
                        if (allowHttp) {
                            OutlinedButton(
                                onClick = {
                                    url = "http://10.0.2.2:3000/api/v1"
                                    error = null
                                },
                                enabled = !checking,
                                border = BorderStroke(1.dp, accent.copy(alpha = .45f)),
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                            ) {
                                Icon(Icons.Rounded.Computer, null, modifier = Modifier.size(18.dp))
                                Text("Use Android emulator", modifier = Modifier.padding(start = 8.dp))
                            }
                        }
                        AnimatedVisibility(visible = error != null, enter = fadeIn() + scaleIn(), exit = fadeOut()) {
                            Card(
                                colors = CardDefaults.cardColors(QmsDanger.copy(alpha = .13f)),
                                shape = RoundedCornerShape(16.dp),
                                modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                            ) {
                                Text(
                                    error.orEmpty(),
                                    color = QmsDanger,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(14.dp),
                                )
                            }
                        }
                        Button(
                            onClick = {
                                checking = true
                                error = null
                                scope.launch {
                                    try {
                                        onConnected(ServerConnectionVerifier.verify(url, allowHttp))
                                    } catch (failure: Exception) {
                                        error = failure.message ?: "The Bank QMS server could not be verified."
                                        checking = false
                                    }
                                }
                            },
                            enabled = url.isNotBlank() && !checking,
                            shape = RoundedCornerShape(18.dp),
                            modifier = Modifier.fillMaxWidth().height(62.dp).padding(top = 14.dp),
                        ) {
                            AnimatedContent(
                                targetState = checking,
                                transitionSpec = { fadeIn() togetherWith fadeOut() },
                                label = "server-check",
                            ) { active ->
                                if (active) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                                        Text("Checking server…", modifier = Modifier.padding(start = 10.dp))
                                    }
                                } else {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("Connect and continue")
                                        Icon(
                                            Icons.AutoMirrored.Rounded.ArrowForward,
                                            null,
                                            modifier = Modifier.padding(start = 8.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                Column(
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
                ) {
                    SetupHint(Icons.Rounded.PhoneAndroid, "Real phone", "Replace 10.0.2.2 with your computer's IPv4 address.")
                    SetupHint(Icons.Rounded.Wifi, "Same network", "Keep the phone and computer on the same private Wi-Fi.")
                    SetupHint(Icons.Rounded.CheckCircle, "Backend ready", "Start PostgreSQL and pnpm dev before connecting.")
                    SetupHint(
                        Icons.Rounded.Security,
                        if (allowHttp) "Development build" else "HTTPS protected",
                        if (allowHttp) "HTTP is accepted only in this private debug build." else "Release builds accept HTTPS only.",
                    )
                }
            }
        }
    }
}

@Composable
private fun SetupHint(icon: ImageVector, title: String, detail: String) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(QmsSurfaceHigh.copy(alpha = .72f))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = .14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(detail, color = QmsMuted, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}
