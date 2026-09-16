import Foundation
import SwiftUI

// Holds the whole family state and keeps it in sync with the server: debounced
// saves after every mutation (300ms) and an 8s poll that pulls remote changes
// when no local save is in flight — mirroring src/context.tsx. Every mutation
// keeps the FULL AppState and only touches the relevant array, so a save never
// drops fields (proven by the round-trip test against real data).
@MainActor
final class Store: ObservableObject {
    @Published var state = AppState.empty
    @Published var loaded = false
    @Published var authed: Bool
    @Published var familyLogin: String
    @Published var syncError: String?

    private let api: APIClient
    private var token: String? { Session.token }
    private var saveTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var isSaving = false

    init(api: APIClient = APIClient()) {
        self.api = api
        self.authed = Session.token != nil
        self.familyLogin = Session.login ?? ""
    }

    // MARK: session

    // Log in or register a family, persist the session, then load state.
    // Mirrors FamilyLogin.tsx: api.login/register → saveFamilySession → onAuthed.
    func authenticate(login: String, password: String, register: Bool) async throws {
        let resp = register
            ? try await api.register(login: login, password: password)
            : try await api.login(login: login, password: password)
        Session.save(token: resp.token, login: resp.login)
        onAuthed()
    }

    func onAuthed() {
        familyLogin = Session.login ?? ""
        authed = true
        loaded = false
        Task { await load() }
    }

    func logout() {
        saveTask?.cancel(); pollTask?.cancel()
        Session.clear()
        state = .empty
        loaded = false
        authed = false
        familyLogin = ""
    }

    private func handleUnauthorized() {
        Session.clear()
        logout()
    }

    // MARK: load + sync

    func load() async {
        guard let token else { authed = false; return }
        do {
            let s = try await api.getState(token: token)
            state = s
            loaded = true
            startPolling()
        } catch APIError.unauthorized {
            handleUnauthorized()
        } catch {
            // keep whatever we have; surface a soft error
            syncError = (error as? LocalizedError)?.errorDescription
            loaded = true
        }
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 8 * 1_000_000_000)
                guard let self else { return }
                await self.pollOnce()
            }
        }
    }

    private func pollOnce() async {
        guard !isSaving, saveTask == nil, let token else { return }
        do {
            let remote = try await api.getState(token: token)
            if !isSaving, saveTask == nil, remote != state {
                state = remote
            }
        } catch APIError.unauthorized {
            handleUnauthorized()
        } catch {
            // ignore transient poll errors
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = state
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            await self.push(snapshot)
            self.saveTask = nil
        }
    }

    private func push(_ snapshot: AppState) async {
        guard let token else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await api.putState(snapshot, token: token)
            syncError = nil
        } catch APIError.unauthorized {
            handleUnauthorized()
        } catch {
            syncError = (error as? LocalizedError)?.errorDescription
        }
    }

    private func mutate(_ f: (inout AppState) -> Void) {
        var s = state
        f(&s)
        state = s
        scheduleSave()
    }

    // MARK: ids / timestamps (match the web app's formats closely enough)

    private func uid() -> String {
        let rand = String(UInt64.random(in: 0..<UInt64.max), radix: 36)
        let time = String(UInt64(Date().timeIntervalSince1970 * 1000), radix: 36)
        return rand + time
    }
    private static let isoFmt: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private func nowISO() -> String { Store.isoFmt.string(from: Date()) }
    // UTC yyyy-MM-dd, N days from now — matches the web's Date+7d endDate default.
    private static let ymdUTC: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC"); f.dateFormat = "yyyy-MM-dd"; return f
    }()
    private static func plusDaysUTC(_ days: Int) -> String {
        ymdUTC.string(from: Date().addingTimeInterval(TimeInterval(days) * 86_400))
    }

    // MARK: parent PIN

    func setParentPin(_ pin: String) { mutate { $0.parentPin = pin } }

    // MARK: children

    func addChild(name: String, avatar: String, pin: String) {
        mutate { $0.children.append(Child(id: uid(), name: name, avatar: avatar, pin: pin)) }
    }
    func editChild(_ id: String, name: String, avatar: String, pin: String) {
        mutate { s in
            if let i = s.children.firstIndex(where: { $0.id == id }) {
                s.children[i] = Child(id: id, name: name, avatar: avatar, pin: pin)
            }
        }
    }
    func removeChild(_ id: String) {
        mutate { s in
            s.children.removeAll { $0.id == id }
            s.tasks = s.tasks.map { var t = $0; t.assignedTo.removeAll { $0 == id }; return t }
            s.completions.removeAll { $0.childId == id }
            s.manualPenalties.removeAll { $0.childId == id }
        }
    }

    // MARK: tasks

    func addTask(_ task: TaskItem) {
        mutate { s in var t = task; t.id = self.uid(); s.tasks.append(t) }
    }
    // Records reward/penalty history + an edit-log entry when rates change,
    // exactly like context.tsx editTask.
    func editTask(_ id: String, _ task: TaskItem) {
        mutate { s in
            guard let old = s.tasks.first(where: { $0.id == id }) else { return }
            var updated = task; updated.id = id
            var logs: [TaskEditLogEntry] = []
            let affected = Array(Set(old.assignedTo + task.assignedTo))
            let changedAt = self.nowISO()
            let today = Logic.todayStr()
            if old.reward != task.reward {
                updated.rewardHistory = (old.rewardHistory ?? []) + [RewardRate(reward: old.reward, until: today)]
                logs.append(TaskEditLogEntry(id: self.uid(), taskId: id, taskTitle: task.title, childIds: affected, field: "reward", oldValue: old.reward, newValue: task.reward, changedAt: changedAt))
            }
            if old.penalty != task.penalty {
                updated.penaltyHistory = (old.penaltyHistory ?? []) + [PenaltyRate(penalty: old.penalty, until: today)]
                logs.append(TaskEditLogEntry(id: self.uid(), taskId: id, taskTitle: task.title, childIds: affected, field: "penalty", oldValue: old.penalty, newValue: task.penalty, changedAt: changedAt))
            }
            if let i = s.tasks.firstIndex(where: { $0.id == id }) { s.tasks[i] = updated }
            if !logs.isEmpty { s.taskEditLog.append(contentsOf: logs) }
        }
    }
    func removeTask(_ id: String) {
        mutate { s in
            s.tasks.removeAll { $0.id == id }
            s.completions.removeAll { $0.taskId == id }
        }
    }
    // Child proposes a task; parent configures + approves later (pendingApproval).
    func suggestTask(title: String, description: String, childId: String) {
        mutate { s in
            let end = Store.plusDaysUTC(7)
            s.tasks.append(TaskItem(
                id: self.uid(), title: title, description: description, reward: 0, penalty: 0,
                assignedTo: [childId], startDate: Logic.todayStr(), endDate: end,
                recurrence: "once", specificDays: [], reportAtEnd: false,
                rewardHistory: nil, penaltyHistory: nil, pendingApproval: true, suggestedBy: childId))
        }
    }

    // MARK: completions (child marks; parent reviews)

    func completeTask(_ task: TaskItem, childId: String) {
        mutate { s in
            let date = Logic.todayStr()
            if task.recurrence == "once" || task.reportAtEnd {
                if s.completions.contains(where: { $0.taskId == task.id && $0.childId == childId && ($0.approved == nil || $0.approved == true) }) { return }
            } else {
                if s.completions.contains(where: { $0.taskId == task.id && $0.childId == childId && $0.date == date && ($0.approved == nil || $0.approved == true) }) { return }
            }
            s.completions.append(TaskCompletion(id: self.uid(), taskId: task.id, childId: childId, date: date, completedAt: self.nowISO(), approved: nil))
        }
    }
    func uncompleteTask(_ task: TaskItem, childId: String) {
        mutate { s in
            if task.recurrence == "once" || task.reportAtEnd {
                s.completions.removeAll { $0.taskId == task.id && $0.childId == childId && $0.approved != true }
            } else {
                let date = Logic.todayStr()
                s.completions.removeAll { $0.taskId == task.id && $0.childId == childId && $0.date == date && $0.approved != true }
            }
        }
    }
    func approveCompletion(_ id: String, adjustedReward: Int? = nil, comment: String? = nil) {
        mutate { s in
            if let i = s.completions.firstIndex(where: { $0.id == id }) {
                s.completions[i].approved = true
                if let adjustedReward { s.completions[i].adjustedReward = adjustedReward }
                if let comment, !comment.isEmpty { s.completions[i].parentComment = comment }
            }
        }
    }
    func denyCompletion(_ id: String, comment: String? = nil) {
        mutate { s in
            if let i = s.completions.firstIndex(where: { $0.id == id }) {
                s.completions[i].approved = false
                if let comment, !comment.isEmpty { s.completions[i].parentComment = comment }
            }
        }
    }

    // MARK: rewards

    func addReward(title: String, description: String, cost: Int, oneTime: Bool) {
        mutate { s in s.rewards.append(Reward(id: self.uid(), title: title, description: description, cost: cost, oneTime: oneTime ? true : nil, suggestedBy: nil, pendingCost: nil)) }
    }
    func removeReward(_ id: String) {
        mutate { s in
            let reward = s.rewards.first(where: { $0.id == id })
            s.rewards.removeAll { $0.id == id }
            s.rewardClaims = s.rewardClaims.map { c in
                guard c.rewardId == id else { return c }
                var c2 = c
                if c2.rewardTitle == nil { c2.rewardTitle = reward?.title }
                if c2.rewardCost == nil { c2.rewardCost = reward?.cost }
                return c2
            }
        }
    }
    func setPriceForReward(_ id: String, cost: Int) {
        mutate { s in
            if let i = s.rewards.firstIndex(where: { $0.id == id }) { s.rewards[i].cost = cost; s.rewards[i].pendingCost = nil }
        }
    }
    // Child proposes a reward; parent sets the price later (pendingCost).
    func suggestReward(title: String, description: String, childId: String) {
        mutate { s in s.rewards.append(Reward(id: self.uid(), title: title, description: description, cost: 0, oneTime: nil, suggestedBy: childId, pendingCost: true)) }
    }
    func claimReward(_ rewardId: String, childId: String) {
        mutate { s in
            let reward = s.rewards.first(where: { $0.id == rewardId })
            s.rewardClaims.append(RewardClaim(id: self.uid(), rewardId: rewardId, childId: childId, claimedAt: self.nowISO(), approved: true, rewardTitle: reward?.title, rewardCost: reward?.cost))
            if reward?.oneTime == true { s.rewards.removeAll { $0.id == rewardId } }
        }
    }

    // MARK: manual penalties / adjustments

    func addManualPenalty(childId: String, amount: Int, reason: String, forDate: String?) {
        mutate { s in s.manualPenalties.append(ManualPenalty(id: self.uid(), childId: childId, amount: amount, reason: reason, createdAt: self.nowISO(), forDate: forDate)) }
    }
    func removeManualPenalty(_ id: String) { mutate { s in s.manualPenalties.removeAll { $0.id == id } } }

    func addManualAdjustment(childId: String, amount: Int, reason: String, forDate: String?, taskId: String?) {
        mutate { s in s.manualAdjustments.append(ManualAdjustment(id: self.uid(), childId: childId, amount: amount, reason: reason, createdAt: self.nowISO(), forDate: forDate, taskId: taskId)) }
    }
    func removeManualAdjustment(_ id: String) { mutate { s in s.manualAdjustments.removeAll { $0.id == id } } }

    // MARK: account (login/password change)

    func updateAccount(currentPassword: String, newLogin: String?, newPassword: String?) async throws {
        guard let token else { throw APIError.unauthorized }
        let saved = try await api.updateAccount(currentPassword: currentPassword, newLogin: newLogin, newPassword: newPassword, token: token)
        Session.save(token: token, login: saved)
        familyLogin = saved
    }

    // MARK: derived helpers for views

    var pendingCompletions: [TaskCompletion] { state.completions.filter { $0.approved == nil } }
    var pendingTaskSuggestions: [TaskItem] { state.tasks.filter { $0.pendingApproval == true } }
    var pendingRewardSuggestions: [Reward] { state.rewards.filter { $0.pendingCost == true } }
    func balance(_ childId: String) -> Int { Logic.childBalance(state, childId) }
    func child(_ id: String) -> Child? { state.children.first { $0.id == id } }
    func task(_ id: String) -> TaskItem? { state.tasks.first { $0.id == id } }
}
