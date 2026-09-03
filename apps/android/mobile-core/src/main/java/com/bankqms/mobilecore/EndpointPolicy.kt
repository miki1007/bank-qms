package com.bankqms.mobilecore

import java.net.URI

object EndpointPolicy {
    fun normalize(raw: String): String {
        val value = raw.trim().trimEnd('/')
        val uri = runCatching { URI(value) }.getOrNull()
            ?: throw IllegalArgumentException("The Bank QMS API URL is invalid.")
        require(uri.scheme == "https" || uri.scheme == "http") {
            "The Bank QMS API must use HTTP or HTTPS."
        }
        require(!uri.host.isNullOrBlank()) { "The Bank QMS API URL requires a host." }
        return if (value.endsWith("/api/v1")) value else "$value/api/v1"
    }

    fun socketOrigin(apiUrl: String): String = normalize(apiUrl).removeSuffix("/api/v1")
}
