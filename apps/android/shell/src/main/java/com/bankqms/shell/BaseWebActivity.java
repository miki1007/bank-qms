package com.bankqms.shell;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public abstract class BaseWebActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorPanel;
    private String applicationHost;

    protected abstract String getStartUrl();
    protected abstract String getApplicationLabel();
    protected abstract int getAccentColor();
    protected abstract String getUserAgentSuffix();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri startUri = Uri.parse(getStartUrl());
        applicationHost = startUri.getHost();
        if (applicationHost == null || !"https".equalsIgnoreCase(startUri.getScheme())) {
            throw new IllegalStateException("Bank QMS Android apps require an HTTPS start URL");
        }

        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        setContentView(buildContentView());
        configureWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(getStartUrl());
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private View buildContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245, 249, 247));

        webView = new WebView(this);
        webView.setAlpha(0f);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(ColorStateList.valueOf(getAccentColor()));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3));
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(34), dp(34), dp(34), dp(34));
        errorPanel.setVisibility(View.GONE);

        TextView mark = new TextView(this);
        mark.setText("BQ");
        mark.setTextColor(Color.WHITE);
        mark.setTextSize(24);
        mark.setGravity(Gravity.CENTER);
        mark.setBackgroundResource(android.R.drawable.btn_default);
        mark.setBackgroundTintList(ColorStateList.valueOf(getAccentColor()));
        LinearLayout.LayoutParams markParams = new LinearLayout.LayoutParams(dp(62), dp(62));
        markParams.bottomMargin = dp(20);
        errorPanel.addView(mark, markParams);

        TextView title = new TextView(this);
        title.setText("Connection interrupted");
        title.setTextColor(Color.rgb(16, 40, 33));
        title.setTextSize(23);
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);

        TextView description = new TextView(this);
        description.setText("Your safe screen is preserved. Check your connection, then try again.");
        description.setTextColor(Color.rgb(100, 115, 110));
        description.setTextSize(15);
        description.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams descriptionParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        descriptionParams.topMargin = dp(10);
        descriptionParams.bottomMargin = dp(22);
        errorPanel.addView(description, descriptionParams);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setAllCaps(false);
        retry.setTextColor(Color.WHITE);
        retry.setTextSize(15);
        retry.setBackgroundTintList(ColorStateList.valueOf(getAccentColor()));
        retry.setOnClickListener(view -> {
            showError(false);
            webView.reload();
        });
        errorPanel.addView(retry, new LinearLayout.LayoutParams(dp(180), dp(52)));

        FrameLayout.LayoutParams errorParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(errorPanel, errorParams);
        return root;
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " " + getUserAgentSuffix());
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                showError(false);
                view.animate().alpha(1f).setDuration(420).start();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showError(true);
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError(true);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
            }
        });

        webView.setDownloadListener(createDownloadListener());
    }

    private boolean handleNavigation(Uri uri) {
        if (TrustedNavigationPolicy.isTrusted(uri, applicationHost)) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No application can open this link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            if (!TrustedNavigationPolicy.isTrusted(uri, applicationHost)) {
                Toast.makeText(this, "Blocked an untrusted download.", Toast.LENGTH_SHORT).show();
                return;
            }

            String rawName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            String safeName = rawName.replaceAll("[^A-Za-z0-9._-]", "_");
            if (safeName.isEmpty()) {
                safeName = "bank-qms-export.csv";
            }

            try {
                DownloadManager.Request request = new DownloadManager.Request(uri);
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null && !cookie.isEmpty()) {
                    request.addRequestHeader("Cookie", cookie);
                }
                request.setTitle(safeName);
                request.setDescription("Downloaded by " + getApplicationLabel());
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(
                        this, Environment.DIRECTORY_DOWNLOADS, safeName);
                DownloadManager manager =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "Download started.", Toast.LENGTH_SHORT).show();
            } catch (IllegalArgumentException | SecurityException error) {
                Toast.makeText(this, "The download could not be started.", Toast.LENGTH_SHORT).show();
            }
        };
    }

    private void showError(boolean visible) {
        errorPanel.setVisibility(visible ? View.VISIBLE : View.GONE);
        webView.setVisibility(visible ? View.INVISIBLE : View.VISIBLE);
        if (visible) {
            progressBar.setVisibility(View.GONE);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        webView.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
