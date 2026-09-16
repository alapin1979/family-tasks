import SwiftUI

// Chronological points ledger, a faithful port of PointsHistory.tsx. Builds a
// unified timeline from completions, reward claims, penalties, adjustments and
// task-rate edits, plus the same formula summary and day-scoped correction form.

enum LedgerType { case earned, spent, autoPenalty, manualPenalty, adjustment, taskEdit }

struct LedgerEntry: Identifiable {
    let id = UUID()
    let type: LedgerType
    let sortKey: String
    let points: Int
    let label: String
    let date: String
    let note: String?
}

enum Ledger {
    private static func datePart(_ iso: String) -> String { String(iso.prefix(while: { $0 != "T" })) }

    static func build(_ childId: String, _ s: AppState) -> [LedgerEntry] {
        var out: [LedgerEntry] = []
        let today = Logic.todayStr()

        for comp in s.completions where comp.childId == childId && comp.approved == true {
            let task = s.tasks.first { $0.id == comp.taskId }
            let normal = task.map { Logic.rewardForDate($0, comp.date) } ?? 0
            let pts = comp.adjustedReward ?? normal
            var notes: [String] = []
            if let adj = comp.adjustedReward, adj != normal { notes.append("изменено родителем: \(normal) → \(adj) ⭐") }
            if let c = comp.parentComment, !c.isEmpty { notes.append(c) }
            out.append(LedgerEntry(type: .earned, sortKey: comp.completedAt, points: pts,
                                   label: task?.title ?? "Удалённое задание", date: comp.date,
                                   note: notes.isEmpty ? nil : notes.joined(separator: " · ")))
        }

        for claim in s.rewardClaims where claim.childId == childId && claim.approved {
            let reward = s.rewards.first { $0.id == claim.rewardId }
            let cost = claim.rewardCost ?? reward?.cost ?? 0
            let title = claim.rewardTitle ?? reward?.title ?? "Удалённая награда"
            out.append(LedgerEntry(type: .spent, sortKey: claim.claimedAt, points: -cost,
                                   label: title, date: datePart(claim.claimedAt), note: nil))
        }

        for p in s.manualPenalties where p.childId == childId {
            let entryDate = p.forDate ?? datePart(p.createdAt)
            let backdated = (p.forDate != nil && p.forDate != datePart(p.createdAt))
                ? "внесено \(RuDate.dayMonthYear(datePart(p.createdAt)))" : nil
            out.append(LedgerEntry(type: .manualPenalty, sortKey: p.createdAt, points: -p.amount,
                                   label: p.reason, date: entryDate, note: backdated))
        }

        for a in s.manualAdjustments where a.childId == childId {
            let task = a.taskId.flatMap { id in s.tasks.first { $0.id == id } }
            let label = task.map { "\(a.reason) (\($0.title))" } ?? a.reason
            let entryDate = a.forDate ?? datePart(a.createdAt)
            let backdated = (a.forDate != nil && a.forDate != datePart(a.createdAt))
                ? "внесено \(RuDate.dayMonthYear(datePart(a.createdAt)))" : nil
            out.append(LedgerEntry(type: .adjustment, sortKey: a.createdAt, points: a.amount,
                                   label: label, date: entryDate, note: backdated))
        }

        for log in s.taskEditLog where log.childIds.contains(childId) {
            let fieldLabel = log.field == "reward" ? "награда" : "штраф"
            out.append(LedgerEntry(type: .taskEdit, sortKey: log.changedAt, points: 0,
                                   label: log.taskTitle, date: datePart(log.changedAt),
                                   note: "\(fieldLabel): \(log.oldValue) → \(log.newValue) ⭐"))
        }

        for task in s.tasks {
            if task.pendingApproval == true { continue }
            if !task.assignedTo.contains(childId) { continue }
            if task.recurrence == "once" || task.reportAtEnd {
                if task.endDate < today {
                    let penalty = Logic.penaltyForDate(task, task.endDate)
                    if penalty == 0 { continue }
                    let hasValid = s.completions.contains { $0.taskId == task.id && $0.childId == childId && ($0.approved == true || $0.approved == nil) }
                    if !hasValid && !Logic.isAutoPenaltyWaived(s.manualAdjustments, task, childId, task.endDate) {
                        out.append(LedgerEntry(type: .autoPenalty, sortKey: task.endDate + "T23:59:59",
                                               points: -penalty, label: task.title, date: task.endDate, note: "не выполнено"))
                    }
                }
            } else {
                for date in Logic.getScheduledDatesBefore(task, today) {
                    let penalty = Logic.penaltyForDate(task, date)
                    if penalty == 0 { continue }
                    let hasValid = s.completions.contains { $0.taskId == task.id && $0.childId == childId && $0.date == date && ($0.approved == true || $0.approved == nil) }
                    if !hasValid && !Logic.isAutoPenaltyWaived(s.manualAdjustments, task, childId, date) {
                        out.append(LedgerEntry(type: .autoPenalty, sortKey: date + "T23:59:59",
                                               points: -penalty, label: task.title, date: date, note: "пропущено"))
                    }
                }
            }
        }

        return out.sorted { $0.sortKey > $1.sortKey }
    }

    static func meta(_ t: LedgerType) -> (icon: String, label: String, bg: Color) {
        switch t {
        case .earned:        return ("✅", "Задание выполнено",   Theme.green)
        case .spent:         return ("🎁", "Приз получен",        Theme.purple)
        case .autoPenalty:   return ("⏰", "Штраф за пропуск",    Theme.red)
        case .manualPenalty: return ("⚡", "Штраф от родителя",   Theme.red)
        case .adjustment:    return ("🔧", "Корректировка баланса", .blue)
        case .taskEdit:      return ("📝", "Изменено задание",    .gray)
        }
    }
    static func pointsColor(_ e: LedgerEntry) -> Color {
        switch e.type {
        case .earned: return Theme.green
        case .spent: return Theme.purple
        case .autoPenalty, .manualPenalty: return Theme.red
        case .taskEdit: return .secondary
        case .adjustment: return e.points >= 0 ? Theme.green : Theme.orange
        }
    }
}

struct PointsHistoryView: View {
    @EnvironmentObject var store: Store
    let childId: String

    @State private var filtering = false
    @State private var day = Date()
    @State private var showCorrection = false
    @State private var corrAmount = 0
    @State private var corrReason = ""
    @State private var corrTaskId = ""
    @State private var corrError = ""

    private var s: AppState { store.state }
    private static let ymdLocal: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"; return f
    }()
    private var selectedYMD: String { Self.ymdLocal.string(from: day) }

    var body: some View {
        let earned = Logic.childEarned(s, childId)
        let spent = Logic.childSpent(s, childId)
        let autoPenalty = Logic.childAutoPenalty(s, childId)
        let manualPenalty = Logic.childManualPenalty(s, childId)
        let adjustment = Logic.childManualAdjustment(s, childId)
        let balance = Logic.childBalance(s, childId)
        let all = Ledger.build(childId, s)
        let entries = filtering ? all.filter { $0.date == selectedYMD } : all

        VStack(spacing: 12) {
            summaryCard(earned: earned, spent: spent, autoPenalty: autoPenalty,
                        manualPenalty: manualPenalty, adjustment: adjustment, balance: balance)
            dayPickerCard
            if entries.isEmpty {
                VStack(spacing: 6) {
                    Text("📋").font(.system(size: 34))
                    Text(filtering ? "Нет записей за \(RuDate.dayMonthYear(selectedYMD))" : "История пуста")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                ForEach(entries) { entryRow($0) }
            }
        }
    }

    private func summaryCard(earned: Int, spent: Int, autoPenalty: Int, manualPenalty: Int, adjustment: Int, balance: Int) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                Text("ИТОГОВЫЙ РАСЧЁТ").font(.caption2.bold()).foregroundStyle(.secondary)
                row("✅ Заработано", "+\(earned) ⭐", Theme.green)
                if spent > 0 { row("🎁 Потрачено на призы", "−\(spent) ⭐", Theme.purple) }
                if autoPenalty > 0 { row("⏰ Штрафы за пропуски", "−\(autoPenalty) ⭐", Theme.red) }
                if manualPenalty > 0 { row("⚡ Ручные штрафы", "−\(manualPenalty) ⭐", Theme.red) }
                if adjustment != 0 {
                    row("🔧 Корректировки", "\(adjustment > 0 ? "+" : "")\(adjustment) ⭐", adjustment > 0 ? Theme.green : Theme.orange)
                }
                Divider()
                HStack {
                    Text("= Баланс").font(.headline)
                    Spacer()
                    Text("\(balance) ⭐").font(.headline).foregroundStyle(Theme.balanceColor(balance))
                }
            }
        }
    }

    private func row(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(color)
        }
    }

    private var dayPickerCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Toggle("Показать день", isOn: $filtering)
                        .font(.caption.bold()).tint(Theme.indigo)
                        .onChange(of: filtering) { showCorrection = false; corrError = "" }
                }
                if filtering {
                    DatePicker("Дата", selection: $day, displayedComponents: .date)
                        .labelsHidden()
                        .onChange(of: day) { showCorrection = false }
                    if !showCorrection {
                        PrimaryButton(title: "+ Корректировка за \(RuDate.dayMonthYear(selectedYMD))", color: Theme.indigo) {
                            corrAmount = 0; corrReason = ""; corrTaskId = ""; corrError = ""; showCorrection = true
                        }
                    } else {
                        correctionForm
                    }
                }
            }
        }
    }

    private var childTasks: [TaskItem] { s.tasks.filter { $0.assignedTo.contains(childId) } }
    private var selectedTask: TaskItem? { corrTaskId.isEmpty ? nil : childTasks.first { $0.id == corrTaskId } }
    private var fineToRevert: Int { selectedTask.map { Logic.activeFineFor($0, childId, selectedYMD, s) } ?? 0 }

    private var correctionForm: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Корректировка за \(RuDate.dayMonthYear(selectedYMD))")
                .font(.caption).foregroundStyle(Theme.indigo)
            HStack {
                Text("Баллы:").font(.subheadline).foregroundStyle(.secondary)
                SignedIntField(value: $corrAmount).frame(width: 140)
            }
            if !childTasks.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Picker("Связано с заданием", selection: $corrTaskId) {
                        Text("— не выбрано —").tag("")
                        ForEach(childTasks) { Text($0.title).tag($0.id) }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: corrTaskId) {
                        if let t = selectedTask { corrAmount = Logic.rewardForDate(t, selectedYMD) }
                    }
                    if fineToRevert > 0 {
                        Text("⚡ Штраф за это задание (−\(fineToRevert) ⭐) за этот день будет отменён.")
                            .font(.caption2).foregroundStyle(Theme.orange)
                    }
                }
            }
            TextField("Причина корректировки *", text: $corrReason).textFieldStyle(.roundedBorder)
            if !corrError.isEmpty { Text(corrError).font(.caption).foregroundStyle(Theme.red) }
            HStack(spacing: 8) {
                Button("Отмена") { showCorrection = false; corrError = "" }
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .background(Color.gray.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 10)).buttonStyle(.plain)
                Button("Сохранить") { saveCorrection() }
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
                    .background(Theme.indigo).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 10)).buttonStyle(.plain)
            }
        }
        .padding(10).background(Theme.indigo.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func saveCorrection() {
        let reason = corrReason.trimmingCharacters(in: .whitespaces)
        guard !reason.isEmpty else { corrError = "Укажите причину"; return }
        guard corrAmount != 0 else { corrError = "Сумма не может быть 0"; return }
        store.addManualAdjustment(childId: childId, amount: corrAmount, reason: reason,
                                  forDate: selectedYMD, taskId: corrTaskId.isEmpty ? nil : corrTaskId)
        corrAmount = 0; corrReason = ""; corrTaskId = ""; corrError = ""; showCorrection = false
    }

    private func entryRow(_ e: LedgerEntry) -> some View {
        let m = Ledger.meta(e.type)
        return HStack(alignment: .top, spacing: 10) {
            Text(m.icon).font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .top) {
                    Text(e.label).font(.subheadline.weight(.medium))
                    Spacer()
                    if e.type != .taskEdit {
                        Text("\(e.points >= 0 ? "+" : "")\(e.points) ⭐")
                            .font(.subheadline.bold()).foregroundStyle(Ledger.pointsColor(e))
                    }
                }
                HStack(spacing: 4) {
                    Text(RuDate.dayMonthYear(e.date))
                    Text("·"); Text(m.label)
                    if let note = e.note { Text("·"); Text(note).italic() }
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(m.bg.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// Signed numeric field for balance corrections (accepts a leading - or +).
struct SignedIntField: View {
    @Binding var value: Int
    @State private var text = ""
    var body: some View {
        TextField("например -5 или +10", text: $text)
            .textFieldStyle(.roundedBorder)
            .numericKeyboard()
            .onAppear { if value != 0 { text = display(value) } }
            .onChange(of: text) { value = parsed(text) }
            .onChange(of: value) { if parsed(text) != value { text = value == 0 ? "" : display(value) } }
    }
    private func parsed(_ s: String) -> Int {
        let neg = s.trimmingCharacters(in: .whitespaces).hasPrefix("-")
        let n = Int(s.filter { $0.isNumber }) ?? 0
        return neg ? -n : n
    }
    private func display(_ v: Int) -> String { v > 0 ? "+\(Logic.fmtPts(v))" : "-\(Logic.fmtPts(-v))" }
}
