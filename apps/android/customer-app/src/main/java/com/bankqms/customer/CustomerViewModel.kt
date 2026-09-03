package com.bankqms.customer

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

enum class CustomerScreen { AUTH, HOME, JOIN, TICKET }

data class CustomerUiState(
    val screen: CustomerScreen = CustomerScreen.AUTH,
    val loading: Boolean = true,
    val busy: Boolean = false,
    val user: CustomerUser? = null,
    val branches: List<Branch> = emptyList(),
    val services: List<Service> = emptyList(),
    val tickets: List<CustomerTicket> = emptyList(),
    val selectedTicket: CustomerTicket? = null,
    val selectedBranch: Branch? = null,
    val selectedService: Service? = null,
    val joinStep: Int = 1,
    val connected: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class CustomerViewModel(private val repository: CustomerRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CustomerUiState())
    val state: StateFlow<CustomerUiState> = mutableState.asStateFlow()
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
                .onSuccess { authenticated(it) }
                .onFailure {
                    repository.clearSession()
                    mutableState.update { it.copy(loading = false, screen = CustomerScreen.AUTH) }
                }
        }
    }

    fun login(email: String, password: String) = runBusy {
        authenticated(repository.login(email, password))
    }

    fun register(name: String, email: String, password: String) = runBusy {
        authenticated(repository.register(name, email, password))
    }

    private suspend fun authenticated(user: CustomerUser) {
        mutableState.update {
            it.copy(user = user, screen = CustomerScreen.HOME, loading = false, busy = false, error = null)
        }
        refreshHome()
        connectRealtime()
        startPolling()
    }

    fun beginJoin() = runBusy {
        val branches = repository.branches()
        mutableState.update {
            it.copy(
                screen = CustomerScreen.JOIN,
                branches = branches,
                services = emptyList(),
                selectedBranch = null,
                selectedService = null,
                joinStep = 1,
                busy = false,
                error = null,
            )
        }
    }

    fun chooseBranch(branch: Branch) = runBusy {
        val services = repository.services(branch.code)
        mutableState.update {
            it.copy(selectedBranch = branch, services = services, joinStep = 2, busy = false, error = null)
        }
    }

    fun chooseService(service: Service) {
        mutableState.update { it.copy(selectedService = service, joinStep = 3, error = null) }
    }

    fun previousJoinStep() {
        val state = mutableState.value
        when (state.joinStep) {
            1 -> mutableState.update { it.copy(screen = CustomerScreen.HOME, error = null) }
            2 -> mutableState.update { it.copy(joinStep = 1, selectedBranch = null, services = emptyList()) }
            else -> mutableState.update { it.copy(joinStep = 2, selectedService = null) }
        }
    }

    fun confirmTicket(priority: Boolean, reason: String?) = runBusy {
        val branch = mutableState.value.selectedBranch ?: return@runBusy
        val service = mutableState.value.selectedService ?: return@runBusy
        val ticket = repository.createTicket(branch.code, service.id, priority, reason)
        mutableState.update {
            it.copy(
                selectedTicket = ticket,
                screen = CustomerScreen.TICKET,
                busy = false,
                notice = "You joined the ${service.name} queue.",
                error = null,
            )
        }
        refreshHome(keepScreen = true)
    }

    fun openTicket(id: String) = runBusy {
        val ticket = repository.ticket(id)
        mutableState.update {
            it.copy(selectedTicket = ticket, screen = CustomerScreen.TICKET, busy = false, error = null)
        }
    }

    fun cancelTicket() = runBusy {
        val id = mutableState.value.selectedTicket?.id ?: return@runBusy
        val ticket = repository.cancel(id)
        mutableState.update {
            it.copy(selectedTicket = ticket, busy = false, notice = "Ticket cancelled.", error = null)
        }
        refreshHome(keepScreen = true)
    }

    fun home() {
        mutableState.update { it.copy(screen = CustomerScreen.HOME, selectedTicket = null, error = null) }
        viewModelScope.launch { refreshHome() }
    }

    fun dismissMessage() = mutableState.update { it.copy(error = null, notice = null) }

    fun logout() = runBusy {
        realtime?.close()
        realtime = null
        realtimeToken = null
        pollJob?.cancel()
        repository.logout()
        mutableState.value = CustomerUiState(loading = false)
    }

    private suspend fun refreshHome(keepScreen: Boolean = false) {
        val tickets = repository.history()
        val current = mutableState.value.selectedTicket
        val updatedCurrent = current?.let { ticket ->
            tickets.firstOrNull { it.id == ticket.id }?.let { repository.ticket(ticket.id) } ?: current
        }
        mutableState.update {
            it.copy(
                tickets = tickets,
                selectedTicket = updatedCurrent,
                screen = if (keepScreen) it.screen else it.screen,
                connected = true,
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
            events = setOf("ticket.created", "ticket.updated", "system.notice"),
            onConnectionChanged = { connected -> mutableState.update { it.copy(connected = connected) } },
            onEvent = { _, _ -> viewModelScope.launch { runCatching { refreshHome(keepScreen = true) } } },
        ).also { it.connect() }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive && mutableState.value.user != null) {
                delay(10_000)
                runCatching { refreshHome(keepScreen = true) }
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
