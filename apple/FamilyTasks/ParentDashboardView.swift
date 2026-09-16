import SwiftUI

// Parent dashboard with the same six tabs as ParentDashboard.tsx.
struct ParentDashboardView: View {
    @EnvironmentObject var store: Store
    var onLogout: () -> Void
    @State private var tab: Tab = .overview

    enum Tab: Hashable { case overview, children, tasks, approvals, rewards, settings }

    var body: some View {
        TabView(selection: $tab) {
            navTab(ParentOverviewTab(), title: "Обзор")
                .tabItem { Label("Обзор", systemImage: "chart.bar.fill") }.tag(Tab.overview)

            navTab(ParentChildrenTab(), title: "Дети")
                .tabItem { Label("Дети", systemImage: "person.2.fill") }.tag(Tab.children)

            navTab(ParentTasksTab(), title: "Задания")
                .badge(store.pendingTaskSuggestions.count)
                .tabItem { Label("Задания", systemImage: "checkmark.circle.fill") }.tag(Tab.tasks)

            navTab(ParentApprovalsTab(), title: "Проверка")
                .badge(store.pendingCompletions.count)
                .tabItem { Label("Проверка", systemImage: "magnifyingglass") }.tag(Tab.approvals)

            navTab(ParentRewardsTab(), title: "Награды")
                .tabItem { Label("Награды", systemImage: "gift.fill") }.tag(Tab.rewards)

            navTab(ParentSettingsTab(), title: "Настройки")
                .tabItem { Label("Настройки", systemImage: "gearshape.fill") }.tag(Tab.settings)
        }
        .tint(Theme.indigo)
    }

    private func navTab<V: View>(_ content: V, title: String) -> some View {
        NavigationStack {
            ScrollView { content.padding() }
                .background(bgColor)
                .plainTitle(title)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Выйти", action: onLogout).foregroundStyle(.secondary)
                    }
                }
        }
    }

    private var bgColor: Color {
        #if os(iOS)
        Color(.systemGroupedBackground)
        #else
        Color(nsColor: .windowBackgroundColor)
        #endif
    }
}

// MARK: - Overview

struct ParentOverviewTab: View {
    @EnvironmentObject var store: Store
    @State private var editingChildId: String?
    @State private var newBalance = 0
    @State private var adjustReason = ""
    @State private var historyChildId: String?

    private var today: String { Logic.todayStr() }
    private var s: AppState { store.state }

    var body: some View {
        VStack(spacing: 20) {
            HStack(spacing: 12) {
                statBox("\(s.children.count)", "Детей", Theme.indigo)
                statBox("\(activeTasks.count)", "Активных заданий", .blue)
                statBox("\(s.rewards.count)", "Наград", Theme.purple)
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Прогресс детей").font(.headline)
                if s.children.isEmpty {
                    Text("Добавьте детей, чтобы видеть их прогресс")
                        .foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(.vertical, 20)
                } else {
                    ForEach(s.children) { child in childCard(child) }
                }
            }

            let claims = s.rewardClaims.filter { $0.approved }
            if !claims.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("История полученных наград").font(.headline)
                    ForEach(claims.suffix(10).reversed()) { claim in
                        HStack {
                            Text("\(store.child(claim.childId)?.avatar ?? "") \(store.child(claim.childId)?.name ?? "") получил(а) «\(claimTitle(claim))»")
                                .font(.subheadline)
                            Spacer()
                            if let cost = claimCost(claim) {
                                Text("−\(cost) ⭐").font(.subheadline).foregroundStyle(Theme.purple)
                            }
                        }
                        .padding(10)
                        .background(cardBG).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
        }
    }

    private var activeTasks: [TaskItem] { s.tasks.filter { $0.startDate <= today && $0.endDate >= today } }

    private func childCard(_ child: Child) -> some View {
        let earned = Logic.childEarned(s, child.id)
        let spent = Logic.childSpent(s, child.id)
        let autoPenalty = Logic.childAutoPenalty(s, child.id)
        let manualPenalty = Logic.childManualPenalty(s, child.id)
        let adjustment = Logic.childManualAdjustment(s, child.id)
        let balance = Logic.childBalance(s, child.id)
        let todayTasks = activeTasks.filter { $0.assignedTo.contains(child.id) && Logic.isScheduledOn($0, today) }
        let completedToday = todayTasks.filter { t in
            if t.recurrence == "once" || t.reportAtEnd {
                return s.completions.contains { $0.taskId == t.id && $0.childId == child.id && ($0.approved == nil || $0.approved == true) }
            }
            return s.completions.contains { $0.taskId == t.id && $0.childId == child.id && $0.date == today && ($0.approved == nil || $0.approved == true) }
        }.count
        let isEditing = editingChildId == child.id

        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(child.avatar).font(.system(size: 30))
                    Text(child.name).font(.headline)
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text("\(balance) ⭐").font(.headline).foregroundStyle(Theme.balanceColor(balance))
                        Text("баланс").font(.caption2).foregroundStyle(.secondary)
                    }
                    Button {
                        if isEditing { editingChildId = nil }
                        else { editingChildId = child.id; newBalance = balance; adjustReason = "" }
                    } label: { Text(isEditing ? "✕" : "✏️") }
                        .buttonStyle(.plain)
                }

                if isEditing {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Установить новый баланс").font(.caption).foregroundStyle(Theme.indigo)
                        HStack {
                            Text("Баланс:").font(.subheadline).foregroundStyle(.secondary)
                            IntField(placeholder: "0", value: $newBalance, minValue: Int.min).frame(width: 110)
                            Text("⭐").font(.caption)
                        }
                        TextField("Причина (необязательно)", text: $adjustReason).textFieldStyle(.roundedBorder)
                        PrimaryButton(title: newBalance == balance ? "Закрыть" : "Установить \(newBalance) ⭐", color: Theme.indigo) {
                            let delta = newBalance - balance
                            if delta != 0 {
                                store.addManualAdjustment(childId: child.id, amount: delta,
                                    reason: adjustReason.trimmingCharacters(in: .whitespaces).isEmpty ? "Корректировка баланса" : adjustReason.trimmingCharacters(in: .whitespaces),
                                    forDate: nil, taskId: nil)
                            }
                            editingChildId = nil
                        }
                    }
                    .padding(10).background(Theme.indigo.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
                }

                HStack(spacing: 8) {
                    miniStat("\(completedToday)/\(todayTasks.count)", "сегодня", Theme.green)
                    miniStat("+\(earned)", "заработано", Theme.yellow)
                    miniStat("−\(spent)", "потрачено", Theme.purple)
                    miniStat("−\(autoPenalty + manualPenalty)", "штрафы", Theme.red)
                }

                if adjustment != 0 {
                    Text("Корр.: \(adjustment > 0 ? "+" : "")\(adjustment)")
                        .font(.caption).foregroundStyle(adjustment > 0 ? Theme.green : Theme.red)
                }

                Button {
                    historyChildId = historyChildId == child.id ? nil : child.id
                } label: {
                    Text(historyChildId == child.id ? "▲ Скрыть историю баллов" : "▼ История баллов")
                        .font(.caption).frame(maxWidth: .infinity).padding(.vertical, 6)
                        .background(Theme.indigo.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain).foregroundStyle(Theme.indigo)

                if historyChildId == child.id {
                    PointsHistoryView(childId: child.id)
                }
            }
        }
    }

    private func claimTitle(_ c: RewardClaim) -> String {
        c.rewardTitle ?? store.state.rewards.first { $0.id == c.rewardId }?.title ?? "Удалённый приз"
    }
    private func claimCost(_ c: RewardClaim) -> Int? {
        c.rewardCost ?? store.state.rewards.first { $0.id == c.rewardId }?.cost
    }

    private func statBox(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 4) {
            Text(value).font(.title.bold()).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(color.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 16))
    }
    private func miniStat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.subheadline.bold()).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 8)
        .background(color.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10))
    }
    private var cardBG: Color {
        #if os(iOS)
        Color(.secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

// MARK: - Approvals

struct ParentApprovalsTab: View {
    @EnvironmentObject var store: Store
    @State private var adjustments: [String: Int] = [:]
    @State private var comments: [String: String] = [:]

    var body: some View {
        let pending = store.pendingCompletions
        if pending.isEmpty {
            VStack(spacing: 12) {
                Text("✅").font(.system(size: 48))
                Text("Нет заданий на проверку").foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 60)
        } else {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ребёнок отметил задание как выполненное — подтвердите или отклоните.")
                    .font(.subheadline).foregroundStyle(.secondary)
                ForEach(pending) { comp in approvalCard(comp) }
            }
        }
    }

    private func approvalCard(_ comp: TaskCompletion) -> some View {
        let task = store.task(comp.taskId)
        let child = store.child(comp.childId)
        let defaultPoints = task?.reward ?? 0
        let pointsBinding = Binding<Int>(
            get: { adjustments[comp.id] ?? defaultPoints },
            set: { adjustments[comp.id] = max(0, $0) }
        )
        let commentBinding = Binding<String>(
            get: { comments[comp.id] ?? "" },
            set: { comments[comp.id] = $0 }
        )
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    Text(child?.avatar ?? "👤").font(.system(size: 30))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(task?.title ?? "Удалённое задание").font(.headline)
                        Text("\(child?.name ?? "") · \(dateLabel(comp.date))")
                            .font(.subheadline).foregroundStyle(.secondary)
                        if let task, task.penalty > 0 {
                            Pill(text: "штраф −\(task.penalty)", color: Theme.red)
                        }
                    }
                    Spacer()
                }
                HStack {
                    Text("Баллы:").font(.subheadline).foregroundStyle(.secondary)
                    IntField(placeholder: "0", value: pointsBinding).frame(width: 90)
                    if pointsBinding.wrappedValue != defaultPoints {
                        Button("сбросить (\(defaultPoints))") { adjustments[comp.id] = nil }
                            .font(.caption).buttonStyle(.plain).foregroundStyle(.secondary)
                    }
                }
                TextField("Комментарий для ребёнка (необязательно)", text: commentBinding, axis: .vertical)
                    .textFieldStyle(.roundedBorder).lineLimit(2...4)
                HStack(spacing: 10) {
                    Button {
                        let pts = adjustments[comp.id]
                        let c = commentBinding.wrappedValue.trimmingCharacters(in: .whitespaces)
                        store.approveCompletion(comp.id, adjustedReward: pts, comment: c.isEmpty ? nil : c)
                    } label: {
                        Text("✓ Подтвердить\(pointsBinding.wrappedValue > 0 ? " +\(pointsBinding.wrappedValue) ⭐" : "")")
                            .fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .background(Theme.green).foregroundStyle(.white).clipShape(RoundedRectangle(cornerRadius: 12)).buttonStyle(.plain)

                    Button {
                        let c = commentBinding.wrappedValue.trimmingCharacters(in: .whitespaces)
                        store.denyCompletion(comp.id, comment: c.isEmpty ? nil : c)
                    } label: {
                        Text("✕ Отклонить").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .background(Theme.red.opacity(0.15)).foregroundStyle(Theme.red).clipShape(RoundedRectangle(cornerRadius: 12)).buttonStyle(.plain)
                }
            }
        }
    }

    private func dateLabel(_ ymd: String) -> String { RuDate.weekdayDayMonth(ymd) }
}
