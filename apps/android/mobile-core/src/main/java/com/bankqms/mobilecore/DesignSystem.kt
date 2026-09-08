package com.bankqms.mobilecore

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val QmsInk = Color(0xFFF5F8F7)
val QmsMuted = Color(0xFFA7B6B2)
val QmsSurface = Color(0xFF12201D)
val QmsSurfaceHigh = Color(0xFF192C27)
val QmsCustomer = Color(0xFF35D69F)
val QmsStaff = Color(0xFF72A8FF)
val QmsWarning = Color(0xFFFFC857)
val QmsDanger = Color(0xFFFF7185)

@Composable
fun BankQmsTheme(accent: Color, content: @Composable () -> Unit) {
    val colors = darkColorScheme(
        primary = accent,
        onPrimary = Color(0xFF061410),
        secondary = Color(0xFF8CE5C6),
        background = Color(0xFF09120F),
        onBackground = QmsInk,
        surface = QmsSurface,
        onSurface = QmsInk,
        surfaceVariant = QmsSurfaceHigh,
        onSurfaceVariant = QmsMuted,
        error = QmsDanger,
    )
    val typography = Typography(
        displayLarge = TextStyle(fontSize = 52.sp, lineHeight = 56.sp, fontWeight = FontWeight.Black),
        headlineLarge = TextStyle(fontSize = 32.sp, lineHeight = 37.sp, fontWeight = FontWeight.Bold),
        headlineMedium = TextStyle(fontSize = 25.sp, lineHeight = 31.sp, fontWeight = FontWeight.Bold),
        titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
        labelLarge = TextStyle(fontSize = 15.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold),
    )
    MaterialTheme(colorScheme = colors, typography = typography) {
        Surface(modifier = Modifier.fillMaxSize(), color = colors.background, content = content)
    }
}

@Composable
fun AnimatedBackdrop(accent: Color, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "ambient")
    val drift by transition.animateFloat(
        initialValue = -18f,
        targetValue = 18f,
        animationSpec = infiniteRepeatable(tween(5200), RepeatMode.Reverse),
        label = "drift",
    )
    val pulse by transition.animateFloat(
        initialValue = .82f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(3100), RepeatMode.Reverse),
        label = "pulse",
    )
    Box(
        modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(accent.copy(alpha = .23f), Color.Transparent),
                    radius = 900f,
                ),
            )
            .graphicsLayer { translationX = drift }
            .scale(pulse)
            .alpha(.75f),
    )
}

val QmsCardShape = RoundedCornerShape(26.dp)

