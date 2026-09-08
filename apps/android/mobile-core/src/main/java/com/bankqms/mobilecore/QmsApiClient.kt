package com.bankqms.mobilecore

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

enum class SessionAudience(val refreshPath: String, val logoutPath: String) {
    CUSTOMER("/customer-auth/refresh", "/customer-auth/logout"),
    STAFF("/auth/refresh", "/auth/logout"),
}

class ApiException(
    val status: Int,
    val code: String,
    override val message: String,
) : IOException(message)

class QmsApiClient(
    context: Context,
    apiUrl: String,
    private val audience: SessionAudience,
    namespace: String,
) {
    private val baseUrl = EndpointPolicy.normalize(apiUrl)
    private val store = SecureSessionStore(context.applicationContext, namespace)
    private val refreshMutex = Mutex()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(18, TimeUnit.SECONDS)
        .writeTimeout(18, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile
    private var tokens: SessionTokens? = store.read()

    val hasSession: Boolean get() = tokens != null
    val socketOrigin: String get() = EndpointPolicy.socketOrigin(baseUrl)
    fun currentAccessToken(): String? = tokens?.accessToken

    suspend fun authenticate(path: String, body: JSONObject): JSONObject {
        val payload = execute("POST", path, body, authenticated = false)
        val result = payload.asObject()
        saveTokens(result)
        return result
    }

    suspend fun get(path: String, authenticated: Boolean = true): Any? =
        request("GET", path, null, authenticated)

    suspend fun post(
        path: String,
        body: JSONObject? = null,
        idempotencyKey: String? = null,
        authenticated: Boolean = true,
    ): Any? = request("POST", path, body, authenticated, idempotencyKey)

    suspend fun logout() {
        val refresh = tokens?.refreshToken
        runCatching {
            execute(
                "POST",
                audience.logoutPath,
                null,
                authenticated = true,
                refreshToken = refresh,
            )
        }
        tokens = null
        store.clear()
    }

    fun clearSession() {
        tokens = null
        store.clear()
    }

    private suspend fun request(
        method: String,
        path: String,
        body: JSONObject?,
        authenticated: Boolean,
        idempotencyKey: String? = null,
    ): Any? {
        return try {
            execute(method, path, body, authenticated, idempotencyKey)
        } catch (error: ApiException) {
            if (error.status != 401 || !authenticated || tokens?.refreshToken.isNullOrBlank()) throw error
            refreshMutex.withLock {
                val tokenUsed = tokens?.accessToken
                if (tokenUsed == null || tokenUsed == tokens?.accessToken) refreshSession()
            }
            execute(method, path, body, true, idempotencyKey)
        }
    }

    private suspend fun refreshSession() {
        val refresh = tokens?.refreshToken ?: throw ApiException(401, "AUTHENTICATION_FAILED", "Please sign in again.")
        try {
            val payload = execute(
                "POST",
                audience.refreshPath,
                null,
                authenticated = false,
                refreshToken = refresh,
            ).asObject()
            saveTokens(payload)
        } catch (error: Exception) {
            clearSession()
            throw error
        }
    }

    private fun saveTokens(payload: JSONObject) {
        val access = payload.optString("accessToken")
        val refresh = payload.optString("refreshToken")
        if (access.isBlank() || refresh.isBlank()) {
            throw ApiException(500, "MOBILE_SESSION_UNAVAILABLE", "The server did not provide a secure mobile session.")
        }
        tokens = SessionTokens(access, refresh)
        store.write(tokens!!)
    }

    private suspend fun execute(
        method: String,
        path: String,
        body: JSONObject?,
        authenticated: Boolean,
        idempotencyKey: String? = null,
        refreshToken: String? = null,
    ): Any? = withContext(Dispatchers.IO) {
        val requestBody = body?.toString()?.toRequestBody(jsonMediaType)
        val builder = Request.Builder()
            .url(baseUrl + path)
            .header("Accept", "application/json")
            .header("X-Client-Platform", "android")
            .header("X-Request-Id", UUID.randomUUID().toString())
        if (authenticated) tokens?.accessToken?.let { builder.header("Authorization", "Bearer $it") }
        refreshToken?.let { builder.header("X-Refresh-Token", it) }
        idempotencyKey?.let { builder.header("Idempotency-Key", it) }
        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post(requestBody ?: ByteArray(0).toRequestBody(null))
            else -> error("Unsupported method: $method")
        }
        val response = try {
            client.newCall(builder.build()).execute()
        } catch (error: IOException) {
            throw ApiException(0, "NETWORK_ERROR", "Cannot reach the Bank QMS server. Check the connection and server URL.")
        }
        response.use {
            val text = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val error = runCatching { JSONObject(text).optJSONObject("error") }.getOrNull()
                throw ApiException(
                    it.code,
                    error?.optString("code").orEmpty().ifBlank { "REQUEST_FAILED" },
                    error?.optString("message").orEmpty().ifBlank { "The request could not be completed." },
                )
            }
            if (text.isBlank()) return@withContext null
            val trimmed = text.trimStart()
            when {
                trimmed.startsWith("{") -> JSONObject(text)
                trimmed.startsWith("[") -> JSONArray(text)
                else -> text
            }
        }
    }
}

fun Any?.asObject(): JSONObject = this as? JSONObject
    ?: throw ApiException(500, "INVALID_RESPONSE", "The server returned an invalid response.")

fun Any?.asArray(): JSONArray = this as? JSONArray
    ?: throw ApiException(500, "INVALID_RESPONSE", "The server returned an invalid response.")

