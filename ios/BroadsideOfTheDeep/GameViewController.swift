import UIKit
import WebKit

/// Hosts the bundled HTML5 game (Resources/web) full-screen, with native haptics.
final class GameViewController: UIViewController, WKNavigationDelegate {
    private var webView: WKWebView!
    private let haptics = HapticBridge()

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(WeakMessageHandler(haptics), name: "haptic")
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = UIColor(named: "LaunchBackground")
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { web.isInspectable = false }
        webView = web
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadGame()
    }

    private func loadGame() {
        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            assertionFailure("web/index.html missing from app bundle")
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    func pauseGame() { webView?.evaluateJavaScript("window.__appPause && window.__appPause()", completionHandler: nil) }
    func resumeAudio() { webView?.evaluateJavaScript("window.__appResume && window.__appResume()", completionHandler: nil) }

    // Keep all navigation inside the bundled game.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.request.url?.isFileURL == true ? .allow : .cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { loadGame() }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
}

/// Receives `window.webkit.messageHandlers.haptic.postMessage(kind)` from the game.
final class HapticBridge: NSObject, WKScriptMessageHandler {
    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selection = UISelectionFeedbackGenerator()
    private let notify = UINotificationFeedbackGenerator()

    override init() {
        super.init()
        [light, medium, heavy].forEach { $0.prepare() }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let kind = message.body as? String else { return }
        switch kind {
        case "select": selection.selectionChanged()
        case "light": light.impactOccurred(); light.prepare()
        case "medium": medium.impactOccurred(); medium.prepare()
        case "heavy": heavy.impactOccurred(); heavy.prepare()
        case "success": notify.notificationOccurred(.success)
        case "error": notify.notificationOccurred(.error)
        default: light.impactOccurred()
        }
    }
}

/// Avoids the retain cycle WKUserContentController creates with its handlers.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
