package com.bankqms.mobilecore

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class EndpointPolicyTest {
    @Test
    fun appendsApiPrefixOnce() {
        assertEquals("https://queue.example/api/v1", EndpointPolicy.normalize("https://queue.example"))
        assertEquals("https://queue.example/api/v1", EndpointPolicy.normalize("https://queue.example/api/v1/"))
    }

    @Test
    fun rejectsUrlsWithoutNetworkHosts() {
        assertThrows(IllegalArgumentException::class.java) { EndpointPolicy.normalize("file:///tmp/qms") }
        assertThrows(IllegalArgumentException::class.java) { EndpointPolicy.normalize("not a url") }
    }
}
