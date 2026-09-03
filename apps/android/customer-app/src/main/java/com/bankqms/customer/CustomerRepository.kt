package com.bankqms.customer

import com.bankqms.mobilecore.QmsApiClient
import com.bankqms.mobilecore.asArray
import com.bankqms.mobilecore.asObject
import org.json.JSONObject
import java.util.UUID

class CustomerRepository(private val api: QmsApiClient) {
    val hasSession: Boolean get() = api.hasSession
    val socketOrigin: String get() = api.socketOrigin
    fun accessToken(): String? = api.currentAccessToken()

    suspend fun login(email: String, password: String): CustomerUser {
        val result = api.authenticate(
            "/customer-auth/login",
            JSONObject().put("email", email.trim()).put("password", password),
        )
        return result.getJSONObject("user").toUser()
    }

    suspend fun register(name: String, email: String, password: String): CustomerUser {
        val result = api.authenticate(
            "/customer-auth/register",
            JSONObject()
                .put("name", name.trim())
                .put("email", email.trim())
                .put("password", password),
        )
        return result.getJSONObject("user").toUser()
    }

    suspend fun restore(): CustomerUser =
        api.get("/customer-auth/me").asObject().getJSONObject("user").toUser()

    suspend fun branches(): List<Branch> {
        val array = api.get("/customers/branches").asArray()
        return List(array.length()) { array.getJSONObject(it).toBranch() }
    }

    suspend fun services(branchCode: String): List<Service> {
        val array = api.get("/customers/branches/$branchCode/services").asArray()
        return List(array.length()) { array.getJSONObject(it).toService() }
    }

    suspend fun history(): List<CustomerTicket> {
        val array = api.get("/customers/me/tickets").asObject().getJSONArray("tickets")
        return List(array.length()) { array.getJSONObject(it).toTicket() }
    }

    suspend fun ticket(id: String): CustomerTicket =
        api.get("/customers/tickets/$id").asObject().getJSONObject("ticket").toTicket()

    suspend fun createTicket(
        branchCode: String,
        serviceId: String,
        priority: Boolean,
        priorityReason: String?,
    ): CustomerTicket {
        val body = JSONObject()
            .put("serviceTypeId", serviceId)
            .put("priority", priority)
            .put("priorityReason", if (priority) priorityReason else JSONObject.NULL)
            .put("idempotencyKey", UUID.randomUUID().toString())
        return api.post("/customers/branches/$branchCode/tickets", body)
            .asObject()
            .getJSONObject("ticket")
            .toTicket()
    }

    suspend fun cancel(id: String): CustomerTicket =
        api.post("/customers/tickets/$id/cancel")
            .asObject()
            .getJSONObject("ticket")
            .toTicket()

    suspend fun logout() = api.logout()
    fun clearSession() = api.clearSession()
}
