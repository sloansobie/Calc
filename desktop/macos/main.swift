import Cocoa
import Network
import WebKit

// Serve the bundled website only on loopback. WebKit can then load module workers
// normally, without depending on Node, Vite, or a separately running process.
final class AssetServer {
    private let root: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "scientific-calculator.assets")
    private var connections: [UUID: NWConnection] = [:]

    init(root: URL) throws {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
    }

    func start(ready: @escaping (Result<URL, Error>) -> Void) {
        listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                if let port = self.listener.port,
                   let url = URL(string: "http://127.0.0.1:\(port.rawValue)/") {
                    DispatchQueue.main.async { ready(.success(url)) }
                }
            case .failed(let error): DispatchQueue.main.async { ready(.failure(error)) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { return }
            let id = UUID()
            self.connections[id] = connection
            connection.stateUpdateHandler = { [weak self] state in
                if case .cancelled = state { self?.connections.removeValue(forKey: id) }
            }
            connection.start(queue: self.queue)
            self.receive(connection, buffer: Data())
        }
        listener.start(queue: queue)
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var request = buffer
            if let data { request.append(data) }
            if request.count > 16_384 { self.respond(connection, status: "431 Request Header Fields Too Large"); return }
            if let text = String(data: request, encoding: .utf8), text.contains("\r\n\r\n") {
                self.handle(connection, request: text)
            } else if complete || error != nil { connection.cancel() }
            else { self.receive(connection, buffer: request) }
        }
    }

    private func handle(_ connection: NWConnection, request: String) {
        guard let line = request.components(separatedBy: "\r\n").first else { connection.cancel(); return }
        let parts = line.split(separator: " ")
        guard parts.count == 3, parts[0] == "GET" || parts[0] == "HEAD" else {
            respond(connection, status: "405 Method Not Allowed"); return
        }
        let target = String(parts[1]).components(separatedBy: "?")[0]
        guard target.hasPrefix("/"), let path = target.removingPercentEncoding else {
            respond(connection, status: "400 Bad Request"); return
        }
        let relative = path == "/" ? "index.html" : String(path.dropFirst())
        let file = root.appendingPathComponent(relative).standardizedFileURL.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            respond(connection, status: "404 Not Found"); return
        }
        let mime: String
        switch file.pathExtension.lowercased() {
        case "html": mime = "text/html; charset=utf-8"
        case "js", "mjs": mime = "text/javascript; charset=utf-8"
        case "css": mime = "text/css; charset=utf-8"
        case "json": mime = "application/json"
        case "woff2": mime = "font/woff2"
        case "woff": mime = "font/woff"
        case "ttf": mime = "font/ttf"
        case "svg": mime = "image/svg+xml"
        case "png": mime = "image/png"
        case "jpg", "jpeg": mime = "image/jpeg"
        default: mime = "application/octet-stream"
        }
        respond(connection, status: "200 OK", data: data, mime: mime, head: parts[0] == "HEAD")
    }

    private func respond(_ connection: NWConnection, status: String, data: Data = Data(), mime: String = "text/plain", head: Bool = false) {
        let header = "HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n"
        var response = Data(header.utf8)
        if !head { response.append(data) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    func stop() {
        queue.async { [self] in
            listener.cancel()
            for connection in connections.values { connection.cancel() }
            connections.removeAll()
        }
    }
}

@MainActor
final class CalculatorDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var server: AssetServer?
    private var origin: URL?
    private let sessionKey = "calculator.worksheet.v1"
    private var worksheetPanel: NSOpenPanel?
    private var worksheetPaths = UserDefaults.standard.dictionary(forKey: "calculator.worksheet.paths") as? [String: String] ?? [:]
    private var lastRendererRecovery = Date.distantPast

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let iconURL = Bundle.main.url(forResource: "Calculator", withExtension: "png"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApplication.shared.applicationIconImage = icon
        }
        installMenus()
        let controller = WKUserContentController()
        controller.add(self, name: "calculatorNative")
        installBridge(controller)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 660, height: 740),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Calc"
        window.contentMinSize = NSSize(width: 360, height: 100)
        window.appearance = NSAppearance(named: .darkAqua)
        window.titlebarAppearsTransparent = false
        window.isOpaque = false
        window.backgroundColor = NSColor.windowBackgroundColor
        let glass = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: 660, height: 740))
        glass.material = .hudWindow
        glass.blendingMode = .behindWindow
        glass.state = .active
        window.contentView = glass
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.frame = glass.bounds
        webView.autoresizingMask = [.width, .height]
        glass.addSubview(webView)
        window.isReleasedWhenClosed = false
        window.level = .floating
        window.hidesOnDeactivate = false
        window.collectionBehavior = [.managed, .fullScreenPrimary, .canJoinAllApplications]
        window.setFrameAutosaveName("ScientificCalculatorWindow")
        if !window.setFrameUsingName("ScientificCalculatorWindow") { window.center() }
        if !UserDefaults.standard.bool(forKey: "calculator.compactWindow.v2") {
            window.setContentSize(NSSize(width: window.contentLayoutRect.width, height: 120))
            UserDefaults.standard.set(true, forKey: "calculator.compactWindow.v2")
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        do {
            guard let root = Bundle.main.resourceURL?.appendingPathComponent("web") else {
                throw NSError(domain: "Calculator", code: 1, userInfo: [NSLocalizedDescriptionKey:"The bundled calculator is missing."])
            }
            server = try AssetServer(root: root)
            server?.start { [weak self] result in
                guard let self else { return }
                switch result {
                case .success(let url): self.origin = url; self.webView.load(URLRequest(url: url))
                case .failure(let error): self.showError(error)
                }
            }
        } catch { showError(error) }
    }

    private func installBridge(_ controller: WKUserContentController) {
        controller.removeAllUserScripts()
        let saved = UserDefaults.standard.string(forKey: sessionKey)
        let quoted = saved.flatMap { try? JSONSerialization.data(withJSONObject: $0, options: .fragmentsAllowed) }
            .flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        let bridge = """
        (() => {
          const report = value => window.webkit.messageHandlers.calculatorNative.postMessage({action:'error',value:String(value)});
          window.addEventListener('error', event => report(event.error?.stack || event.message));
          window.addEventListener('unhandledrejection', event => report(event.reason?.stack || event.reason));
          const key = 'scientific-session';
          const saved = \(quoted);
          if (saved !== null && localStorage.getItem(key) === null) localStorage.setItem(key, saved);
          const setItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function(name, value) {
            setItem.call(this, name, value);
            if (this === localStorage && name === key) {
              window.webkit.messageHandlers.calculatorNative.postMessage({action:'save', value:String(value)});
            }
          };
          window.calculatorRename = (id,name) => window.webkit.messageHandlers.calculatorNative.postMessage({action:'rename',id,name});
          window.calculatorBrowse = () => window.webkit.messageHandlers.calculatorNative.postMessage({action:'browse'});
          window.calculatorCopy = value => window.webkit.messageHandlers.calculatorNative.postMessage({action:'copy',value:String(value)});
          window.print = () => window.webkit.messageHandlers.calculatorNative.postMessage({action:'print'});
          window.addEventListener('pagehide', () => {
            const value = localStorage.getItem(key);
            if (value !== null) window.webkit.messageHandlers.calculatorNative.postMessage({action:'save', value});
          });
        })();
        """
        controller.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.host == "127.0.0.1",
              message.frameInfo.request.url?.port == origin?.port,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "save", let value = body["value"] as? String,
           let data = value.data(using: .utf8), let session = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           session["rows"] is [Any] {
            UserDefaults.standard.set(value, forKey: sessionKey)
            saveWorksheetFiles(session)
        } else if action == "rename", let id = body["id"] as? String, let name = body["name"] as? String,
                  let path = worksheetPaths[id] {
            let file = URL(fileURLWithPath: path)
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !trimmed.contains("/"), !trimmed.contains(":") else { return }
            let target = file.deletingLastPathComponent().appendingPathComponent(trimmed + ".calc")
            do {
                if target != file { try FileManager.default.moveItem(at: file, to: target) }
                openWorksheet(target)
            } catch { let alert = NSAlert(); alert.messageText = "Could not rename worksheet"; alert.informativeText = error.localizedDescription; alert.runModal() }
        } else if action == "browse" { browseWorksheets()
        } else if action == "copy", let value = body["value"] as? String {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(value, forType: .string)
        } else if action == "print" { printWorksheet(nil) }
        else if action == "error", let value = body["value"] as? String {
            UserDefaults.standard.set(String(value.prefix(12000)), forKey: "calculator.lastFrontendError")
            NSLog("Calculator frontend error: %@", value)
        }
    }

    private var worksheetDirectory: URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Calc Worksheets", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func saveWorksheetFiles(_ session: [String: Any]) {
        guard let worksheets = session["worksheets"] as? [[String: Any]] else { return }
        for worksheet in worksheets {
            guard let id = worksheet["id"] as? String, let name = worksheet["name"] as? String else { continue }
            if worksheetPaths[id] != nil && session["worksheetId"] as? String != id { continue }
            var file: URL
            if let path = worksheetPaths[id] { file = URL(fileURLWithPath: path) }
            else {
                let safe = name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
                file = worksheetDirectory.appendingPathComponent(safe + ".calc")
                if FileManager.default.fileExists(atPath: file.path) { file = worksheetDirectory.appendingPathComponent(safe + "-" + String(id.prefix(8)) + ".calc") }
                worksheetPaths[id] = file.path
            }
            var payload = worksheet
            payload["name"] = file.deletingPathExtension().lastPathComponent
            do {
                let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
                try data.write(to: file, options: .atomic)
            } catch { NSLog("Worksheet save failed: %@", error.localizedDescription) }
        }
        UserDefaults.standard.set(worksheetPaths, forKey: "calculator.worksheet.paths")
    }

    private func openWorksheet(_ file: URL) {
        do {
            let data = try Data(contentsOf: file)
            guard var worksheet = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = worksheet["id"] as? String, let rows = worksheet["rows"] as? [[String: Any]], !rows.isEmpty,
                  rows.allSatisfy({ $0["id"] is String && $0["latex"] is String }) else { throw NSError(domain: "Calc", code: 1, userInfo: [NSLocalizedDescriptionKey: "This is not a Calc worksheet."]) }
            worksheet["name"] = file.deletingPathExtension().lastPathComponent
            worksheetPaths[id] = file.path
            UserDefaults.standard.set(worksheetPaths, forKey: "calculator.worksheet.paths")
            let json = String(data: try JSONSerialization.data(withJSONObject: worksheet), encoding: .utf8)!
            webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('calculator-open-worksheet',{detail: \(json)}))")
        } catch { let alert = NSAlert(); alert.messageText = "Could not open worksheet"; alert.informativeText = error.localizedDescription; alert.runModal() }
    }

    @objc private func browseWorksheets() {
        if let saved = UserDefaults.standard.string(forKey: sessionKey), let data = saved.data(using: .utf8),
           let session = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { saveWorksheetFiles(session) }
        let panel = NSOpenPanel()
        panel.title = "Worksheets"
        panel.message = "Select a worksheet to open, or create or rename a file."
        panel.directoryURL = worksheetDirectory
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedFileTypes = ["calc"]
        panel.prompt = "Open worksheet"
        let controls = NSStackView()
        controls.orientation = .horizontal
        controls.spacing = 10
        for (title, action) in [("New worksheet…", #selector(newWorksheetFile)), ("Rename…", #selector(renameWorksheetFile)), ("Show in Finder", #selector(revealWorksheetFiles))] {
            controls.addArrangedSubview(NSButton(title: title, target: self, action: action))
        }
        controls.frame = NSRect(x: 0, y: 0, width: 420, height: 32)
        panel.accessoryView = controls
        panel.isAccessoryViewDisclosed = true
        worksheetPanel = panel
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self else { return }
            self.worksheetPanel = nil
            if response == .OK, let file = panel.url { self.openWorksheet(file) }
        }
    }

    @objc private func newWorksheetFile() {
        worksheetPanel?.cancel(nil)
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let panel = NSSavePanel()
            panel.title = "New worksheet"
            panel.directoryURL = self.worksheetDirectory
            panel.nameFieldStringValue = "Untitled.calc"
            panel.allowedFileTypes = ["calc"]
            panel.beginSheetModal(for: self.window) { response in
                guard response == .OK, let file = panel.url else { return }
                let worksheet: [String: Any] = ["id": UUID().uuidString, "name": file.deletingPathExtension().lastPathComponent,
                    "rows": [["id": UUID().uuidString, "latex": ""]]]
                do { try JSONSerialization.data(withJSONObject: worksheet, options: [.prettyPrinted]).write(to: file, options: .atomic); self.openWorksheet(file) }
                catch { let alert = NSAlert(); alert.messageText = "Could not create worksheet"; alert.informativeText = error.localizedDescription; alert.runModal() }
            }
        }
    }

    @objc private func renameWorksheetFile() {
        guard let file = worksheetPanel?.url else { NSSound.beep(); return }
        let alert = NSAlert()
        alert.messageText = "Rename worksheet"
        let field = NSTextField(string: file.deletingPathExtension().lastPathComponent)
        field.frame = NSRect(x: 0, y: 0, width: 260, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "Rename"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, !name.contains("/"), !name.contains(":") else { return }
        let target = file.deletingLastPathComponent().appendingPathComponent(name + ".calc")
        do {
            if target != file { try FileManager.default.moveItem(at: file, to: target) }
            worksheetPanel?.cancel(nil)
            openWorksheet(target)
        } catch { let errorAlert = NSAlert(); errorAlert.messageText = "Could not rename worksheet"; errorAlert.informativeText = error.localizedDescription; errorAlert.runModal() }
    }

    @objc private func revealWorksheetFiles() { NSWorkspace.shared.open(worksheetDirectory) }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == origin?.host && url.port == origin?.port {
            if navigationAction.targetFrame?.isMainFrame == true {
                installBridge(webView.configuration.userContentController)
            }
            decisionHandler(.allow)
        }
        else { decisionHandler(.cancel) }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if Date().timeIntervalSince(lastRendererRecovery) > 10 {
            lastRendererRecovery = Date()
            reloadCalculator(nil)
        } else {
            showError(NSError(domain: "Calculator", code: 2, userInfo: [NSLocalizedDescriptionKey: "The calculator display stopped unexpectedly. Your saved worksheet is kept. Quit and reopen the app to try again."]))
        }
    }

    @objc private func reloadCalculator(_ sender: Any?) {
        installBridge(webView.configuration.userContentController)
        webView.reload()
    }

    @objc private func printWorksheet(_ sender: Any?) {
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.topMargin = 24; info.bottomMargin = 24; info.leftMargin = 24; info.rightMargin = 24
        let operation = webView.printOperation(with: info)
        operation.jobTitle = "Calc Worksheet"
        operation.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
    }

    @objc private func newExpression(_ sender: Any?) { evaluate("window.dispatchEvent(new Event('calculator-new-expression'))") }
    @objc private func clearWorksheet(_ sender: Any?) { evaluate("document.querySelector('button.clear')?.click()") }
    @objc private func showHelp(_ sender: Any?) { evaluate("window.dispatchEvent(new Event('calculator-help'))") }
    @objc private func undoWorksheet(_ sender: Any?) { evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true}))") }
    @objc private func redoWorksheet(_ sender: Any?) { evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true}))") }
    @objc private func selectExpression(_ sender: Any?) { evaluate("document.querySelector('.expression-row.active math-field')?.executeCommand('selectAll')") }
    private func evaluate(_ source: String) { webView?.evaluateJavaScript(source, completionHandler: nil) }

    private func installMenus() {
        let bar = NSMenu()
        let appMenu = NSMenu(title: "Calc")
        appMenu.addItem(withTitle:"About Calc", action:#selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent:"")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle:"Hide Calc", action:#selector(NSApplication.hide(_:)), keyEquivalent:"h")
        let hideOthers = appMenu.addItem(withTitle:"Hide Others", action:#selector(NSApplication.hideOtherApplications(_:)), keyEquivalent:"h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle:"Show All", action:#selector(NSApplication.unhideAllApplications(_:)), keyEquivalent:"")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle:"Quit Calc", action:#selector(NSApplication.terminate(_:)), keyEquivalent:"q")
        append(appMenu, to: bar)
        let file = NSMenu(title:"File")
        item("New Expression", #selector(newExpression(_:)), "\r", to:file)
        item("Clear Worksheet", #selector(clearWorksheet(_:)), "k", modifiers:[.command,.shift], to:file)
        item("Reload Calculator", #selector(reloadCalculator(_:)), "r", to:file)
        file.addItem(.separator())
        file.addItem(withTitle:"Close Window", action:#selector(NSWindow.performClose(_:)), keyEquivalent:"w")
        append(file, to:bar)
        let edit = NSMenu(title:"Edit")
        item("Undo", #selector(undoWorksheet(_:)), "z", to:edit)
        item("Redo", #selector(redoWorksheet(_:)), "z", modifiers:[.command,.shift], to:edit)
        edit.addItem(.separator())
        for (title, selector, key) in [("Cut","cut:","x"),("Copy","copy:","c"),("Paste","paste:","v")] {
            edit.addItem(withTitle:title, action:NSSelectorFromString(selector), keyEquivalent:key)
        }
        item("Select All", #selector(selectExpression(_:)), "a", to:edit)
        append(edit, to:bar)
        let windows = NSMenu(title:"Window")
        windows.addItem(withTitle:"Minimize", action:#selector(NSWindow.performMiniaturize(_:)), keyEquivalent:"m")
        windows.addItem(withTitle:"Zoom", action:#selector(NSWindow.performZoom(_:)), keyEquivalent:"")
        append(windows, to:bar); NSApp.windowsMenu = windows
        let help = NSMenu(title:"Help")
        item("Calculator Help", #selector(showHelp(_:)), "?", to:help)
        append(help, to:bar); NSApp.helpMenu = help
        NSApp.mainMenu = bar
    }

    private func item(_ title: String, _ action: Selector, _ key: String, modifiers: NSEvent.ModifierFlags = [.command], to menu: NSMenu) {
        let item = menu.addItem(withTitle:title, action:action, keyEquivalent:key)
        item.target = self; item.keyEquivalentModifierMask = modifiers
    }
    private func append(_ submenu: NSMenu, to bar: NSMenu) {
        let item = NSMenuItem(title:submenu.title, action:nil, keyEquivalent:"")
        item.submenu = submenu; bar.addItem(item)
    }
    private func showError(_ error: Error) {
        let alert = NSAlert(); alert.messageText = "Unable to open the calculator"; alert.informativeText = error.localizedDescription
        alert.runModal()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { server?.stop() }
}

MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = CalculatorDelegate()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}
