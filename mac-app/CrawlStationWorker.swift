import SwiftUI
import Cocoa

// MARK: - App Entry Point

@main
struct CrawlStationWorkerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 480, minHeight: 520)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 480, height: 520)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

// MARK: - Worker Manager

class WorkerManager: ObservableObject {
    @Published var isRunning = false
    @Published var workerID = "-"
    @Published var version = "-"
    @Published var stationConnected = false
    @Published var lastSeen = "-"
    @Published var logLines: [String] = []
    @Published var totalProcessed = 0
    @Published var errorCount = 0

    private let workerDir: String
    private let plistPath: String
    private let stationURL: String
    private var timer: Timer?

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        workerDir = "\(home)/CrawlWorker"
        plistPath = "\(home)/Library/LaunchAgents/com.crawlstation.worker.plist"
        stationURL = "https://crawl-station.vercel.app"
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    func refresh() {
        checkRunning()
        loadEnv()
        loadVersion()
        loadLogs()
        checkStation()
    }

    private func checkRunning() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", "launchctl list 2>/dev/null | grep crawlstation"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        try? task.run()
        task.waitUntilExit()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        DispatchQueue.main.async {
            self.isRunning = !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private func loadEnv() {
        let envPath = "\(workerDir)/.env"
        guard let content = try? String(contentsOfFile: envPath, encoding: .utf8) else { return }
        for line in content.components(separatedBy: .newlines) {
            let parts = line.split(separator: "=", maxSplits: 1)
            guard parts.count == 2 else { continue }
            let key = String(parts[0]).trimmingCharacters(in: .whitespaces)
            let val = String(parts[1]).trimmingCharacters(in: .whitespaces)
            DispatchQueue.main.async {
                if key == "WORKER_ID" { self.workerID = val }
            }
        }
    }

    private func loadVersion() {
        let workerPy = "\(workerDir)/worker.py"
        guard let content = try? String(contentsOfFile: workerPy, encoding: .utf8) else { return }
        for line in content.components(separatedBy: .newlines) {
            if line.contains("VERSION") && line.contains("=") {
                let val = line.replacingOccurrences(of: "\"", with: "")
                    .replacingOccurrences(of: "'", with: "")
                    .split(separator: "=").last?
                    .trimmingCharacters(in: .whitespaces) ?? "-"
                DispatchQueue.main.async { self.version = val }
                break
            }
        }
    }

    private func loadLogs() {
        let logPath = "\(workerDir)/logs/worker.log"
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/tail")
        task.arguments = ["-30", logPath]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        try? task.run()
        task.waitUntilExit()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let lines = output.components(separatedBy: .newlines).filter { !$0.isEmpty }

        var processed = 0
        var errors = 0
        let allLog = (try? String(contentsOfFile: logPath, encoding: .utf8)) ?? ""
        for line in allLog.components(separatedBy: .newlines) {
            if line.contains("completed") || line.contains("완료") { processed += 1 }
            if line.contains("ERROR") || line.contains("error") || line.contains("실패") { errors += 1 }
        }

        DispatchQueue.main.async {
            self.logLines = lines
            self.totalProcessed = processed
            self.errorCount = errors
            if let last = lines.last, !last.isEmpty {
                self.lastSeen = String(last.prefix(19))
            }
        }
    }

    private func checkStation() {
        guard let url = URL(string: "\(stationURL)/api/workers") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 5
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { self.stationConnected = ok }
        }.resume()
    }

    func start() {
        runShell("launchctl load \"\(plistPath)\" 2>/dev/null")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.refresh() }
    }

    func stop() {
        runShell("launchctl unload \"\(plistPath)\" 2>/dev/null")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.refresh() }
    }

    func restart() {
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            self.start()
        }
    }

    func uninstall() {
        stop()
        runShell("rm -f \"\(plistPath)\"")
        runShell("rm -rf \"\(workerDir)\"")
        runShell("rm -rf \"/Applications/CrawlStation Worker.app\"")
        NSApplication.shared.terminate(nil)
    }

    func openLogFile() {
        let logPath = "\(workerDir)/logs/worker.log"
        NSWorkspace.shared.open(URL(fileURLWithPath: logPath))
    }

    private func runShell(_ cmd: String) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = ["-c", cmd]
        task.standardOutput = Pipe()
        task.standardError = Pipe()
        try? task.run()
        task.waitUntilExit()
    }
}

// MARK: - UI

struct ContentView: View {
    @StateObject private var manager = WorkerManager()
    @State private var showUninstallAlert = false
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView
            Divider()

            // Status Cards
            statusCards
                .padding(16)

            Divider()

            // Tabs
            tabBar
            Divider()

            // Tab Content
            Group {
                if selectedTab == 0 {
                    logView
                } else {
                    infoView
                }
            }
            .frame(maxHeight: .infinity)

            Divider()

            // Bottom Controls
            controlBar
        }
        .background(Color(NSColor.windowBackgroundColor))
        .alert("CrawlStation Worker \uC0AD\uC81C", isPresented: $showUninstallAlert) {
            Button("\uCDE8\uC18C", role: .cancel) {}
            Button("\uC0AD\uC81C", role: .destructive) { manager.uninstall() }
        } message: {
            Text("\uC6CC\uCEE4 \uC11C\uBE44\uC2A4, \uC124\uC815, \uB370\uC774\uD130\uAC00 \uBAA8\uB450 \uC0AD\uC81C\uB429\uB2C8\uB2E4.\n\uC815\uB9D0 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?")
        }
    }

    var headerView: some View {
        HStack(spacing: 12) {
            // App icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(LinearGradient(
                        colors: [Color.blue, Color.blue.opacity(0.7)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: 40, height: 40)
                Text("CW")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("CrawlStation Worker")
                    .font(.system(size: 15, weight: .semibold))
                Text(manager.workerID)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.secondary)
            }

            Spacer()

            // Status indicator
            HStack(spacing: 6) {
                Circle()
                    .fill(manager.isRunning ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                Text(manager.isRunning ? "\uC2E4\uD589 \uC911" : "\uC911\uC9C0\uB428")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(manager.isRunning ? .green : .secondary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(manager.isRunning
                          ? Color.green.opacity(0.1)
                          : Color.gray.opacity(0.1))
            )
        }
        .padding(16)
    }

    var statusCards: some View {
        HStack(spacing: 10) {
            StatusCard(
                title: "Station",
                value: manager.stationConnected ? "\uC5F0\uACB0\uB428" : "\uC624\uD504\uB77C\uC778",
                color: manager.stationConnected ? .green : .orange,
                icon: "antenna.radiowaves.left.and.right"
            )
            StatusCard(
                title: "\uBC84\uC804",
                value: "v\(manager.version)",
                color: .blue,
                icon: "tag"
            )
            StatusCard(
                title: "\uCC98\uB9AC",
                value: "\(manager.totalProcessed)",
                color: .purple,
                icon: "checkmark.circle"
            )
            StatusCard(
                title: "\uC5D0\uB7EC",
                value: "\(manager.errorCount)",
                color: manager.errorCount > 0 ? .red : .gray,
                icon: "exclamationmark.triangle"
            )
        }
    }

    var tabBar: some View {
        HStack(spacing: 0) {
            TabButton(title: "\uB85C\uADF8", isSelected: selectedTab == 0) { selectedTab = 0 }
            TabButton(title: "\uC815\uBCF4", isSelected: selectedTab == 1) { selectedTab = 1 }
            Spacer()
            Button(action: { manager.refresh() }) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
            .padding(.trailing, 12)
        }
        .padding(.leading, 4)
    }

    var logView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    ForEach(Array(manager.logLines.enumerated()), id: \.offset) { idx, line in
                        Text(line)
                            .font(.system(size: 10.5, design: .monospaced))
                            .foregroundColor(logColor(for: line))
                            .textSelection(.enabled)
                            .id(idx)
                    }
                }
                .padding(10)
            }
            .background(Color(NSColor.textBackgroundColor).opacity(0.5))
            .onChange(of: manager.logLines.count) { _ in
                if let last = manager.logLines.indices.last {
                    proxy.scrollTo(last, anchor: .bottom)
                }
            }
        }
    }

    var infoView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                InfoRow(label: "\uC6CC\uCEE4 ID", value: manager.workerID)
                InfoRow(label: "\uBC84\uC804", value: "v\(manager.version)")
                InfoRow(label: "Station", value: manager.stationConnected ? "\uC5F0\uACB0\uB428" : "\uC624\uD504\uB77C\uC778")
                InfoRow(label: "\uC0C1\uD0DC", value: manager.isRunning ? "\uC2E4\uD589 \uC911" : "\uC911\uC9C0\uB428")
                InfoRow(label: "\uCC98\uB9AC \uAC74\uC218", value: "\(manager.totalProcessed)")
                InfoRow(label: "\uC5D0\uB7EC \uAC74\uC218", value: "\(manager.errorCount)")
                Divider()
                InfoRow(label: "\uC124\uCE58 \uACBD\uB85C", value: "~/CrawlWorker")
                InfoRow(label: "\uB85C\uADF8", value: "~/CrawlWorker/logs/worker.log")
                InfoRow(label: "LaunchAgent", value: "com.crawlstation.worker")

                Button(action: { manager.openLogFile() }) {
                    Label("\uB85C\uADF8 \uD30C\uC77C \uC5F4\uAE30", systemImage: "doc.text")
                        .font(.system(size: 12))
                }
                .padding(.top, 4)
            }
            .padding(16)
        }
    }

    var controlBar: some View {
        HStack(spacing: 8) {
            if manager.isRunning {
                ControlButton(title: "\uC911\uC9C0", icon: "stop.fill", color: .orange) {
                    manager.stop()
                }
                ControlButton(title: "\uC7AC\uC2DC\uC791", icon: "arrow.clockwise", color: .blue) {
                    manager.restart()
                }
            } else {
                ControlButton(title: "\uC2DC\uC791", icon: "play.fill", color: .green) {
                    manager.start()
                }
            }

            Spacer()

            Button(action: { showUninstallAlert = true }) {
                Text("\uC0AD\uC81C")
                    .font(.system(size: 11))
                    .foregroundColor(.red)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
    }

    func logColor(for line: String) -> Color {
        if line.contains("ERROR") || line.contains("error") || line.contains("\uC2E4\uD328") {
            return .red
        }
        if line.contains("WARNING") || line.contains("warning") {
            return .orange
        }
        if line.contains("completed") || line.contains("\uC644\uB8CC") || line.contains("\uC2DC\uC791") {
            return .green
        }
        return .primary.opacity(0.8)
    }
}

// MARK: - Components

struct StatusCard: View {
    let title: String
    let value: String
    let color: Color
    let icon: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(color)
            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.primary)
            Text(title)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(NSColor.controlBackgroundColor))
        )
    }
}

struct TabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: isSelected ? .semibold : .regular))
                .foregroundColor(isSelected ? .blue : .secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            if isSelected {
                Rectangle()
                    .fill(Color.blue)
                    .frame(height: 2)
            }
        }
    }
}

struct ControlButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 10))
                Text(title)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 6).fill(color))
        }
        .buttonStyle(.plain)
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .trailing)
            Text(value)
                .font(.system(size: 12, design: .monospaced))
                .textSelection(.enabled)
            Spacer()
        }
    }
}
