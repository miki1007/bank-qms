package com.bankqms.staff

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bankqms.mobilecore.QmsApiClient
import com.bankqms.mobilecore.SessionAudience

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val repository = StaffRepository(
            QmsApiClient(
                applicationContext,
                BuildConfig.API_URL,
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
            StaffApplication(model)
        }
    }
}
