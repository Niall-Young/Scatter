import AppKit

private struct GuideOptions {
    let appPath: String
    let iconPath: String?
    let appName: String
    let developmentMode: Bool
    let appearance: String
    let language: String
}

private enum GuideCopy {
    static let settingsURL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
}

private struct GuideStrings {
    let title: String
    let description: String
    let dragSubtitle: String
    let dragHint: String
    let devHint: String
    let done: String

    static func current(language preferredLanguage: String) -> GuideStrings {
        let language = preferredLanguage.lowercased()
        if language.hasPrefix("zh") {
            return GuideStrings(
                title: "开启 Scatter 辅助功能权限",
                description: "Scatter 需要这项权限，才能把生成的提示词发送到 Codex 或 Claude CLI。",
                dragSubtitle: "拖到系统设置",
                dragHint: "将 Scatter 拖到系统设置的辅助功能列表里，然后打开开关。",
                devHint: "开发模式可能授权的是 Electron.app；打包后的应用需要重新授权 Scatter.app。",
                done: "完成"
            )
        }

        return GuideStrings(
            title: "Enable Scatter Accessibility",
            description: "Scatter needs Accessibility permission to send prompts to Codex or Claude CLI.",
            dragSubtitle: "Drag this app into System Settings",
            dragHint: "Drag Scatter to the Accessibility list in System Settings, then turn it on.",
            devHint: "Development mode may authorize Electron.app. Packaged builds must authorize Scatter.app again.",
            done: "Done"
        )
    }
}

private func parseOptions() -> GuideOptions {
    let args = CommandLine.arguments.dropFirst()
    var values: [String: String] = [:]
    var index = args.startIndex

    while index < args.endIndex {
        let key = args[index]
        let next = args.index(after: index)
        if key.hasPrefix("--"), next < args.endIndex {
            values[String(key.dropFirst(2))] = args[next]
            index = args.index(after: next)
        } else {
            index = next
        }
    }

    return GuideOptions(
        appPath: values["app-path"] ?? Bundle.main.bundlePath,
        iconPath: values["icon-path"],
        appName: values["app-name"] ?? "Scatter",
        developmentMode: values["development-mode"] == "true",
        appearance: values["appearance"] ?? "system",
        language: values["language"] ?? "zh"
    )
}

private final class DragAppView: NSView, NSDraggingSource {
    private let appURL: URL
    private let appName: String
    private let image: NSImage
    private let strings: GuideStrings
    private var dragging = false

    init(appURL: URL, appName: String, image: NSImage, strings: GuideStrings) {
        self.appURL = appURL
        self.appName = appName
        self.image = image
        self.strings = strings
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 13
        layer?.borderWidth = 1
        layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.9).cgColor
        layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.74).cgColor
    }

    required init?(coder: NSCoder) {
        nil
    }

    override var intrinsicContentSize: NSSize {
        NSSize(width: 420, height: 76)
    }

    override var mouseDownCanMoveWindow: Bool {
        false
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func updateLayer() {
        layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.9).cgColor
        layer?.backgroundColor = NSColor.controlBackgroundColor.withAlphaComponent(0.74).cgColor
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        drawCell(in: bounds, includeBackground: false)
    }

    private func dragImage() -> NSImage {
        let size = bounds.size.width > 0 && bounds.size.height > 0 ? bounds.size : intrinsicContentSize
        let dragImage = NSImage(size: size)
        dragImage.lockFocus()
        drawCell(in: NSRect(origin: .zero, size: size), includeBackground: true)
        dragImage.unlockFocus()
        return dragImage
    }

    private func drawCell(in rect: NSRect, includeBackground: Bool) {
        if includeBackground {
            let backgroundRect = rect.insetBy(dx: 0.5, dy: 0.5)
            let path = NSBezierPath(roundedRect: backgroundRect, xRadius: 13, yRadius: 13)
            NSColor.controlBackgroundColor.withAlphaComponent(0.96).setFill()
            path.fill()
            NSColor.separatorColor.withAlphaComponent(0.9).setStroke()
            path.lineWidth = 1
            path.stroke()
        }

        let iconRect = NSRect(x: 18, y: rect.midY - 19, width: 38, height: 38)
        image.draw(in: iconRect, from: .zero, operation: .sourceOver, fraction: 1)

        let title = "\(appName).app" as NSString
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 15, weight: .semibold),
            .foregroundColor: NSColor.labelColor
        ]
        title.draw(in: NSRect(x: 70, y: rect.midY + 2, width: rect.width - 96, height: 22), withAttributes: titleAttributes)

        let subtitle = strings.dragSubtitle as NSString
        let subtitleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: .regular),
            .foregroundColor: NSColor.secondaryLabelColor
        ]
        subtitle.draw(in: NSRect(x: 70, y: rect.midY - 19, width: rect.width - 96, height: 18), withAttributes: subtitleAttributes)
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeKey()
    }

    override func mouseDragged(with event: NSEvent) {
        guard !dragging else { return }
        dragging = true
        let draggingItem = NSDraggingItem(pasteboardWriter: appURL as NSURL)
        draggingItem.setDraggingFrame(bounds, contents: dragImage())
        beginDraggingSession(with: [draggingItem], event: event, source: self)
    }

    func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation {
        .copy
    }

    func ignoreModifierKeys(for session: NSDraggingSession) -> Bool {
        true
    }

    func draggingSession(_ session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation) {
        dragging = false
    }
}

private final class AccessibilityGuideApp: NSObject, NSApplicationDelegate {
    private let options: GuideOptions
    private let strings: GuideStrings
    private var panel: NSPanel?

    init(options: GuideOptions) {
        self.options = options
        strings = GuideStrings.current(language: options.language)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        applyAppearance()
        openAccessibilitySettings()
        showPanel()
    }

    private func applyAppearance() {
        switch options.appearance {
        case "dark":
            NSApp.appearance = NSAppearance(named: .darkAqua)
        case "light":
            NSApp.appearance = NSAppearance(named: .aqua)
        default:
            NSApp.appearance = nil
        }
    }

    private func openAccessibilitySettings() {
        guard let url = URL(string: GuideCopy.settingsURL) else { return }
        NSWorkspace.shared.open(url)
    }

    private func showPanel() {
        let panelSize = NSSize(width: 640, height: options.developmentMode ? 424 : 388)
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let origin = NSPoint(
            x: screenFrame.midX - panelSize.width / 2,
            y: screenFrame.midY - panelSize.height / 2
        )
        let panel = NSPanel(
            contentRect: NSRect(origin: origin, size: panelSize),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        panel.title = strings.title
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = false
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true

        let visualEffect = NSVisualEffectView(frame: NSRect(origin: .zero, size: panelSize))
        visualEffect.material = .popover
        visualEffect.blendingMode = .behindWindow
        visualEffect.state = .active
        visualEffect.wantsLayer = true
        visualEffect.layer?.cornerRadius = 22
        visualEffect.layer?.masksToBounds = true

        let tintView = NSView()
        tintView.translatesAutoresizingMaskIntoConstraints = false
        tintView.wantsLayer = true
        tintView.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.62).cgColor

        let heroIcon = NSImageView(image: appIcon())
        heroIcon.imageScaling = .scaleProportionallyUpOrDown
        heroIcon.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            heroIcon.widthAnchor.constraint(equalToConstant: 74),
            heroIcon.heightAnchor.constraint(equalToConstant: 74)
        ])

        let title = label(strings.title, size: 26, weight: .bold, color: .labelColor, alignment: .center)
        let description = label(strings.description, size: 14, weight: .regular, color: .secondaryLabelColor, alignment: .center)
        description.maximumNumberOfLines = 2

        let appURL = URL(fileURLWithPath: options.appPath)
        let dragView = DragAppView(appURL: appURL, appName: options.appName, image: appIcon(), strings: strings)
        dragView.translatesAutoresizingMaskIntoConstraints = false

        let hint = label(strings.dragHint, size: 13, weight: .regular, color: .secondaryLabelColor, alignment: .center)
        hint.maximumNumberOfLines = 2

        let doneButton = NSButton(title: strings.done, target: self, action: #selector(close))
        doneButton.bezelStyle = .rounded
        doneButton.controlSize = .regular
        doneButton.font = .systemFont(ofSize: 13, weight: .medium)
        doneButton.translatesAutoresizingMaskIntoConstraints = false

        visualEffect.addSubview(tintView)
        visualEffect.addSubview(heroIcon)
        visualEffect.addSubview(title)
        visualEffect.addSubview(description)
        visualEffect.addSubview(dragView)
        visualEffect.addSubview(hint)
        visualEffect.addSubview(doneButton)

        var constraints: [NSLayoutConstraint] = [
            tintView.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor),
            tintView.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor),
            tintView.topAnchor.constraint(equalTo: visualEffect.topAnchor),
            tintView.bottomAnchor.constraint(equalTo: visualEffect.bottomAnchor),
            heroIcon.topAnchor.constraint(equalTo: visualEffect.topAnchor, constant: 28),
            heroIcon.centerXAnchor.constraint(equalTo: visualEffect.centerXAnchor),
            heroIcon.widthAnchor.constraint(equalToConstant: 64),
            heroIcon.heightAnchor.constraint(equalToConstant: 64),
            title.topAnchor.constraint(equalTo: heroIcon.bottomAnchor, constant: 20),
            title.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor, constant: 56),
            title.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor, constant: -56),
            description.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 10),
            description.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor, constant: 78),
            description.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor, constant: -78),
            dragView.topAnchor.constraint(equalTo: description.bottomAnchor, constant: 18),
            dragView.centerXAnchor.constraint(equalTo: visualEffect.centerXAnchor),
            dragView.widthAnchor.constraint(equalToConstant: 420),
            dragView.heightAnchor.constraint(equalToConstant: 76),
            hint.topAnchor.constraint(equalTo: dragView.bottomAnchor, constant: 16),
            hint.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor, constant: 74),
            hint.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor, constant: -74),
            doneButton.topAnchor.constraint(greaterThanOrEqualTo: hint.bottomAnchor, constant: 12),
            doneButton.centerXAnchor.constraint(equalTo: visualEffect.centerXAnchor),
            doneButton.bottomAnchor.constraint(equalTo: visualEffect.bottomAnchor, constant: -24),
            doneButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 88),
            doneButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 30)
        ]

        if options.developmentMode {
            let devHint = label(strings.devHint, size: 12, weight: .regular, color: .tertiaryLabelColor, alignment: .center)
            devHint.maximumNumberOfLines = 2
            visualEffect.addSubview(devHint)
            constraints.append(contentsOf: [
                devHint.topAnchor.constraint(equalTo: hint.bottomAnchor, constant: 8),
                devHint.leadingAnchor.constraint(equalTo: visualEffect.leadingAnchor, constant: 78),
                devHint.trailingAnchor.constraint(equalTo: visualEffect.trailingAnchor, constant: -78),
                doneButton.topAnchor.constraint(greaterThanOrEqualTo: devHint.bottomAnchor, constant: 12)
            ])
        }

        NSLayoutConstraint.activate(constraints)

        panel.contentView = visualEffect
        self.panel = panel
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func label(_ text: String, size: CGFloat, weight: NSFont.Weight, color: NSColor, alignment: NSTextAlignment) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = .systemFont(ofSize: size, weight: weight)
        field.textColor = color
        field.alignment = alignment
        field.lineBreakMode = .byWordWrapping
        field.maximumNumberOfLines = 0
        field.translatesAutoresizingMaskIntoConstraints = false
        return field
    }

    private func appIcon() -> NSImage {
        if let iconPath = options.iconPath, let icon = NSImage(contentsOfFile: iconPath) {
            return icon
        }
        let appURL = URL(fileURLWithPath: options.appPath)
        let icon = NSWorkspace.shared.icon(forFile: appURL.path)
        icon.size = NSSize(width: 128, height: 128)
        return icon
    }

    @objc private func close() {
        panel?.close()
        NSApp.terminate(nil)
    }
}

@main
private enum AccessibilityGuideMain {
    static func main() {
        let options = parseOptions()
        let app = NSApplication.shared
        let delegate = AccessibilityGuideApp(options: options)
        app.delegate = delegate
        app.run()
    }
}
