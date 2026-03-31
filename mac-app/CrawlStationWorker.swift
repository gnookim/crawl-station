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
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let running = shellOutput("/bin/bash", ["-c", "launchctl list 2>/dev/null | grep crawlstation"])
            let isUp = !running.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

            var wid = "-"
            var ver = "-"

            // .env
            if let content = try? String(contentsOfFile: "\(workerDir)/.env", encoding: .utf8) {
                for line in content.components(separatedBy: .newlines) {
                    let trimmed = line.trimmingCharacters(in: .whitespaces)
                    let parts = trimmed.split(separator: "=", maxSplits: 1)
                    guard parts.count == 2 else { continue }
                    let key = String(parts[0])
                    let val = String(parts[1])
                    if key == "WORKER_ID" { wid = val }
                }
            }

            // version from worker.py
            if let content = try? String(contentsOfFile: "\(workerDir)/worker.py", encoding: .utf8) {
                for line in content.components(separatedBy: .newlines) {
                    if line.contains("VERSION") && line.contains("=") {
                        let val = line.replacingOccurrences(of: "\"", with: "")
                            .replacingOccurrences(of: "'", with: "")
                            .split(separator: "=").last?
                            .trimmingCharacters(in: .whitespaces) ?? "-"
                        ver = val
                        break
                    }
                }
            }

            // logs
            let logOutput = shellOutput("/usr/bin/tail", ["-30", "\(workerDir)/logs/worker.log"])
            let lines = logOutput.components(separatedBy: .newlines).filter { !$0.isEmpty }

            var processed = 0
            var errors = 0
            if let allLog = try? String(contentsOfFile: "\(workerDir)/logs/worker.log", encoding: .utf8) {
                for logLine in allLog.components(separatedBy: .newlines) {
                    let lower = logLine.lowercased()
                    if lower.contains("completed") || logLine.contains("완료") { processed += 1 }
                    if lower.contains("error") || logLine.contains("실패") { errors += 1 }
                }
            }

            DispatchQueue.main.async {
                self.isRunning = isUp
                self.workerID = wid
                self.version = ver
                self.logLines = lines
                self.totalProcessed = processed
                self.errorCount = errors
                if let last = lines.last, !last.isEmpty {
                    self.lastSeen = String(last.prefix(19))
                }
            }

            // station check (async already)
            self.checkStation()
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
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            _ = shellOutput("/bin/launchctl", ["load", plistPath])
            Thread.sleep(forTimeInterval: 1.5)
            refresh()
        }
    }

    func stop() {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            _ = shellOutput("/bin/launchctl", ["unload", plistPath])
            Thread.sleep(forTimeInterval: 1.5)
            refresh()
        }
    }

    func restart() {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            _ = shellOutput("/bin/launchctl", ["unload", plistPath])
            Thread.sleep(forTimeInterval: 1.5)
            _ = shellOutput("/bin/launchctl", ["load", plistPath])
            Thread.sleep(forTimeInterval: 1.5)
            refresh()
        }
    }

    func uninstall() {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            _ = shellOutput("/bin/launchctl", ["unload", plistPath])
            Thread.sleep(forTimeInterval: 0.5)
            try? FileManager.default.removeItem(atPath: plistPath)
            try? FileManager.default.removeItem(atPath: workerDir)
            try? FileManager.default.removeItem(atPath: "/Applications/CrawlStation Worker.app")
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }

    func openLogFile() {
        let logPath = "\(workerDir)/logs/worker.log"
        NSWorkspace.shared.open(URL(fileURLWithPath: logPath))
    }

    private func shellOutput(_ executable: String, _ args: [String]) -> String {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: executable)
        task.arguments = args
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        do {
            try task.run()
            task.waitUntilExit()
        } catch {
            return ""
        }
        return String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }
}

// MARK: - UI

struct ContentView: View {
    @StateObject private var manager = WorkerManager()
    @State private var showUninstallAlert = false
    @State private var selectedTab = 0

    var body: some View {
        VStack(spacing: 0) {
            headerView
            Divider()
            statusCards.padding(16)
            Divider()
            tabBar
            Divider()
            Group {
                if selectedTab == 0 {
                    logView
                } else {
                    infoView
                }
            }
            .frame(maxHeight: .infinity)
            Divider()
            controlBar
        }
        .background(Color(NSColor.windowBackgroundColor))
        .alert("CrawlStation Worker 삭제", isPresented: $showUninstallAlert) {
            Button("취소", role: .cancel) {}
            Button("삭제", role: .destructive) { manager.uninstall() }
        } message: {
            Text("워커 서비스, 설정, 데이터가 모두 삭제됩니다.\n정말 삭제하시겠습니까?")
        }
    }

    var headerView: some View {
        HStack(spacing: 12) {
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
            HStack(spacing: 6) {
                Circle()
                    .fill(manager.isRunning ? Color.green : Color.gray)
                    .frame(width: 8, height: 8)
                Text(manager.isRunning ? "실행 중" : "중지됨")
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
            StatusCard(title: "Station",
                       value: manager.stationConnected ? "연결됨" : "오프라인",
                       color: manager.stationConnected ? .green : .orange,
                       icon: "antenna.radiowaves.left.and.right")
            StatusCard(title: "버전",
                       value: "v\(manager.version)",
                       color: .blue, icon: "tag")
            StatusCard(title: "처리",
                       value: "\(manager.totalProcessed)",
                       color: .purple, icon: "checkmark.circle")
            StatusCard(title: "에러",
                       value: "\(manager.errorCount)",
                       color: manager.errorCount > 0 ? .red : .gray,
                       icon: "exclamationmark.triangle")
        }
    }

    var tabBar: some View {
        HStack(spacing: 0) {
            TabButton(title: "로그", isSelected: selectedTab == 0) { selectedTab = 0 }
            TabButton(title: "정보", isSelected: selectedTab == 1) { selectedTab = 1 }
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
                InfoRow(label: "워커 ID", value: manager.workerID)
                InfoRow(label: "버전", value: "v\(manager.version)")
                InfoRow(label: "Station", value: manager.stationConnected ? "연결됨" : "오프라인")
                InfoRow(label: "상태", value: manager.isRunning ? "실행 중" : "중지됨")
                InfoRow(label: "처리 건수", value: "\(manager.totalProcessed)")
                InfoRow(label: "에러 건수", value: "\(manager.errorCount)")
                Divider()
                InfoRow(label: "설치 경로", value: "~/CrawlWorker")
                InfoRow(label: "로그", value: "~/CrawlWorker/logs/worker.log")
                InfoRow(label: "LaunchAgent", value: "com.crawlstation.worker")
                Button(action: { manager.openLogFile() }) {
                    Label("로그 파일 열기", systemImage: "doc.text")
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
                ControlButton(title: "중지", icon: "stop.fill", color: .orange) {
                    manager.stop()
                }
                ControlButton(title: "재시작", icon: "arrow.clockwise", color: .blue) {
                    manager.restart()
                }
            } else {
                ControlButton(title: "시작", icon: "play.fill", color: .green) {
                    manager.start()
                }
            }
            Spacer()
            Button(action: { showUninstallAlert = true }) {
                Text("삭제")
                    .font(.system(size: 11))
                    .foregroundColor(.red)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
    }

    func logColor(for line: String) -> Color {
        let lower = line.lowercased()
        if lower.contains("error") || line.contains("실패") {
            return .red
        }
        if lower.contains("warning") {
            return .orange
        }
        if lower.contains("completed") || line.contains("완료") || line.contains("시작") {
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
                Rectangle().fill(Color.blue).frame(height: 2)
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
                Image(systemName: icon).font(.system(size: 10))
                Text(title).font(.system(size: 12, weight: .medium))
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
