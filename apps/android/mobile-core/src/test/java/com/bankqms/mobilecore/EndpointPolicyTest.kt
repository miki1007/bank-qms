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

    @Test
    fun makesPhysicalPhoneAddressesEasyToEnter() {
        assertEquals(
            "http://192.168.1.20:3000/api/v1",
            EndpointPolicy.normalize("192.168.1.20:3000"),
        )
        assertEquals(
            "https://queue.example/api/v1",
            EndpointPolicy.normalize("queue.example", allowHttp = false),
        )
    }

    @Test
    fun requiresHttpsAndRejectsCredentialBearingUrlsForRelease() {
        assertThrows(IllegalArgumentException::class.java) {
            EndpointPolicy.normalize("http://queue.example", allowHttp = false)
        }
        assertThrows(IllegalArgumentException::class.java) {
            EndpointPolicy.normalize("https://user:secret@queue.example")
        }
        assertThrows(IllegalArgumentException::class.java) {
            EndpointPolicy.normalize("https://queue.example?token=secret")
        }
    }
}
