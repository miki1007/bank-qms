import SwiftUI
import UIKit
import WebKit

@MainActor
final class WebAppState: ObservableObject {
    @Published var loading = true
    @Published var offline = false
    @Published var progress = 0.0
    weak var webView: WKWebView?

    func retry() {
        offline = false
        loading = true
        webView?.reload()
    }
}

struct SecureWebApp: View {
    let title: String
    let accent: Color
    @StateObject private var state = WebAppState()

    private var startURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "BankQMSStartURL") as? String,
            let url = URL(string: raw),
            url.scheme?.lowercased() == "https",
            url.host != nil
        else {
            preconditionFailure("BankQMSStartURL must be an absolute HTTPS URL")
        }
        return url
    }

    var body: some View {
        ZStack {
            SecureWebView(startURL: startURL, state: state)
                .ignoresSafeArea(edges: .bottom)
                .opacity(state.offline ? 0 : 1)

            if state.offline {
                VStack(spacing: 18) {
                    Text("BQ")
                        .font(.title.bold())
                        .foregroundStyle(.white)
                        .frame(width: 68, height: 68)
                        .background(accent.gradient, in: RoundedRectangle(cornerRadius: 20))
                    Text("Connection interrupted")
                        .font(.title2.bold())
                    Text("Your last safe screen is preserved. Check your connection, then try again.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { state.retry() }
                        .buttonStyle(.borderedProminent)
                        .tint(accent)
                }
                .padding(34)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if state.loading {
                ProgressView(value: state.progress)
                    .progressViewStyle(.linear)
                    .tint(accent)
            }
        }
    }
}

private struct SecureWebView: UIViewRepresentable {
    let startURL: URL
    @ObservedObject var state: WebAppState

    func makeCoordinator() -> Coordinator { Coordinator(startURL: startURL, state: state) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.isFraudulentWebsiteWarningEnabled = true
        configuration.allowsInlineMediaPlayback = false

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, *) {
            webView.isInspectable = _isDebugAssertConfiguration()
        }
        webView.customUserAgent = "BankQMS-iOS/1.0"
        context.coordinator.observe(webView)
        state.webView = webView
        webView.load(URLRequest(url: startURL, cachePolicy: .useProtocolCachePolicy))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopObserving(webView)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private let trustedHost: String
        private let state: WebAppState
        private var progressObservation: NSKeyValueObservation?

        init(startURL: URL, state: WebAppState) {
            trustedHost = startURL.host!.lowercased()
            self.state = state
        }

        func observe(_ webView: WKWebView) {
            progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.state.progress = view.estimatedProgress }
            }
        }

        func stopObserving(_ webView: WKWebView) {
            progressObservation?.invalidate()
            progressObservation = nil
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            let trusted = url.scheme?.lowercased() == "https" && url.host?.lowercased() == trustedHost
            if trusted { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            if ["https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            state.loading = false
            state.offline = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            state.loading = false
            state.offline = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            state.loading = false
            state.offline = true
        }

        func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
            completionHandler(.performDefaultHandling, nil)
        }
    }
}
