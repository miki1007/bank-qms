package com.bankqms.staff

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bankqms.mobilecore.EndpointPolicy
import com.bankqms.mobilecore.QmsApiClient
import com.bankqms.mobilecore.QmsStaff
import com.bankqms.mobilecore.ServerEndpointStore
import com.bankqms.mobilecore.ServerSetupScreen
import com.bankqms.mobilecore.SessionAudience

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val endpointStore = ServerEndpointStore(applicationContext, "staff")
        val configuredUrl = endpointStore.confirmedUrl(BuildConfig.DEBUG)
        if (configuredUrl == null) {
            setContent {
                ServerSetupScreen(
                    productLabel = "Bank QMS Staff",
                    accent = QmsStaff,
                    initialUrl = endpointStore.draftUrl(BuildConfig.API_URL),
                    allowHttp = BuildConfig.DEBUG,
                    onConnected = {
                        endpointStore.confirm(it, BuildConfig.DEBUG)
                        recreate()
                    },
                )
            }
            return
        }
        val repository = StaffRepository(
            QmsApiClient(
                applicationContext,
                configuredUrl,
                SessionAudience.STAFF,
                "staff",
            ),
        )
        val factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = StaffViewModel(repository) as T
        }
        setContent {
            val model: StaffViewModel = viewModel(factory = factory)
            StaffApplication(
                viewModel = model,
                serverAddress = EndpointPolicy.displayAddress(configuredUrl),
                onServerSettings = {
                    repository.clearSession()
                    endpointStore.requireSetup()
                    recreate()
                },
            )
        }
    }
}

