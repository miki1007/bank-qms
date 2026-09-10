package com.bankqms.staff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.bankqms.mobilecore.RealtimeConnection
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class StaffUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val user: StaffUser? = null,
    val session: TellerSession? = null,
    val assignedCounter: AssignedCounter? = null,
    val services: List<StaffService> = emptyList(),
    val connected: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class StaffViewModel(private val repository: StaffRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(StaffUiState())
    val state: StateFlow<StaffUiState> = mutableState.asStateFlow()
    private var realtime: RealtimeConnection? = null
    private var realtimeToken: String? = null
    private var pollJob: Job? = null

    init {
        viewModelScope.launch {
            if (!repository.hasSession) {
                mutableState.update { it.copy(loading = false) }
                return@launch
            }
            runCatching { repository.restore() }
                .onSuccess { authenticate(it) }
                .onFailure {
                    repository.clearSession()
                    mutableState.update { it.copy(loading = false) }
                }
        }
    }

    fun login(username: String, password: String) = runBusy {
        val user = repository.login(username, password)
        if (user.role != "TELLER") {
            repository.logout()
            throw IllegalStateException("Manager and administrator accounts use their protected web workspaces. Sign in here with an independently assigned teller account.")
        }
        authenticate(user)
    }

    private suspend fun authenticate(user: StaffUser) {
        if (user.role != "TELLER") {
            repository.clearSession()
            mutableState.update { it.copy(loading = false, error = "This Android app is for tellers. Managers and administrators use their protected web workspaces.") }
            return
        }
        mutableState.update { it.copy(user = user, loading = false, busy = false, error = null) }
        refreshWorkspace()
        connectRealtime()
        startPolling()
    }

    fun openAssignedCounter() = runBusy {
        val counter = mutableState.value.assignedCounter
            ?: throw IllegalStateException("No counter is assigned to this teller.")
        repository.open(counter.id)
        refreshWorkspace()
        success("${counter.label} is open.")
    }

    fun callNext() = perform("Next customer called.") { repository.callNext() }
    fun recall() = withTicket("Customer recalled.") { repository.recall(it.id) }
    fun startService() = withTicket("Service timer started.") { repository.start(it.id) }
    fun complete() = withTicket("Service completed.") { repository.complete(it.id) }
    fun noShow() = withTicket("Ticket returned to the queue as a no-show.") { repository.noShow(it.id) }

    fun transfer(serviceId: String, note: String?) = withTicket("Ticket transferred to the selected service.") {
        repository.transfer(it.id, serviceId, note)
    }

    fun pause() = perform("Counter paused.") { repository.pause() }
    fun resume() = perform("Counter resumed.") { repository.resume() }
    fun close() = perform("Counter session closed.") { repository.close() }

    private fun withTicket(message: String, operation: suspend (ActiveTicket) -> Unit) {
        val ticket = mutableState.value.session?.activeTicket ?: return
        perform(message) { operation(ticket) }
    }

    private fun perform(message: String, operation: suspend () -> Unit) = runBusy {
        operation()
        refreshWorkspace()
        success(message)
    }

    private fun success(message: String) {
        mutableState.update { it.copy(busy = false, notice = message, error = null) }
    }

    fun dismissMessage() = mutableState.update { it.copy(error = null, notice = null) }

    fun logout() = runBusy {
        realtime?.close()
        realtime = null
        realtimeToken = null
        pollJob?.cancel()
        repository.logout()
        mutableState.value = StaffUiState(loading = false)
    }

    private suspend fun refreshWorkspace() {
        val user = mutableState.value.user ?: return
        val session = repository.currentSession()
        val counter = if (session == null) repository.assignedCounter() else null
        val services = if (mutableState.value.services.isEmpty()) repository.services(user.branchCode) else mutableState.value.services
        mutableState.update {
            it.copy(
                session = session,
                assignedCounter = counter,
                services = services,
                connected = true,
                busy = false,
            )
        }
        connectRealtime()
    }

    private fun connectRealtime() {
        val token = repository.accessToken() ?: return
        if (token == realtimeToken && realtime != null) return
        realtime?.close()
        realtimeToken = token
        realtime = RealtimeConnection(
            socketOrigin = repository.socketOrigin,
            accessToken = token,
            events = setOf("ticket.created", "ticket.updated", "queue.updated", "counter.updated", "system.notice"),
            onConnectionChanged = { connected -> mutableState.update { it.copy(connected = connected) } },
            onEvent = { _, _ -> viewModelScope.launch { runCatching { refreshWorkspace() } } },
        ).also { it.connect() }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive && mutableState.value.user != null) {
                delay(3_000)
                runCatching { refreshWorkspace() }
                    .onFailure { mutableState.update { state -> state.copy(connected = false) } }
            }
        }
    }

    private fun runBusy(block: suspend () -> Unit) {
        if (mutableState.value.busy) return
        mutableState.update { it.copy(busy = true, error = null, notice = null) }
        viewModelScope.launch {
            try {
                block()
            } catch (error: Exception) {
                mutableState.update {
                    it.copy(busy = false, error = error.message ?: "The action could not be completed.")
                }
            }
        }
    }

    override fun onCleared() {
        realtime?.close()
        pollJob?.cancel()
    }
}
