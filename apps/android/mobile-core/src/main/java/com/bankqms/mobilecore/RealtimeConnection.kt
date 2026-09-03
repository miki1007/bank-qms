package com.bankqms.mobilecore

import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI
import java.util.LinkedHashSet

class RealtimeConnection(
    socketOrigin: String,
    accessToken: String,
    private val events: Set<String>,
    private val onConnectionChanged: (Boolean) -> Unit,
    private val onEvent: (String, JSONObject) -> Unit,
) {
    private val seenIds = LinkedHashSet<String>()
    private val socket: Socket

    init {
        val options = IO.Options().apply {
            auth = mapOf("accessToken" to accessToken)
            reconnection = true
            timeout = 10_000
        }
        socket = IO.socket(URI("${socketOrigin.trimEnd('/')}/realtime"), options)
        socket.on(Socket.EVENT_CONNECT) { onConnectionChanged(true) }
        socket.on(Socket.EVENT_DISCONNECT) { onConnectionChanged(false) }
        socket.on(Socket.EVENT_CONNECT_ERROR) { onConnectionChanged(false) }
        events.forEach { name ->
            socket.on(name) { args ->
                val envelope = args.firstOrNull() as? JSONObject ?: return@on
                val eventId = envelope.optString("eventId")
                synchronized(seenIds) {
                    if (eventId.isNotBlank() && !seenIds.add(eventId)) return@on
                    while (seenIds.size > 256) seenIds.remove(seenIds.first())
                }
                onEvent(name, envelope)
            }
        }
    }

    fun connect() = socket.connect()

    fun close() {
        socket.off()
        socket.disconnect()
        onConnectionChanged(false)
    }
}
