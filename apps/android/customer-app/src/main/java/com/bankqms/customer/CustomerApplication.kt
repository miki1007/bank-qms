package com.bankqms.customer

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Accessible
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Apartment
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ConfirmationNumber
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.bankqms.mobilecore.AnimatedBackdrop
import com.bankqms.mobilecore.BankQmsTheme
import com.bankqms.mobilecore.QmsCardShape
import com.bankqms.mobilecore.QmsCustomer
import com.bankqms.mobilecore.QmsDanger
import com.bankqms.mobilecore.QmsMuted
import com.bankqms.mobilecore.QmsSurfaceHigh
import com.bankqms.mobilecore.QmsWarning

@Composable
fun CustomerApplication(
    viewModel: CustomerViewModel,
    serverAddress: String,
    onServerSettings: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.error, state.notice) {
        (state.error ?: state.notice)?.let {
            snackbar.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }
    BankQmsTheme(QmsCustomer) {
        Scaffold(
            containerColor = Color.Transparent,
            snackbarHost = { SnackbarHost(snackbar) },
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
                AnimatedBackdrop(QmsCustomer)
                if (state.loading) {
                    BrandLoader("Preparing your queue")
                } else {
                    AnimatedContent(
                        targetState = state.screen,
                        transitionSpec = {
                            (slideInHorizontally { it / 3 } + fadeIn()) togetherWith
                                (slideOutHorizontally { -it / 4 } + fadeOut())
                        },
                        label = "customer-navigation",
                    ) { screen ->
                        when (screen) {
                            CustomerScreen.AUTH -> AuthScreen(
                                busy = state.busy,
                                serverAddress = serverAddress,
                                onLogin = viewModel::login,
                                onRegister = viewModel::register,
                                onServerSettings = onServerSettings,
                            )
                            CustomerScreen.HOME -> HomeScreen(state, viewModel)
                            CustomerScreen.JOIN -> JoinScreen(state, viewModel)
                            CustomerScreen.TICKET -> TicketScreen(state, viewModel)
                        }
                    }
                }
                AnimatedVisibility(
                    visible = state.busy && state.screen != CustomerScreen.AUTH,
                    enter = fadeIn() + scaleIn(),
                    exit = fadeOut(),
                    modifier = Modifier.align(Alignment.Center),
                ) {
                    Card(shape = CircleShape, colors = CardDefaults.cardColors(QmsSurfaceHigh)) {
                        CircularProgressIndicator(Modifier.padding(20.dp), color = QmsCustomer)
                    }
                }
            }
        }
    }
}

@Composable
private fun BrandLoader(message: String) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        BrandMark()
        Spacer(Modifier.height(24.dp))
        CircularProgressIndicator(color = QmsCustomer)
        Spacer(Modifier.height(14.dp))
        Text(message, color = QmsMuted)
    }
}

@Composable
private fun BrandMark() {
    Box(
        Modifier
            .size(58.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(QmsCustomer, Color(0xFF76F3C5)))),
        contentAlignment = Alignment.Center,
    ) {
        Icon(Icons.Rounded.ConfirmationNumber, null, tint = Color(0xFF051510), modifier = Modifier.size(30.dp))
    }
}

@Composable
private fun AuthScreen(
    busy: Boolean,
    serverAddress: String,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
    onServerSettings: () -> Unit,
) {
    var register by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    val valid = email.contains("@") && password.isNotBlank() && (!register || name.trim().length >= 2)
    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 30.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandMark()
            Spacer(Modifier.width(14.dp))
            Column {
                Text("BANK QMS", fontWeight = FontWeight.Black, letterSpacing = 1.6.sp)
                Text("Customer", color = QmsCustomer, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(52.dp))
        Text("Your time is\nyours again.", style = MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(12.dp))
        Text(
            "Join the right branch queue, follow your live position, and arrive when it matters.",
            color = QmsMuted,
            style = MaterialTheme.typography.bodyLarge,
        )
        Spacer(Modifier.height(32.dp))
        Card(shape = QmsCardShape, colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(alpha = .93f))) {
            Column(Modifier.padding(20.dp)) {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFF0D1916)).padding(4.dp),
                ) {
                    AuthTab("Sign in", !register, Modifier.weight(1f)) { register = false }
                    AuthTab("Create account", register, Modifier.weight(1f)) { register = true }
                }
                AnimatedVisibility(register) {
                    QmsTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = "Full name",
                        icon = Icons.Rounded.Person,
                        modifier = Modifier.padding(top = 18.dp),
                    )
                }
                QmsTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = "Email address",
                    icon = Icons.Rounded.Email,
                    keyboardType = KeyboardType.Email,
                    modifier = Modifier.padding(top = 14.dp),
                )
                QmsTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = "Password",
                    icon = Icons.Rounded.Lock,
                    keyboardType = KeyboardType.Password,
                    visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                    trailing = {
                        IconButton(onClick = { visible = !visible }) {
                            Icon(if (visible) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility, "Toggle password")
                        }
                    },
                    modifier = Modifier.padding(top = 14.dp),
                )
                if (register) {
                    Text(
                        "Use 10+ characters with uppercase, lowercase and a number.",
                        color = QmsMuted,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
                Button(
                    onClick = {
                        if (register) onRegister(name, email, password) else onLogin(email, password)
                    },
                    enabled = valid && !busy,
                    modifier = Modifier.fillMaxWidth().padding(top = 22.dp).height(56.dp),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else {
                        Text(if (register) "Create secure account" else "Continue to my queue")
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.AutoMirrored.Rounded.ArrowForward, null)
                    }
                }
            }
        }
        Row(Modifier.padding(top = 22.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Security, null, tint = QmsCustomer, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Encrypted session · Private ticket history", color = QmsMuted, fontSize = 13.sp)
        }
        TextButton(
            onClick = onServerSettings,
            enabled = !busy,
            modifier = Modifier.padding(top = 8.dp),
        ) {
            Icon(Icons.Rounded.Dns, null, modifier = Modifier.size(18.dp))
            Text("Server: $serverAddress", modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun AuthTab(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(13.dp))
            .background(if (selected) QmsCustomer else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 11.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (selected) Color(0xFF061410) else QmsMuted, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun QmsTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailing: @Composable (() -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        leadingIcon = { Icon(icon, null) },
        trailingIcon = trailing,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        visualTransformation = visualTransformation,
        shape = RoundedCornerShape(17.dp),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun HomeScreen(state: CustomerUiState, viewModel: CustomerViewModel) {
    val active = state.tickets.firstOrNull { it.status in setOf("WAITING", "CALLED", "IN_SERVICE") }
    LazyColumn(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(22.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("WELCOME BACK", color = QmsCustomer, fontWeight = FontWeight.Black, fontSize = 12.sp)
                    Text(state.user?.name.orEmpty(), style = MaterialTheme.typography.headlineMedium)
                }
                ConnectionPill(state.connected)
                TextButton(onClick = viewModel::logout, enabled = !state.busy) {
                    Icon(Icons.Rounded.Logout, null, modifier = Modifier.size(18.dp))
                    Text("Log out", modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
        item {
            AnimatedVisibility(visible = active != null, enter = fadeIn() + scaleIn()) {
                active?.let { LiveTicketCard(it) { viewModel.openTicket(it.id) } }
            }
        }
        item {
            Button(
                onClick = viewModel::beginJoin,
                enabled = !state.busy,
                modifier = Modifier.fillMaxWidth().height(68.dp),
                shape = RoundedCornerShape(22.dp),
            ) {
                Icon(Icons.Rounded.Add, null, modifier = Modifier.size(26.dp))
                Spacer(Modifier.width(12.dp))
                Text("Join a bank queue", style = MaterialTheme.typography.titleLarge)
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Rounded.History, null, tint = QmsCustomer)
                Spacer(Modifier.width(10.dp))
                Text("My tickets", style = MaterialTheme.typography.titleLarge)
            }
        }
        if (state.tickets.isEmpty()) {
            item { EmptyCard("No tickets yet", "Your current and previous queue tickets will appear here.") }
        } else {
            items(state.tickets, key = { it.id }) { ticket ->
                HistoryCard(ticket) { viewModel.openTicket(ticket.id) }
            }
        }
    }
}

@Composable
private fun ConnectionPill(connected: Boolean) {
    Row(
        Modifier.clip(CircleShape).background(if (connected) QmsCustomer.copy(.13f) else QmsWarning.copy(.14f))
            .padding(horizontal = 11.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            if (connected) Icons.Rounded.Wifi else Icons.Rounded.WifiOff,
            null,
            tint = if (connected) QmsCustomer else QmsWarning,
            modifier = Modifier.size(15.dp),
        )
        Spacer(Modifier.width(5.dp))
        Text(if (connected) "Live" else "Reconnecting", fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LiveTicketCard(ticket: CustomerTicket, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = QmsCardShape,
        colors = CardDefaults.cardColors(Color(0xFF11382E)),
        border = BorderStroke(1.dp, QmsCustomer.copy(alpha = .4f)),
    ) {
        Column(Modifier.padding(22.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("LIVE TICKET", color = QmsCustomer, fontWeight = FontWeight.Black, fontSize = 12.sp)
                StatusBadge(ticket.status)
            }
            Text(ticket.publicNumber, fontSize = 46.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(top = 10.dp))
            Text(ticket.serviceName, color = QmsMuted)
            Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MiniMetric("Ahead", ticket.peopleAhead?.toString() ?: "—", Modifier.weight(1f))
                MiniMetric("Estimate", ticket.estimatedWaitMinutes?.let { "$it min" } ?: "—", Modifier.weight(1f))
            }
            if (ticket.status in setOf("CALLED", "IN_SERVICE")) {
                Text(
                    "Proceed to ${ticket.counterLabel ?: "your assigned counter"}",
                    color = QmsCustomer,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 16.dp),
                )
            }
        }
    }
}

@Composable
private fun MiniMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(Color.White.copy(.05f)).padding(13.dp)) {
        Text(value, fontWeight = FontWeight.Black, fontSize = 20.sp)
        Text(label, color = QmsMuted, fontSize = 12.sp)
    }
}

@Composable
private fun HistoryCard(ticket: CustomerTicket, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(.9f)),
    ) {
        Row(Modifier.fillMaxWidth().padding(17.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)).background(QmsCustomer.copy(.12f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.ConfirmationNumber, null, tint = QmsCustomer)
            }
            Column(Modifier.weight(1f).padding(horizontal = 13.dp)) {
                Text(ticket.publicNumber, fontWeight = FontWeight.Black, fontSize = 18.sp)
                Text(ticket.serviceName, color = QmsMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            StatusBadge(ticket.status)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JoinScreen(state: CustomerUiState, viewModel: CustomerViewModel) {
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        TopAppBar(
            title = {
                Column {
                    Text("NEW TICKET", color = QmsCustomer, fontSize = 11.sp, fontWeight = FontWeight.Black)
                    Text("Step ${state.joinStep} of 3", fontWeight = FontWeight.Bold)
                }
            },
            navigationIcon = {
                IconButton(onClick = viewModel::previousJoinStep) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
        )
        LinearProgressIndicator(
            progress = { state.joinStep / 3f },
            modifier = Modifier.fillMaxWidth().height(3.dp),
            color = QmsCustomer,
            trackColor = Color.White.copy(.08f),
        )
        AnimatedContent(
            targetState = state.joinStep,
            transitionSpec = { (slideInHorizontally { it / 2 } + fadeIn()) togetherWith (slideOutHorizontally { -it / 2 } + fadeOut()) },
            modifier = Modifier.weight(1f),
            label = "join-step",
        ) { step ->
            when (step) {
                1 -> ChoiceList(
                    eyebrow = "CHOOSE A LOCATION",
                    title = "Which branch works for you?",
                    empty = "No branches are currently available.",
                    items = state.branches,
                    key = { it.code },
                ) { branch ->
                    ChoiceCard(Icons.Rounded.LocationOn, branch.name, branch.location ?: "Bank services") {
                        viewModel.chooseBranch(branch)
                    }
                }
                2 -> ChoiceList(
                    eyebrow = state.selectedBranch?.name?.uppercase().orEmpty(),
                    title = "What can we help with?",
                    empty = "No services are currently available.",
                    items = state.services,
                    key = { it.id },
                ) { service ->
                    ChoiceCard(
                        Icons.Rounded.Apartment,
                        service.name,
                        "${service.waitingCount} waiting · ${service.estimatedWaitMinutes?.let { "about $it min" } ?: "no open counter"}",
                        enabled = service.estimatedWaitMinutes != null,
                    ) { viewModel.chooseService(service) }
                }
                else -> ReviewTicket(state) {
                    viewModel.confirmTicket()
                }
            }
        }
    }
}

@Composable
private fun <T> ChoiceList(
    eyebrow: String,
    title: String,
    empty: String,
    items: List<T>,
    key: (T) -> String,
    item: @Composable (T) -> Unit,
) {
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(22.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            Text(eyebrow, color = QmsCustomer, fontWeight = FontWeight.Black, fontSize = 12.sp)
            Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp, bottom = 18.dp))
        }
        if (items.isEmpty()) item { EmptyCard("Nothing to show", empty) }
        else items(items, key = key) { item(it) }
    }
}

@Composable
private fun ChoiceCard(icon: ImageVector, title: String, detail: String, enabled: Boolean = true, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(if (enabled) QmsSurfaceHigh else QmsSurfaceHigh.copy(.45f)),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(50.dp).clip(RoundedCornerShape(16.dp)).background(QmsCustomer.copy(.12f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = if (enabled) QmsCustomer else QmsMuted)
            }
            Column(Modifier.weight(1f).padding(horizontal = 15.dp)) {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text(detail, color = QmsMuted, fontSize = 13.sp)
            }
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = if (enabled) QmsCustomer else QmsMuted)
        }
    }
}

@Composable
private fun ReviewTicket(
    state: CustomerUiState,
    confirm: () -> Unit,
) {
    val service = state.selectedService ?: return
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(22.dp),
    ) {
        Text("REVIEW", color = QmsCustomer, fontWeight = FontWeight.Black, fontSize = 12.sp)
        Text("Ready to join?", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
        Card(shape = QmsCardShape, colors = CardDefaults.cardColors(QmsSurfaceHigh)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                ReviewRow("Branch", state.selectedBranch?.name.orEmpty())
                ReviewRow("Service", service.name)
                ReviewRow("Expected wait", service.estimatedWaitMinutes?.let { "About $it minutes" } ?: "Unavailable")
            }
        }
        Button(
            onClick = confirm,
            enabled = !state.busy && service.estimatedWaitMinutes != null,
            modifier = Modifier.fillMaxWidth().height(60.dp).padding(top = 14.dp),
            shape = RoundedCornerShape(19.dp),
        ) {
            Icon(Icons.Rounded.CheckCircle, null)
            Spacer(Modifier.width(9.dp))
            Text("Confirm and join queue")
        }
    }
}

@Composable
private fun ReviewRow(label: String, value: String) {
    Column {
        Text(label.uppercase(), color = QmsMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        Text(value, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 3.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TicketScreen(state: CustomerUiState, viewModel: CustomerViewModel) {
    val ticket = state.selectedTicket
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        TopAppBar(
            title = { Text("Live ticket", fontWeight = FontWeight.Bold) },
            navigationIcon = { IconButton(onClick = viewModel::home) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Home") } },
            actions = { ConnectionPill(state.connected); Spacer(Modifier.width(12.dp)) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
        )
        if (ticket == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { EmptyCard("Ticket unavailable", "Return home and try again.") }
            return
        }
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                Modifier.size(94.dp).clip(CircleShape).background(QmsCustomer.copy(.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (ticket.status in setOf("CALLED", "IN_SERVICE")) Icons.Rounded.Apartment else Icons.Rounded.HourglassTop,
                    null,
                    tint = QmsCustomer,
                    modifier = Modifier.size(42.dp),
                )
            }
            Text(
                if (ticket.status in setOf("CALLED", "IN_SERVICE")) "PLEASE PROCEED" else "YOUR QUEUE NUMBER",
                color = QmsCustomer,
                fontSize = 12.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(top = 20.dp),
            )
            Text(ticket.publicNumber, style = MaterialTheme.typography.displayLarge, modifier = Modifier.padding(top = 7.dp))
            Text(ticket.serviceName, color = QmsMuted, fontSize = 17.sp)
            StatusBadge(ticket.status, Modifier.padding(top = 16.dp))
            if (ticket.status in setOf("CALLED", "IN_SERVICE")) {
                Card(
                    shape = QmsCardShape,
                    colors = CardDefaults.cardColors(QmsCustomer),
                    modifier = Modifier.fillMaxWidth().padding(top = 22.dp),
                ) {
                    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("GO TO", color = Color(0xFF063B2D), fontWeight = FontWeight.Black)
                        Text(ticket.counterLabel ?: "Assigned counter", color = Color(0xFF061510), fontSize = 30.sp, fontWeight = FontWeight.Black)
                    }
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MiniMetric("People ahead", ticket.peopleAhead?.toString() ?: "—", Modifier.weight(1f))
                    MiniMetric("Estimated wait", ticket.estimatedWaitMinutes?.let { "$it min" } ?: "—", Modifier.weight(1f))
                }
            }
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(QmsSurfaceHigh),
                modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
            ) {
                Row(Modifier.padding(17.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Schedule, null, tint = QmsCustomer)
                    Text(
                        "Position and waiting time are live estimates from the branch queue.",
                        color = QmsMuted,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
            if (ticket.status == "WAITING") {
                OutlinedButton(
                    onClick = viewModel::cancelTicket,
                    enabled = !state.busy,
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = QmsDanger),
                    border = BorderStroke(1.dp, QmsDanger.copy(.45f)),
                    modifier = Modifier.fillMaxWidth().height(56.dp).padding(top = 16.dp),
                    shape = RoundedCornerShape(18.dp),
                ) { Text("Cancel this ticket") }
            }
        }
    }
}

@Composable
private fun StatusBadge(status: String, modifier: Modifier = Modifier) {
    val (color, label) = when (status) {
        "WAITING" -> QmsWarning to "Waiting"
        "CALLED" -> QmsCustomer to "Called"
        "IN_SERVICE" -> QmsCustomer to "In service"
        "COMPLETED" -> QmsCustomer to "Completed"
        "CANCELLED" -> QmsDanger to "Cancelled"
        else -> QmsMuted to status.lowercase().replaceFirstChar { it.uppercase() }
    }
    Text(
        label,
        color = color,
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        modifier = modifier.clip(CircleShape).background(color.copy(.12f)).padding(horizontal = 10.dp, vertical = 6.dp),
    )
}

@Composable
private fun EmptyCard(title: String, body: String) {
    Card(shape = QmsCardShape, colors = CardDefaults.cardColors(QmsSurfaceHigh.copy(.8f)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Rounded.ConfirmationNumber, null, tint = QmsMuted, modifier = Modifier.size(36.dp))
            Text(title, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
            Text(body, color = QmsMuted, textAlign = TextAlign.Center, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp))
        }
    }
}
