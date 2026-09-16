import SwiftUI

// Child-facing dashboard: tasks, rewards, history, profile — a faithful port of
// ChildDashboard.tsx, including the tap-to-toggle completion flow and the
// suggest-task / suggest-reward forms.
struct ChildDashboardView: View {
    @EnvironmentObject var store: Store
    let childId: String
    var onLogout: () -> Void

    @State private var tab: ChildTab = .tasks
    @State private var profileName = ""
    @State private var profileAvatar = ""
    @State private var profileSaved = false
    @State private var claimMsg: String?
    @State private var taskMsg: String?
    @State private var showSuggestReward = false
    @State private var suggestRTitle = ""; @State private var suggestRDesc = ""
    @State private var showSuggestTask = false
    @State private var suggestTTitle = ""; @State private var suggestTDesc = ""

    enum ChildTab: Hashable { case tasks, rewards, history, profile }
    private var s: AppState { store.state }
    private var today: String { Logic.todayStr() }

    var body: some View {
        ZStack {
            GradientBG(colors: [Theme.orange, Theme.yellow])
            if let child = store.child(childId) {
                VStack(spacing: 0) {
                    header(child)
                    ScrollView { content(child).padding().padding(.bottom, 12) }
                    bottomNav
                }
            } else {
                Color.clear.onAppear(perform: onLogout)
            }
        }
        .task(id: taskMsg) { await autoClear { taskMsg == nil ? false : true } clear: { taskMsg = nil } }
        .task(id: claimMsg) { await autoClear { claimMsg == nil ? false : true } clear: { claimMsg = nil } }
        .task(id: profileSaved) { if profileSaved { try? await Task.sleep(nanoseconds: 2_500_000_000); profileSaved = false } }
    }

    private func autoClear(_ active: () -> Bool, clear: @escaping () -> Void) async {
        guard active() else { return }
        try? await Task.sleep(nanoseconds: 3_200_000_000)
        clear()
    }

    // MARK: header

    private func header(_ child: Child) -> some View {
        HStack {
            Button { openProfile(child) } label: {
                HStack(spacing: 10) {
                    Text(child.avatar).font(.system(size: 30))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(child.name).font(.headline)
                        Text(RuDate.weekdayLongToday()).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }.buttonStyle(.plain)
            Spacer()
            let balance = store.balance(childId)
            VStack(alignment: .trailing, spacing: 1) {
                Text("\(balance) ⭐").font(.title3.bold()).foregroundStyle(Theme.balanceColor(balance))
                Text("баллов").font(.caption2).foregroundStyle(.secondary)
            }
            Button { onLogout() } label: { Text("✕").font(.title3).foregroundStyle(.secondary) }.buttonStyle(.plain).padding(.leading, 8)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(.regularMaterial)
    }

    // MARK: content router

    @ViewBuilder private func content(_ child: Child) -> some View {
        switch tab {
        case .tasks:   tasksTab(child)
        case .rewards: rewardsTab
        case .history: PointsHistoryView(childId: childId)
        case .profile: profileTab(child)
        }
    }

    // MARK: tasks

    private var todayTasks: [TaskItem] {
        s.tasks.filter { t in
            if t.pendingApproval == true { return false }
            if !t.assignedTo.contains(childId) { return false }
            if today < t.startDate || today > t.endDate { return false }
            if t.recurrence == "once" || t.reportAtEnd {
                return Logic.completionStatus(s, t, childId) != .approved
            }
            return Logic.isScheduledOn(t, today)
        }
    }
    private var submittedCount: Int {
        todayTasks.filter { let st = Logic.completionStatus(s, $0, childId); return st == .pending || st == .approved }.count
    }

    @ViewBuilder private func tasksTab(_ child: Child) -> some View {
        let tasks = todayTasks
        let submitted = submittedCount
        let allDone = !tasks.isEmpty && submitted == tasks.count
        VStack(spacing: 14) {
            if allDone {
                VStack(spacing: 4) {
                    Text("🎉").font(.system(size: 34))
                    Text("Все задания выполнены!").font(.headline).foregroundStyle(Theme.green)
                    Text("Молодец, \(child.name)!").font(.subheadline).foregroundStyle(Theme.green)
                }
                .frame(maxWidth: .infinity).padding().background(Theme.green.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            if !tasks.isEmpty {
                HStack(spacing: 10) {
                    ProgressBar(value: Double(submitted), total: Double(tasks.count))
                    Text("\(submitted)/\(tasks.count)").font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                }
                .padding(12).background(cardBG).clipShape(RoundedRectangle(cornerRadius: 16))
            }
            if let m = taskMsg { banner(m, Color.blue) }
            suggestTaskBlock
            myTaskSuggestions
            if tasks.isEmpty {
                VStack(spacing: 6) { Text("😴").font(.system(size: 44)); Text("Заданий на сегодня нет").foregroundStyle(.secondary) }
                    .frame(maxWidth: .infinity).padding(.vertical, 40)
            } else {
                ForEach(tasks) { taskCard($0) }
            }
        }
    }

    @ViewBuilder private var suggestTaskBlock: some View {
        if !showSuggestTask {
            Button { showSuggestTask = true } label: {
                Text("Придумать своё задание").font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Theme.indigo.opacity(0.15)).foregroundStyle(Theme.indigo).clipShape(RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain)
        } else {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Моё задание").font(.headline).foregroundStyle(Theme.indigo)
                        Spacer()
                        Button { showSuggestTask = false } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                    }
                    TextField("Название задания *", text: $suggestTTitle).textFieldStyle(.roundedBorder)
                    TextField("Описание (необязательно)", text: $suggestTDesc).textFieldStyle(.roundedBorder)
                    Text("Родитель решит, сколько баллов и когда").font(.caption2).foregroundStyle(.secondary)
                    PrimaryButton(title: "Отправить предложение", color: Theme.indigo, action: submitSuggestTask)
                        .disabled(suggestTTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    @ViewBuilder private var myTaskSuggestions: some View {
        let mine = s.tasks.filter { $0.pendingApproval == true && $0.suggestedBy == childId }
        if !mine.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Мои предложения заданий").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(mine) { t in
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(t.title).font(.subheadline.weight(.medium))
                            if !t.description.isEmpty { Text(t.description).font(.caption2).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        Text("Ждём одобрения...").font(.caption2).foregroundStyle(Theme.indigo)
                    }
                    .padding(10).background(Theme.indigo.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func taskCard(_ task: TaskItem) -> some View {
        let status = Logic.completionStatus(s, task, childId)
        let isOnce = task.recurrence == "once" || task.reportAtEnd
        let comp = findCompletion(task)
        let earnedPoints = comp?.adjustedReward ?? task.reward
        return Button { toggle(task) } label: {
            HStack(alignment: .top, spacing: 12) {
                statusCircle(status)
                VStack(alignment: .leading, spacing: 4) {
                    Text(task.title).font(.headline)
                        .strikethrough(status == .approved)
                        .foregroundStyle(titleColor(status))
                    if !task.description.isEmpty { Text(task.description).font(.subheadline).foregroundStyle(.secondary) }
                    HStack(spacing: 6) {
                        statusLabel(status)
                        if earnedPoints > 0 && status != .denied { Pill(text: "+\(earnedPoints) ⭐", color: Theme.yellow) }
                        if task.penalty > 0 && status == .none { Pill(text: "штраф −\(task.penalty)", color: Theme.red) }
                        if isOnce { Pill(text: "до \(RuDate.dayMonthShort(task.endDate))", color: .blue) }
                    }
                    if let c = comp?.parentComment, !c.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Text("💬")
                            Text(c).font(.caption)
                        }
                        .padding(8).background(Color.blue.opacity(0.1)).clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
                Spacer()
            }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBG)
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(cardStroke(status), lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .disabled(status == .approved)
    }

    // MARK: rewards

    private var rewardsTab: some View {
        let balance = store.balance(childId)
        let earned = Logic.childEarned(s, childId)
        let spent = Logic.childSpent(s, childId)
        let autoPen = Logic.childAutoPenalty(s, childId)
        let manPen = Logic.childManualPenalty(s, childId)
        let available = s.rewards.filter { $0.pendingCost != true }
        let mySuggestions = s.rewards.filter { $0.suggestedBy == childId && $0.pendingCost == true }
        let myClaims = s.rewardClaims.filter { $0.childId == childId && $0.approved }.sorted { $0.claimedAt > $1.claimedAt }.prefix(5)
        return VStack(spacing: 14) {
            VStack(spacing: 6) {
                Text("\(balance)").font(.system(size: 40, weight: .bold)).foregroundStyle(Theme.orange)
                Text("баллов доступно").font(.subheadline).foregroundStyle(Theme.orange)
                HStack(spacing: 8) {
                    miniStat("+\(earned)", "заработано", Theme.green)
                    miniStat("−\(spent)", "потрачено", Theme.purple)
                    miniStat("−\(autoPen + manPen)", "штрафы", Theme.red)
                }
            }
            .frame(maxWidth: .infinity).padding().background(Theme.orange.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 16))

            if let m = claimMsg { banner(m, Color.blue) }
            suggestRewardBlock

            if !mySuggestions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Мои предложения").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(mySuggestions) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(r.title).font(.subheadline.weight(.medium))
                                if !r.description.isEmpty { Text(r.description).font(.caption2).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text("Ждём цену...").font(.caption2).foregroundStyle(Theme.purple)
                        }
                        .padding(10).background(Theme.purple.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

            if !myClaims.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Мои призы").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(Array(myClaims)) { claim in
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text("🎁 \(claimTitle(claim))").font(.subheadline.weight(.medium))
                                Text(RuDate.longFromISO(claim.claimedAt)).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("−\(claimCost(claim)) ⭐").font(.subheadline.weight(.medium)).foregroundStyle(Theme.purple)
                        }
                        .padding(10).background(Theme.purple.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

            if available.isEmpty {
                VStack(spacing: 6) { Text("🎁").font(.system(size: 34)); Text("Наград пока нет").foregroundStyle(.secondary) }
                    .frame(maxWidth: .infinity).padding(.vertical, 30)
            } else {
                ForEach(available) { rewardCard($0, balance: balance) }
            }
        }
    }

    @ViewBuilder private var suggestRewardBlock: some View {
        if !showSuggestReward {
            Button { showSuggestReward = true } label: {
                Text("Придумать свой приз").font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Theme.purple.opacity(0.15)).foregroundStyle(Theme.purple).clipShape(RoundedRectangle(cornerRadius: 16))
            }.buttonStyle(.plain)
        } else {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Мой приз").font(.headline).foregroundStyle(Theme.purple)
                        Spacer()
                        Button { showSuggestReward = false } label: { Text("✕").foregroundStyle(.secondary) }.buttonStyle(.plain)
                    }
                    TextField("Название приза *", text: $suggestRTitle).textFieldStyle(.roundedBorder)
                    TextField("Описание (необязательно)", text: $suggestRDesc).textFieldStyle(.roundedBorder)
                    Text("Родитель решит, сколько баллов нужно").font(.caption2).foregroundStyle(.secondary)
                    PrimaryButton(title: "Отправить предложение", color: Theme.purple, action: submitSuggestReward)
                        .disabled(suggestRTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func rewardCard(_ reward: Reward, balance: Int) -> some View {
        let canAfford = balance >= reward.cost
        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(reward.title).font(.headline)
                if !reward.description.isEmpty { Text(reward.description).font(.subheadline).foregroundStyle(.secondary) }
                HStack(spacing: 6) {
                    Pill(text: "\(reward.cost) ⭐", color: Theme.purple)
                    if reward.suggestedBy == childId { Pill(text: "моя идея", color: Theme.green) }
                }
            }
            Spacer()
            Button { claim(reward) } label: {
                Text(canAfford ? "Получить" : "Мало").font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(canAfford ? Theme.orange : Color.gray.opacity(0.2))
                    .foregroundStyle(canAfford ? .white : .secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain).disabled(!canAfford)
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(cardBG)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(canAfford ? Theme.yellow.opacity(0.5) : Color.gray.opacity(0.2), lineWidth: 2))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .opacity(canAfford ? 1 : 0.7)
    }

    // MARK: profile

    private func profileTab(_ child: Child) -> some View {
        VStack(spacing: 16) {
            VStack(spacing: 4) {
                Text(profileAvatar.isEmpty ? child.avatar : profileAvatar).font(.system(size: 64))
                Text(profileName.isEmpty ? child.name : profileName).font(.title3.bold())
            }
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Выбери аватар").font(.subheadline.weight(.semibold))
                    AvatarPicker(selected: $profileAvatar)
                }
            }
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Имя").font(.subheadline.weight(.semibold))
                    TextField("Твоё имя", text: $profileName).textFieldStyle(.roundedBorder)
                }
            }
            if profileSaved { banner("Профиль обновлён!", Theme.green) }
            PrimaryButton(title: "Сохранить", color: Theme.orange) { saveProfile(child) }
                .disabled(profileName.trimmingCharacters(in: .whitespaces).isEmpty ||
                          (profileName.trimmingCharacters(in: .whitespaces) == child.name && profileAvatar == child.avatar))
        }
        .onAppear { if profileName.isEmpty { openProfile(child) } }
    }

    // MARK: bottom nav

    private var bottomNav: some View {
        HStack {
            navItem(.tasks, "✅", "Задания")
            navItem(.rewards, "🎁", "Награды")
            navItem(.history, "📋", "История")
            navItem(.profile, "👤", "Профиль")
        }
        .padding(.top, 8).padding(.bottom, 4)
        .background(.regularMaterial)
    }

    private func navItem(_ t: ChildTab, _ icon: String, _ label: String) -> some View {
        Button {
            if t == .profile, let c = store.child(childId) { openProfile(c) }
            tab = t
        } label: {
            VStack(spacing: 2) {
                Text(icon).font(.title3)
                Text(label).font(.caption2)
            }
            .frame(maxWidth: .infinity)
            .foregroundStyle(tab == t ? Theme.orange : .secondary)
        }
        .buttonStyle(.plain)
    }

    // MARK: actions

    private func toggle(_ task: TaskItem) {
        switch Logic.completionStatus(s, task, childId) {
        case .approved: return
        case .none: store.completeTask(task, childId: childId)
        case .pending: store.uncompleteTask(task, childId: childId)
        case .denied: store.uncompleteTask(task, childId: childId); store.completeTask(task, childId: childId)
        }
    }
    private func claim(_ reward: Reward) {
        if store.balance(childId) < reward.cost { claimMsg = "Недостаточно баллов!"; return }
        store.claimReward(reward.id, childId: childId)
        claimMsg = "Готово! Баллы списаны."
    }
    private func submitSuggestTask() {
        let t = suggestTTitle.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        store.suggestTask(title: t, description: suggestTDesc.trimmingCharacters(in: .whitespaces), childId: childId)
        suggestTTitle = ""; suggestTDesc = ""; showSuggestTask = false
        taskMsg = "Предложение отправлено! Жди пока родитель его одобрит."
    }
    private func submitSuggestReward() {
        let t = suggestRTitle.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return }
        store.suggestReward(title: t, description: suggestRDesc.trimmingCharacters(in: .whitespaces), childId: childId)
        suggestRTitle = ""; suggestRDesc = ""; showSuggestReward = false
        claimMsg = "Предложение отправлено! Жди пока родитель установит цену."
    }
    private func openProfile(_ child: Child) {
        profileName = child.name; profileAvatar = child.avatar; profileSaved = false
    }
    private func saveProfile(_ child: Child) {
        let name = profileName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        store.editChild(childId, name: name, avatar: profileAvatar, pin: child.pin)
        profileSaved = true
    }

    // MARK: helpers

    private func findCompletion(_ task: TaskItem) -> TaskCompletion? {
        if task.recurrence == "once" || task.reportAtEnd {
            return s.completions.first { $0.taskId == task.id && $0.childId == childId }
        }
        return s.completions.first { $0.taskId == task.id && $0.childId == childId && $0.date == today }
    }
    private func claimTitle(_ c: RewardClaim) -> String {
        c.rewardTitle ?? s.rewards.first { $0.id == c.rewardId }?.title ?? "Удалённый приз"
    }
    private func claimCost(_ c: RewardClaim) -> Int {
        c.rewardCost ?? s.rewards.first { $0.id == c.rewardId }?.cost ?? 0
    }

    private func banner(_ text: String, _ color: Color) -> some View {
        Text(text).font(.subheadline.weight(.medium)).foregroundStyle(color)
            .frame(maxWidth: .infinity).padding(10)
            .background(color.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 12))
    }
    private func miniStat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text(value).font(.subheadline.bold()).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 6).background(cardBG).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder private func statusCircle(_ status: CompletionStatus) -> some View {
        ZStack {
            Circle().stroke(circleColor(status), lineWidth: 2)
                .background(Circle().fill(status == .none ? Color.clear : circleColor(status)))
            switch status {
            case .none: EmptyView()
            case .pending: Text("⏳").font(.caption2)
            case .approved: Text("✓").font(.caption.bold()).foregroundStyle(.white)
            case .denied: Text("✕").font(.caption.bold()).foregroundStyle(.white)
            }
        }
        .frame(width: 26, height: 26)
    }

    @ViewBuilder private func statusLabel(_ status: CompletionStatus) -> some View {
        switch status {
        case .none: EmptyView()
        case .pending: Pill(text: "На проверке", color: Theme.yellow)
        case .approved: Pill(text: "Подтверждено ✓", color: Theme.green)
        case .denied: Pill(text: "Отклонено — нажми снова", color: Theme.red)
        }
    }

    private func circleColor(_ s: CompletionStatus) -> Color {
        switch s { case .none: return Theme.orange.opacity(0.5); case .pending: return Theme.yellow; case .approved: return Theme.green; case .denied: return Theme.red }
    }
    private func titleColor(_ s: CompletionStatus) -> Color {
        switch s { case .none: return .primary; case .pending: return Theme.yellow; case .approved: return Theme.green; case .denied: return Theme.red }
    }
    private func cardStroke(_ s: CompletionStatus) -> Color {
        switch s { case .none: return Theme.orange.opacity(0.4); case .pending: return Theme.yellow.opacity(0.6); case .approved: return Theme.green.opacity(0.6); case .denied: return Theme.red.opacity(0.6) }
    }

    private var cardBG: Color {
        #if os(iOS)
        Color(.secondarySystemGroupedBackground)
        #else
        Color(nsColor: .controlBackgroundColor)
        #endif
    }
}

// Thin orange progress bar used on the child's tasks tab.
struct ProgressBar: View {
    var value: Double
    var total: Double
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.gray.opacity(0.2))
                Capsule().fill(Theme.orange)
                    .frame(width: total > 0 ? geo.size.width * min(1, value / total) : 0)
            }
        }
        .frame(height: 10)
    }
}
