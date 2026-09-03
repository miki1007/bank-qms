package com.bankqms.staff

import org.json.JSONObject

data class StaffUser(
    val id: String,
    val name: String,
    val username: String,
    val role: String,
    val branchId: String,
    val branchCode: String,
    val branchName: String,
)

data class StaffService(val id: String, val code: String, val name: String)

data class AssignedCounter(
    val id: String,
    val label: String,
    val status: String,
    val available: Boolean,
    val service: StaffService?,
)

data class QueueSnapshot(
    val waiting: Int,
    val standardWaiting: Int,
    val priorityWaiting: Int,
    val oldestWaitSeconds: Int,
)

data class ActiveTicket(
    val id: String,
    val publicNumber: String,
    val status: String,
    val noShowCount: Int,
    val recallCount: Int,
    val calledAt: String?,
    val serviceStartedAt: String?,
    val serviceName: String,
)

data class TellerSession(
    val id: String,
    val status: String,
    val openedAt: String,
    val counter: AssignedCounter,
    val service: StaffService,
    val queue: QueueSnapshot,
    val activeTicket: ActiveTicket?,
)

private fun JSONObject.optionalString(name: String): String? =
    if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }

internal fun JSONObject.toStaffUser() = StaffUser(
    id = getString("id"),
    name = getString("name"),
    username = getString("username"),
    role = getString("role"),
    branchId = getString("branchId"),
    branchCode = optString("branchCode"),
    branchName = optString("branchName"),
)

internal fun JSONObject.toStaffService() = StaffService(
    id = getString("id"),
    code = optString("code"),
    name = getString("name"),
)

internal fun JSONObject.toAssignedCounter(): AssignedCounter {
    val serviceJson = optJSONObject("service") ?: optJSONObject("assignedService")
    return AssignedCounter(
        id = getString("id"),
        label = getString("label"),
        status = optString("status"),
        available = if (has("available")) optBoolean("available") else true,
        service = serviceJson?.toStaffService(),
    )
}

internal fun JSONObject.toTellerSession(): TellerSession {
    val queueJson = getJSONObject("queue")
    val activeJson = optJSONObject("activeTicket")
    val serviceJson = getJSONObject("service")
    val counterJson = getJSONObject("counter")
    return TellerSession(
        id = getString("id"),
        status = getString("status"),
        openedAt = optString("openedAt"),
        counter = AssignedCounter(
            id = counterJson.getString("id"),
            label = counterJson.getString("label"),
            status = counterJson.optString("status"),
            available = true,
            service = serviceJson.toStaffService(),
        ),
        service = serviceJson.toStaffService(),
        queue = QueueSnapshot(
            waiting = queueJson.optInt("waiting"),
            standardWaiting = queueJson.optInt("standardWaiting"),
            priorityWaiting = queueJson.optInt("priorityWaiting"),
            oldestWaitSeconds = queueJson.optInt("oldestWaitSeconds"),
        ),
        activeTicket = activeJson?.let {
            ActiveTicket(
                id = it.getString("id"),
                publicNumber = it.getString("publicNumber"),
                status = it.getString("status"),
                noShowCount = it.optInt("noShowCount"),
                recallCount = it.optInt("recallCount"),
                calledAt = it.optionalString("calledAt"),
                serviceStartedAt = it.optionalString("serviceStartedAt"),
                serviceName = it.optJSONObject("currentService")?.optString("name")
                    ?: serviceJson.getString("name"),
            )
        },
    )
}
