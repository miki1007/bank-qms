package com.bankqms.shell;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TrustedNavigationPolicyTest {
    private static final String HOST = "bank-qms.malikket.chatgpt.site";

    @Test
    public void acceptsOnlyTheHttpsApplicationHost() {
        assertTrue(TrustedNavigationPolicy.isTrusted(
                "https://bank-qms.malikket.chatgpt.site/customer-app", HOST));
        assertFalse(TrustedNavigationPolicy.isTrusted("https://chatgpt.com/auth", HOST));
        assertFalse(TrustedNavigationPolicy.isTrusted(
                "http://bank-qms.malikket.chatgpt.site/customer-app", HOST));
        assertFalse(TrustedNavigationPolicy.isTrusted("https://evil.example", HOST));
        assertFalse(TrustedNavigationPolicy.isTrusted(
                "https://chatgpt.com.evil.example", HOST));
    }
}
