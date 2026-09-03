package com.bankqms.mobilecore

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class SessionTokens(val accessToken: String, val refreshToken: String)

class SecureSessionStore(context: Context, namespace: String) {
    private val preferences = context.getSharedPreferences("bank_qms_$namespace", Context.MODE_PRIVATE)
    private val alias = "bank_qms_${namespace}_session"

    fun read(): SessionTokens? {
        val encoded = preferences.getString("session", null) ?: return null
        return runCatching {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val ivSize = bytes.first().toInt()
            require(ivSize in 12..16 && bytes.size > ivSize + 1)
            val iv = bytes.copyOfRange(1, ivSize + 1)
            val encrypted = bytes.copyOfRange(ivSize + 1, bytes.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val plain = String(cipher.doFinal(encrypted), StandardCharsets.UTF_8)
            val separator = plain.indexOf('\n')
            require(separator > 0)
            SessionTokens(plain.substring(0, separator), plain.substring(separator + 1))
        }.getOrElse {
            clear()
            null
        }
    }

    fun write(tokens: SessionTokens) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val plain = "${tokens.accessToken}\n${tokens.refreshToken}".toByteArray(StandardCharsets.UTF_8)
        val encrypted = cipher.doFinal(plain)
        val packed = byteArrayOf(cipher.iv.size.toByte()) + cipher.iv + encrypted
        preferences.edit().putString("session", Base64.encodeToString(packed, Base64.NO_WRAP)).apply()
    }

    fun clear() {
        preferences.edit().remove("session").apply()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }
}
