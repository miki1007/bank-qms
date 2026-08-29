package com.bankqms.shell;

import android.net.Uri;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

public final class TrustedNavigationPolicy {
    private TrustedNavigationPolicy() {}

    public static boolean isTrusted(Uri uri, String applicationHost) {
        return uri != null && isTrusted(uri.toString(), applicationHost);
    }

    public static boolean isTrusted(String rawUri, String applicationHost) {
        final URI uri;
        try {
            uri = new URI(rawUri);
        } catch (URISyntaxException error) {
            return false;
        }

        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }

        String host = uri.getHost();
        if (host == null) {
            return false;
        }

        host = host.toLowerCase(Locale.ROOT);
        String primary = applicationHost.toLowerCase(Locale.ROOT);
        return host.equals(primary);
    }
}
