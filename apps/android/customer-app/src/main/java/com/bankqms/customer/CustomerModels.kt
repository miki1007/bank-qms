package com.bankqms.customer

import org.json.JSONObject

data class CustomerUser(val id: String, val name: String, val email: String)

data class Branch(
    val code: String,
    val name: String,
    val location: String?,
    val timezone: String,
)

data class Service(
    val id: String,
    val code: String,
    val name: String,
    val description: String?,
    val averageServiceMinutes: Int,
    val waitingCount: Int,
    val estimatedWaitMinutes: Int?,
)

data class CustomerTicket(
    val id: String,
    val publicNumber: String,
    val serviceName: String,
    val status: String,
    val issuedAt: String,
    val peopleAhead: Int?,
    val estimatedWaitMinutes: Int?,
    val counterLabel: String?,
    val branch: Branch? = null,
    val version: Int = 0,
)

internal fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }

internal fun JSONObject.toUser(): CustomerUser = CustomerUser(
    id = getString("id"),
    name = getString("name"),
    email = getString("email"),
)

internal fun JSONObject.toBranch(): Branch = Branch(
    code = getString("code"),
    name = getString("name"),
    location = optionalString("location"),
    timezone = optString("timezone", "UTC"),
)

internal fun JSONObject.toService(): Service = Service(
    id = getString("id"),
    code = getString("code"),
    name = getString("name"),
    description = optionalString("description"),
    averageServiceMinutes = optInt("averageServiceMinutes"),
    waitingCount = optInt("waitingCount"),
    estimatedWaitMinutes = if (isNull("estimatedWaitMinutes")) null else optInt("estimatedWaitMinutes"),
)

internal fun JSONObject.toTicket(): CustomerTicket {
    val branchJson = optJSONObject("branch")
    return CustomerTicket(
        id = getString("id"),
        publicNumber = getString("publicNumber"),
        serviceName = getString("serviceName"),
        status = getString("status"),
        issuedAt = optString("issuedAt"),
        peopleAhead = if (isNull("peopleAhead")) null else optInt("peopleAhead"),
        estimatedWaitMinutes = if (isNull("estimatedWaitMinutes")) null else optInt("estimatedWaitMinutes"),
        counterLabel = optionalString("counterLabel"),
        branch = branchJson?.toBranch(),
        version = optInt("version"),
    )
}
