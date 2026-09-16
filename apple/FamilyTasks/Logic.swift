import Foundation

enum CompletionStatus { case none, pending, approved, denied }

// Faithful port of src/utils.ts + the balance/scheduling logic in
// src/context.tsx. Dates are "yyyy-MM-dd" strings; lexical order == calendar
// order, matching the web's string comparisons. "Today" is computed in UTC to
// match the web's `new Date().toISOString().split('T')[0]`.
enum Logic {
    static let dowLabels: [Int: String] = [1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 0: "Вс"]
    static let dowOrder = [1, 2, 3, 4, 5, 6, 0]

    private static let localCal: Calendar = {
        var c = Calendar(identifier: .gregorian); c.timeZone = .current; return c
    }()
    private static let utcFmt: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC"); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    static func todayStr() -> String { utcFmt.string(from: Date()) }

    private static func localNoon(_ ymd: String) -> Date? {
        let parts = ymd.split(separator: "-")
        guard parts.count == 3, let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]) else { return nil }
        var comp = DateComponents(); comp.year = y; comp.month = m; comp.day = d; comp.hour = 12
        return localCal.date(from: comp)
    }
    private static func ymdUTC(_ date: Date) -> String { utcFmt.string(from: date) }

    static func isScheduledOn(_ task: TaskItem, _ date: String) -> Bool {
        if date < task.startDate || date > task.endDate { return false }
        guard let d = localNoon(date) else { return false }
        let dow = (localCal.component(.weekday, from: d) + 6) % 7  // 0=Sun ... 6=Sat
        switch task.recurrence {
        case "once", "daily": return true
        case "weekdays": return dow >= 1 && dow <= 5
        case "specific_days": return task.specificDays.contains(dow)
        default: return false
        }
    }

    static func getScheduledDatesBefore(_ task: TaskItem, _ before: String) -> [String] {
        if task.recurrence == "once" || task.reportAtEnd { return [] }
        var dates: [String] = []
        guard var cur = localNoon(task.startDate) else { return [] }
        let endLimitStr = task.endDate < before ? task.endDate : before
        guard let endDate = localNoon(endLimitStr) else { return [] }
        while cur < endDate {
            let d = ymdUTC(cur)
            if isScheduledOn(task, d) { dates.append(d) }
            guard let next = localCal.date(byAdding: .day, value: 1, to: cur) else { break }
            cur = next
        }
        return dates
    }

    static func rewardForDate(_ task: TaskItem, _ date: String) -> Int {
        for h in (task.rewardHistory ?? []).sorted(by: { $0.until < $1.until }) where date < h.until { return h.reward }
        return task.reward
    }
    static func penaltyForDate(_ task: TaskItem, _ date: String) -> Int {
        for h in (task.penaltyHistory ?? []).sorted(by: { $0.until < $1.until }) where date < h.until { return h.penalty }
        return task.penalty
    }

    // A correction linked to a task cancels ("reverts") that task's automatic
    // missed-day penalty. once / report-at-end tasks have a single penalty, so
    // any linked correction waives it; recurring tasks are waived only for the
    // correction's own day. Derived from manualAdjustments — no stored field.
    static func isAutoPenaltyWaived(_ adjustments: [ManualAdjustment], _ task: TaskItem, _ childId: String, _ penaltyDate: String) -> Bool {
        let perTask = task.recurrence == "once" || task.reportAtEnd
        return adjustments.contains { a in
            a.taskId == task.id && a.childId == childId &&
            (perTask || (a.forDate ?? String(a.createdAt.prefix(while: { $0 != "T" }))) == penaltyDate)
        }
    }

    // The automatic missed-task penalty currently in force for a task on a given
    // day (0 if none). Used to preview which fine a task-linked correction reverts.
    static func activeFineFor(_ task: TaskItem, _ childId: String, _ date: String, _ s: AppState) -> Int {
        let perTask = task.recurrence == "once" || task.reportAtEnd
        let today = todayStr()
        if perTask {
            if !(task.endDate < today) { return 0 }
        } else {
            if !(date < today) { return 0 }
            if !isScheduledOn(task, date) { return 0 }
        }
        let penDate = perTask ? task.endDate : date
        let penalty = penaltyForDate(task, penDate)
        if penalty == 0 { return 0 }
        let hasValid = perTask
            ? s.completions.contains { $0.taskId == task.id && $0.childId == childId && ($0.approved == true || $0.approved == nil) }
            : s.completions.contains { $0.taskId == task.id && $0.childId == childId && $0.date == date && ($0.approved == true || $0.approved == nil) }
        return hasValid ? 0 : penalty
    }

    static func isTaskDone(_ s: AppState, _ task: TaskItem, _ childId: String) -> Bool {
        if task.recurrence == "once" || task.reportAtEnd {
            return s.completions.contains { $0.taskId == task.id && $0.childId == childId && ($0.approved == nil || $0.approved == true) }
        }
        let date = todayStr()
        return s.completions.contains { $0.taskId == task.id && $0.childId == childId && $0.date == date && ($0.approved == nil || $0.approved == true) }
    }

    static func completionStatus(_ s: AppState, _ task: TaskItem, _ childId: String, date: String? = nil) -> CompletionStatus {
        let d = date ?? todayStr()
        let comp: TaskCompletion?
        if task.recurrence == "once" || task.reportAtEnd {
            comp = s.completions.first { $0.taskId == task.id && $0.childId == childId }
        } else {
            comp = s.completions.first { $0.taskId == task.id && $0.childId == childId && $0.date == d }
        }
        guard let comp else { return .none }
        if comp.approved == nil { return .pending }
        return comp.approved == true ? .approved : .denied
    }

    static func childEarned(_ s: AppState, _ childId: String) -> Int {
        var total = 0
        for task in s.tasks {
            if task.pendingApproval == true { continue }
            if !task.assignedTo.contains(childId) { continue }
            if task.recurrence == "once" || task.reportAtEnd {
                if let c = s.completions.first(where: { $0.taskId == task.id && $0.childId == childId && $0.approved == true }) {
                    total += c.adjustedReward ?? rewardForDate(task, c.date)
                }
            } else {
                for c in s.completions where c.taskId == task.id && c.childId == childId && c.approved == true {
                    total += c.adjustedReward ?? rewardForDate(task, c.date)
                }
            }
        }
        return total
    }

    static func childSpent(_ s: AppState, _ childId: String) -> Int {
        s.rewardClaims.filter { $0.childId == childId && $0.approved }
            .reduce(0) { sum, claim in sum + (claim.rewardCost ?? s.rewards.first(where: { $0.id == claim.rewardId })?.cost ?? 0) }
    }

    static func childAutoPenalty(_ s: AppState, _ childId: String) -> Int {
        let today = todayStr()
        var total = 0
        for task in s.tasks {
            if task.pendingApproval == true { continue }
            if !task.assignedTo.contains(childId) { continue }
            if task.recurrence == "once" || task.reportAtEnd {
                if task.endDate < today {
                    let penalty = penaltyForDate(task, task.endDate)
                    if penalty == 0 { continue }
                    let hasValid = s.completions.contains { $0.taskId == task.id && $0.childId == childId && ($0.approved == true || $0.approved == nil) }
                    if !hasValid && !isAutoPenaltyWaived(s.manualAdjustments, task, childId, task.endDate) { total += penalty }
                }
            } else {
                for date in getScheduledDatesBefore(task, today) {
                    let penalty = penaltyForDate(task, date)
                    if penalty == 0 { continue }
                    let hasValid = s.completions.contains { $0.taskId == task.id && $0.childId == childId && $0.date == date && ($0.approved == true || $0.approved == nil) }
                    if !hasValid && !isAutoPenaltyWaived(s.manualAdjustments, task, childId, date) { total += penalty }
                }
            }
        }
        return total
    }

    static func childManualPenalty(_ s: AppState, _ childId: String) -> Int {
        s.manualPenalties.filter { $0.childId == childId }.reduce(0) { $0 + $1.amount }
    }
    static func childManualAdjustment(_ s: AppState, _ childId: String) -> Int {
        s.manualAdjustments.filter { $0.childId == childId }.reduce(0) { $0 + $1.amount }
    }

    static func childBalance(_ s: AppState, _ childId: String) -> Int {
        childEarned(s, childId) - childSpent(s, childId) - childAutoPenalty(s, childId)
            - childManualPenalty(s, childId) + childManualAdjustment(s, childId)
    }

    static func parsePts(_ s: String) -> Int {
        Int(s.filter { $0.isNumber }) ?? 0
    }

    static func fmtPts(_ n: Int) -> String {
        let neg = n < 0
        var digits = Array(String(abs(n)))
        var out = ""
        var count = 0
        while let d = digits.popLast() {
            if count > 0 && count % 3 == 0 { out = " " + out }
            out = String(d) + out
            count += 1
        }
        return (neg ? "-" : "") + out
    }

    static func recurrenceLabel(_ task: TaskItem) -> String {
        switch task.recurrence {
        case "once": return "Один раз"
        case "daily": return "Каждый день"
        case "weekdays": return "По будням"
        case "specific_days":
            return task.specificDays.isEmpty ? "Дни не выбраны"
                : dowOrder.filter { task.specificDays.contains($0) }.compactMap { dowLabels[$0] }.joined(separator: ", ")
        default: return ""
        }
    }
}
