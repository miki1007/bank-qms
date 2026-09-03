package com.bankqms.staff

import com.bankqms.mobilecore.QmsApiClient
import com.bankqms.mobilecore.asArray
import com.bankqms.mobilecore.asObject
import org.json.JSONObject
import java.util.UUID

class StaffRepository(private val api: QmsApiClient) {
    val hasSession: Boolean get() = api.hasSession
    val socketOrigin: String get() = api.socketOrigin
    fun accessToken(): String? = api.currentAccessToken()

    suspend fun login(username: String, password: String): StaffUser {
        val result = api.authenticate(
            "/auth/login",
            JSONObject().put("username", username.trim()).put("password", password),
        )
        return result.getJSONObject("user").toStaffUser()
    }

    suspend fun restore(): StaffUser =
        api.get("/auth/me").asObject().getJSONObject("user").toStaffUser()

    suspend fun currentSession(): TellerSession? {
        val value = api.get("/teller/counter-session/current").asObject()
        return value.optJSONObject("session")?.toTellerSession()
    }

    suspend fun assignedCounter(): AssignedCounter? {
        val array = api.get("/teller/counters/available").asArray()
        return if (array.length() == 0) null else array.getJSONObject(0).toAssignedCounter()
    }

    suspend fun services(branchCode: String): List<StaffService> {
        val array = api.get("/public/branches/$branchCode/services", authenticated = false).asArray()
        return List(array.length()) { array.getJSONObject(it).toStaffService() }
    }

    suspend fun open(counterId: String) {
        api.post("/teller/counter-sessions", JSONObject().put("counterId", counterId))
    }

    suspend fun pause() = action("/teller/counter-session/pause", false)
    suspend fun resume() = action("/teller/counter-session/resume", false)
    suspend fun close() = action("/teller/counter-session/close", false)
    suspend fun callNext() = action("/teller/tickets/call-next")
    suspend fun recall(id: String) = action("/teller/tickets/$id/recall")
    suspend fun start(id: String) = action("/teller/tickets/$id/start")
    suspend fun complete(id: String) = action("/teller/tickets/$id/complete")
    suspend fun noShow(id: String) = action("/teller/tickets/$id/no-show")

    suspend fun transfer(id: String, serviceId: String, note: String?) {
        api.post(
            "/teller/tickets/$id/transfer",
            JSONObject()
                .put("destinationServiceTypeId", serviceId)
                .put("note", note?.trim().orEmpty()),
            UUID.randomUUID().toString(),
        )
    }

    private suspend fun action(path: String, idempotent: Boolean = true) {
        api.post(path, idempotencyKey = if (idempotent) UUID.randomUUID().toString() else null)
    }

    suspend fun logout() = api.logout()
    fun clearSession() = api.clearSession()
}
