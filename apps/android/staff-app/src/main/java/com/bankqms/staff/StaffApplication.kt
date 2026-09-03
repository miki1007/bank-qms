package com.bankqms.staff

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AssignmentInd
import androidx.compose.material.icons.rounded.Autorenew
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Forward
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PersonOff
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Storefront
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bankqms.mobilecore.AnimatedBackdrop
import com.bankqms.mobilecore.BankQmsTheme
import com.bankqms.mobilecore.QmsCardShape
import com.bankqms.mobilecore.QmsDanger
import com.bankqms.mobilecore.QmsMuted
import com.bankqms.mobilecore.QmsStaff
import com.bankqms.mobilecore.QmsSurfaceHigh
import com.bankqms.mobilecore.QmsWarning
import kotlinx.coroutines.delay
import java.time.Duration
import java.time.Instant

@Composable
fun StaffApplication(viewModel: StaffViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error, state.notice) {
        (state.error ?: state.notice)?.let {
            snackbar.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }
    BankQmsTheme(QmsStaff) {
        Scaffold(containerColor = Color.Transparent, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                AnimatedBackdrop(QmsStaff)
                AnimatedContent(
                    targetState = when {
                        state.loading -> "loading"
                        state.user == null -> "auth"
                        state.session == null -> "open"
                        else -> "workspace"
                    },
                    transitionSpec = { (fadeIn() + scaleIn(initialScale = .97f)) togetherWith (fadeOut() + scaleOut(targetScale = 1.03f)) },
                    label = "staff-navigation",
                ) { screen ->
                    when (screen) {
                        "loading" -> StaffLoader()
                        "auth" -> StaffLogin(state.busy, viewModel::login)
                        "open" -> OpenCounterScreen(state, viewModel)
                        else -> WorkspaceScreen(state, viewModel)
                    }
                }
                AnimatedVisibility(
                    visible = state.busy && state.user != null,
                    enter = fadeIn() + scaleIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.Center),
                ) {
                    Card(shape = CircleShape, colors = CardDefaults.cardColors(QmsSurfaceHigh)) {
                        CircularProgressIndicator(Modifier.padding(20.dp), color = QmsStaff)
                    }
                }
            }
        }
    }
}

@Composable
private fun StaffMark() {
    Box(
        Modifier.size(58.dp).clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(QmsStaff, Color(0xFF9BC5FF)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Rounded.Bolt, null, tint = Color(0xFF071322), modifier = Modifier.size(31.dp))
    }
}

@Composable
private fun StaffLoader() {
    Column(Modifier.fillMaxSize().statusBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        StaffMark()
        Spacer(Modifier.height(22.dp))
        CircularProgressIndicator(color = QmsStaff)
        Text("Securing your counter", color = QmsMuted, modifier = Modifier.padding(top = 13.dp))
    }
}

@Composable
private fun StaffLogin(busy: Boolean, login: (String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 30.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StaffMark()
            Spacer(Modifier.width(14.dp))
            Column {
                Text("BANK QMS", fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                Text("Staff · Teller", color = QmsStaff, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(50.dp))
        Text("Your counter.\nYour queue.", style = MaterialTheme.typography.headlineLarge)
        Text(
            "Fast, focused service controls for independently authenticated tellers.",
            color = QmsMuted,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(top = 12.dp, bottom = 30.dp),
        )
        Card(shape = QmsCardShape, colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(.94f))) {
            Column(Modifier.padding(20.dp)) {
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Teller username") },
                    leadingIcon = { Icon(Icons.Rounded.AssignmentInd, null) },
                    singleLine = true,
                    shape = RoundedCornerShape(17.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Rounded.Lock, null) },
                    trailingIcon = {
                        IconButton(onClick = { visible = !visible }) {
                            Icon(if (visible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, "Toggle password")
                        }
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(17.dp),
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                )
                Button(
                    onClick = { login(username, password) },
                    enabled = username.trim().length >= 3 && password.length >= 8 && !busy,
                    modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 16.dp),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else {
                        Text("Open teller workspace")
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.AutoMirrored.Rounded.ArrowForward, null)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 22.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Security, null, tint = QmsStaff, modifier = Modifier.size(18.dp))
            Text("Your manager assigns the counter. It cannot be changed here.", color = QmsMuted, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun StaffHeader(state: StaffUiState, viewModel: StaffViewModel) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        StaffMark()
        Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
            Text(state.user?.name.orEmpty(), fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(state.user?.branchName.orEmpty(), color = QmsMuted, fontSize = 12.sp)
        }
        StaffConnectionPill(state.connected)
        IconButton(onClick = viewModel::logout) { Icon(Icons.Rounded.Logout, "Sign out") }
    }
}

@Composable
private fun StaffConnectionPill(connected: Boolean) {
    Row(
        Modifier.clip(CircleShape).background(if (connected) QmsStaff.copy(.13f) else QmsWarning.copy(.14f))
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (connected) Icons.Rounded.Wifi else Icons.Rounded.WifiOff, null, tint = if (connected) QmsStaff else QmsWarning, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(5.dp))
        Text(if (connected) "Live" else "Syncing", fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun OpenCounterScreen(state: StaffUiState, viewModel: StaffViewModel) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(22.dp),
    ) {
        StaffHeader(state, viewModel)
        Spacer(Modifier.height(42.dp))
        Text("START SHIFT", color = QmsStaff, fontWeight = FontWeight.Black, fontSize = 12.sp)
        Text("Open your assigned counter", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp))
        Text("Counter ownership is controlled by the manager dashboard.", color = QmsMuted, modifier = Modifier.padding(top = 9.dp, bottom = 24.dp))
        val counter = state.assignedCounter
        if (counter == null) {
            InfoCard(Icons.Rounded.PersonOff, "No counter assigned", "Ask a manager to assign an active counter to your teller account.")
        } else {
            Card(
                shape = QmsCardShape,
                colors = CardDefaults.cardColors(Color(0xFF132B42)),
                border = BorderStroke(1.dp, QmsStaff.copy(.4f)),
            ) {
                Column(Modifier.fillMaxWidth().padding(24.dp)) {
                    Icon(Icons.Rounded.Storefront, null, tint = QmsStaff, modifier = Modifier.size(34.dp))
                    Text(counter.label, fontSize = 30.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 20.dp))
                    Text(counter.service?.name ?: "No service assigned", color = QmsMuted, fontSize = 17.sp)
                    Text(
                        if (counter.available) "Ready to open" else "Currently ${counter.status.lowercase()}",
                        color = if (counter.available) QmsStaff else QmsWarning,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 16.dp),
                    )
                    Button(
                        onClick = viewModel::openAssignedCounter,
                        enabled = counter.available && !state.busy,
                        shape = RoundedCornerShape(18.dp),
                        modifier = Modifier.fillMaxWidth().height(58.dp).padding(top = 14.dp),
                    ) {
                        Icon(Icons.Rounded.PlayArrow, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Open my session")
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceScreen(state: StaffUiState, viewModel: StaffViewModel) {
    val session = state.session ?: return
    var confirmation by remember { mutableStateOf<String?>(null) }
    var showTransfer by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        LazyColumn(
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(15.dp),
        ) {
            item { StaffHeader(state, viewModel) }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("${session.counter.label.uppercase()} · ${session.service.code}", color = QmsStaff, fontWeight = FontWeight.Black, fontSize = 12.sp)
                        Text("Queue workspace", style = MaterialTheme.typography.headlineMedium)
                    }
                    SessionBadge(session.status)
                }
            }
            item { QueueMetrics(session.queue) }
            item {
                AnimatedContent(
                    targetState = session.activeTicket,
                    transitionSpec = { (fadeIn() + scaleIn()) togetherWith (fadeOut() + scaleOut()) },
                    label = "active-ticket",
                ) { ticket ->
                    if (ticket == null) ReadyCard(session.status == "OPEN", viewModel::callNext)
                    else ActiveTicketCard(ticket, state.busy, viewModel, { confirmation = "no-show" }, { showTransfer = true })
                }
            }
            item {
                SessionControls(
                    session = session,
                    busy = state.busy,
                    pause = viewModel::pause,
                    resume = viewModel::resume,
                    close = { confirmation = "close" },
                )
            }
        }
    }
    if (confirmation != null) {
        val noShow = confirmation == "no-show"
        AlertDialog(
            onDismissRequest = { confirmation = null },
            icon = { Icon(if (noShow) Icons.Rounded.PersonOff else Icons.Rounded.Close, null) },
            title = { Text(if (noShow) "Mark customer no-show?" else "Close counter session?") },
            text = {
                Text(
                    if (noShow) "The ticket will return to the queue according to the branch no-show policy."
                    else "You can open the same manager-assigned counter again on your next shift.",
                )
            },
            confirmButton = {
                Button(onClick = {
                    if (noShow) viewModel.noShow() else viewModel.close()
                    confirmation = null
                }) { Text(if (noShow) "Mark no-show" else "Close session") }
            },
            dismissButton = { TextButton(onClick = { confirmation = null }) { Text("Keep working") } },
        )
    }
    if (showTransfer) {
        TransferDialog(
            services = state.services.filter { it.id != session.service.id },
            close = { showTransfer = false },
            transfer = { serviceId, note ->
                viewModel.transfer(serviceId, note)
                showTransfer = false
            },
        )
    }
}

@Composable
private fun QueueMetrics(queue: QueueSnapshot) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QueueMetric("Waiting", queue.waiting.toString(), QmsStaff, Modifier.weight(1f))
            QueueMetric("Oldest", "${queue.oldestWaitSeconds / 60}m", QmsWarning, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QueueMetric("Standard", queue.standardWaiting.toString(), Color(0xFF9DB5CE), Modifier.weight(1f))
            QueueMetric("Priority", queue.priorityWaiting.toString(), QmsWarning, Modifier.weight(1f))
        }
    }
}

@Composable
private fun QueueMetric(label: String, value: String, color: Color, modifier: Modifier) {
    Card(modifier, shape = RoundedCornerShape(19.dp), colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(.92f))) {
        Column(Modifier.padding(17.dp)) {
            Text(value, fontSize = 26.sp, fontWeight = FontWeight.Black, color = color)
            Text(label, color = QmsMuted, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ReadyCard(open: Boolean, callNext: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "ready-pulse")
    val scale by transition.animateFloat(
        initialValue = .94f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse),
        label = "ready-scale",
    )
    Card(shape = QmsCardShape, colors = CardDefaults.cardColors(Color(0xFF132B42)), border = BorderStroke(1.dp, QmsStaff.copy(.35f))) {
        Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(80.dp).scale(scale).clip(CircleShape).background(QmsStaff.copy(.13f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Call, null, tint = QmsStaff, modifier = Modifier.size(36.dp))
            }
            Text("Ready for the next customer", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 20.dp))
            Text("The server applies FIFO order and starvation-safe priority fairness.", color = QmsMuted, textAlign = TextAlign.Center, fontSize = 13.sp, modifier = Modifier.padding(top = 7.dp))
            Button(
                onClick = callNext,
                enabled = open,
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth().height(64.dp).padding(top = 15.dp),
            ) {
                Icon(Icons.Rounded.Call, null)
                Spacer(Modifier.width(9.dp))
                Text(if (open) "Call next customer" else "Resume to call next", fontSize = 16.sp)
            }
        }
    }
}

@Composable
private fun ActiveTicketCard(
    ticket: ActiveTicket,
    busy: Boolean,
    viewModel: StaffViewModel,
    noShow: () -> Unit,
    transfer: () -> Unit,
) {
    Card(shape = QmsCardShape, colors = CardDefaults.cardColors(Color(0xFF172E46)), border = BorderStroke(1.dp, QmsStaff.copy(.42f))) {
        Column(Modifier.fillMaxWidth().padding(23.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                TicketStatus(ticket.status)
                Text("${ticket.recallCount} recalls · ${ticket.noShowCount} no-shows", color = QmsMuted, fontSize = 11.sp)
            }
            Text(ticket.publicNumber, fontSize = 50.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 18.dp))
            Text(ticket.serviceName, color = QmsMuted)
            ServiceTimer(ticket)
            if (ticket.status == "CALLED") {
                Row(Modifier.fillMaxWidth().padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    ActionButton("Recall", Icons.Rounded.Autorenew, false, busy, Modifier.weight(1f), viewModel::recall)
                    ActionButton("Start", Icons.Rounded.PlayArrow, true, busy, Modifier.weight(1f), viewModel::startService)
                }
                Row(Modifier.fillMaxWidth().padding(top = 9.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    ActionButton("No-show", Icons.Rounded.PersonOff, false, busy, Modifier.weight(1f), noShow)
                    ActionButton("Transfer", Icons.Rounded.SwapHoriz, false, busy, Modifier.weight(1f), transfer)
                }
            } else {
                ActionButton("Complete service", Icons.Rounded.CheckCircle, true, busy, Modifier.fillMaxWidth().padding(top = 20.dp), viewModel::complete)
                ActionButton("Transfer", Icons.Rounded.SwapHoriz, false, busy, Modifier.fillMaxWidth().padding(top = 9.dp), transfer)
            }
        }
    }
}

@Composable
private fun ServiceTimer(ticket: ActiveTicket) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(ticket.id, ticket.status) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val source = if (ticket.status == "IN_SERVICE") ticket.serviceStartedAt else ticket.calledAt
    val seconds = runCatching { Duration.between(Instant.parse(source), Instant.ofEpochMilli(now)).seconds.coerceAtLeast(0) }.getOrDefault(0)
    Text(
        "%02d:%02d".format(seconds / 60, seconds % 60),
        color = QmsStaff,
        fontWeight = FontWeight.Black,
        fontSize = 24.sp,
        modifier = Modifier.padding(top = 13.dp),
    )
    Text(if (ticket.status == "IN_SERVICE") "service time" else "time since call", color = QmsMuted, fontSize = 11.sp)
}

@Composable
private fun ActionButton(
    label: String,
    icon: ImageVector,
    primary: Boolean,
    busy: Boolean,
    modifier: Modifier,
    action: () -> Unit,
) {
    if (primary) {
        Button(onClick = action, enabled = !busy, modifier = modifier.height(52.dp), shape = RoundedCornerShape(16.dp)) {
            Icon(icon, null, modifier = Modifier.size(19.dp)); Spacer(Modifier.width(7.dp)); Text(label)
        }
    } else {
        OutlinedButton(onClick = action, enabled = !busy, modifier = modifier.height(52.dp), shape = RoundedCornerShape(16.dp)) {
            Icon(icon, null, modifier = Modifier.size(19.dp)); Spacer(Modifier.width(7.dp)); Text(label)
        }
    }
}

@Composable
private fun SessionControls(
    session: TellerSession,
    busy: Boolean,
    pause: () -> Unit,
    resume: () -> Unit,
    close: () -> Unit,
) {
    val blocked = session.activeTicket != null || busy
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(.82f))) {
        Column(Modifier.padding(16.dp)) {
            Text("SESSION CONTROLS", color = QmsMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedButton(
                    onClick = if (session.status == "OPEN") pause else resume,
                    enabled = !blocked,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Icon(if (session.status == "OPEN") Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null)
                    Text(if (session.status == "OPEN") "Pause" else "Resume", modifier = Modifier.padding(start = 7.dp))
                }
                OutlinedButton(
                    onClick = close,
                    enabled = !blocked,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = QmsDanger),
                    border = BorderStroke(1.dp, QmsDanger.copy(.4f)),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(15.dp),
                ) {
                    Icon(Icons.Rounded.Close, null)
                    Text("Close", modifier = Modifier.padding(start = 7.dp))
                }
            }
            if (session.activeTicket != null) Text("Resolve the active ticket before pausing or closing.", color = QmsMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun TransferDialog(services: List<StaffService>, close: () -> Unit, transfer: (String, String?) -> Unit) {
    var selected by remember { mutableStateOf<StaffService?>(null) }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = close,
        icon = { Icon(Icons.Rounded.SwapHoriz, null) },
        title = { Text("Transfer ticket") },
        text = {
            Column {
                Text("Choose the destination service. The ticket re-enters that authoritative queue.", color = QmsMuted)
                if (services.isEmpty()) Text("No other active services are available.", color = QmsWarning, modifier = Modifier.padding(top = 14.dp))
                services.forEach { service ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(14.dp))
                            .background(if (selected?.id == service.id) QmsStaff.copy(.16f) else Color.White.copy(.04f))
                            .clickable { selected = service }.padding(13.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.Forward, null, tint = QmsStaff)
                        Text(service.name, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 10.dp))
                    }
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 255) note = it },
                    label = { Text("Internal note (optional)") },
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    shape = RoundedCornerShape(15.dp),
                )
            }
        },
        confirmButton = {
            Button(onClick = { selected?.let { transfer(it.id, note.ifBlank { null }) } }, enabled = selected != null) { Text("Transfer") }
        },
        dismissButton = { TextButton(onClick = close) { Text("Cancel") } },
    )
}

@Composable
private fun SessionBadge(status: String) {
    val color = if (status == "OPEN") QmsStaff else QmsWarning
    Text(
        status.lowercase().replaceFirstChar { it.uppercase() },
        color = color,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        modifier = Modifier.clip(CircleShape).background(color.copy(.12f)).padding(horizontal = 11.dp, vertical = 7.dp),
    )
}

@Composable
private fun TicketStatus(status: String) {
    val color = if (status == "IN_SERVICE") QmsStaff else QmsWarning
    Text(
        status.replace('_', ' '),
        color = color,
        fontWeight = FontWeight.Black,
        fontSize = 11.sp,
        modifier = Modifier.clip(CircleShape).background(color.copy(.12f)).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun InfoCard(icon: ImageVector, title: String, body: String) {
    Card(shape = QmsCardShape, colors = CardDefaults.cardColors(QmsSurfaceHigh), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, null, tint = QmsMuted, modifier = Modifier.size(38.dp))
            Text(title, fontWeight = FontWeight.Bold, fontSize = 19.sp, modifier = Modifier.padding(top = 13.dp))
            Text(body, color = QmsMuted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 6.dp))
        }
    }
}
