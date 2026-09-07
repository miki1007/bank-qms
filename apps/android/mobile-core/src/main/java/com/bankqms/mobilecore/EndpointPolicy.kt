package com.bankqms.mobilecore

import java.net.URI

object EndpointPolicy {
    fun normalize(raw: String, allowHttp: Boolean = true): String {
        val trimmed = raw.trim().trimEnd('/')
        val value = if (trimmed.contains("://")) trimmed else "${if (allowHttp) "http" else "https"}://$trimmed"
        val uri = runCatching { URI(value) }.getOrNull()
            ?: throw IllegalArgumentException("The Bank QMS API URL is invalid.")
        require(uri.scheme == "https" || (allowHttp && uri.scheme == "http")) {
            if (allowHttp) "The Bank QMS API must use HTTP or HTTPS." else "Release apps require an HTTPS Bank QMS API."
        }
        require(!uri.host.isNullOrBlank()) { "The Bank QMS API URL requires a host." }
        require(uri.userInfo == null) { "Do not put credentials in the Bank QMS API URL." }
        require(uri.query == null && uri.fragment == null) { "The Bank QMS API URL cannot contain a query or fragment." }
        return if (value.endsWith("/api/v1")) value else "$value/api/v1"
    }

    fun socketOrigin(apiUrl: String): String = normalize(apiUrl).removeSuffix("/api/v1")

    fun displayAddress(apiUrl: String): String {
        val uri = URI(normalize(apiUrl))
        return if (uri.port == -1) uri.host else "${uri.host}:${uri.port}"
    }
}
