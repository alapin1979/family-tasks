import Foundation

// Mirrors src/types.ts exactly. All date/time fields are kept as opaque
// strings (never parsed to Date) so re-encoding never changes their format.
// The server's PUT /api/state replaces the whole family file with the body,
// so the app must always send back the COMPLETE state — every field here is
// modeled so a decode -> mutate -> encode round-trip loses nothing.

struct Child: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var avatar: String
    var pin: String
}

struct RewardRate: Codable, Hashable {
    var reward: Int
    var until: String
}

struct PenaltyRate: Codable, Hashable {
    var penalty: Int
    var until: String
}

struct TaskItem: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var description: String
    var reward: Int
    var penalty: Int
    var assignedTo: [String]
    var startDate: String
    var endDate: String
    var recurrence: String            // once | daily | weekdays | specific_days
    var specificDays: [Int]
    var reportAtEnd: Bool
    var rewardHistory: [RewardRate]?
    var penaltyHistory: [PenaltyRate]?
    var pendingApproval: Bool?
    var suggestedBy: String?
}

// approved is a THREE-state value in the web app: null = pending review,
// true = approved, false = denied. The web checks `approved === null`, so a
// pending completion MUST serialize as an explicit `"approved": null` — never
// as an omitted key (which JS would read as undefined and treat as denied).
struct TaskCompletion: Codable, Identifiable, Hashable {
    var id: String
    var taskId: String
    var childId: String
    var date: String
    var completedAt: String
    var approved: Bool?               // nil = pending
    var adjustedReward: Int?
    var parentComment: String?

    enum CodingKeys: String, CodingKey {
        case id, taskId, childId, date, completedAt, approved, adjustedReward, parentComment
    }

    init(id: String, taskId: String, childId: String, date: String, completedAt: String,
         approved: Bool?, adjustedReward: Int? = nil, parentComment: String? = nil) {
        self.id = id; self.taskId = taskId; self.childId = childId; self.date = date
        self.completedAt = completedAt; self.approved = approved
        self.adjustedReward = adjustedReward; self.parentComment = parentComment
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        taskId = try c.decode(String.self, forKey: .taskId)
        childId = try c.decode(String.self, forKey: .childId)
        date = try c.decode(String.self, forKey: .date)
        completedAt = try c.decode(String.self, forKey: .completedAt)
        // present-with-null and missing both decode to nil
        approved = try c.decodeIfPresent(Bool.self, forKey: .approved)
        adjustedReward = try c.decodeIfPresent(Int.self, forKey: .adjustedReward)
        parentComment = try c.decodeIfPresent(String.self, forKey: .parentComment)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(taskId, forKey: .taskId)
        try c.encode(childId, forKey: .childId)
        try c.encode(date, forKey: .date)
        try c.encode(completedAt, forKey: .completedAt)
        // ALWAYS emit approved, as explicit null when pending (matches web semantics)
        try c.encode(approved, forKey: .approved)
        try c.encodeIfPresent(adjustedReward, forKey: .adjustedReward)
        try c.encodeIfPresent(parentComment, forKey: .parentComment)
    }
}

struct Reward: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var description: String
    var cost: Int
    var oneTime: Bool?
    var suggestedBy: String?
    var pendingCost: Bool?
}

struct RewardClaim: Codable, Identifiable, Hashable {
    var id: String
    var rewardId: String
    var childId: String
    var claimedAt: String
    var approved: Bool
    var rewardTitle: String?
    var rewardCost: Int?
}

struct ManualPenalty: Codable, Identifiable, Hashable {
    var id: String
    var childId: String
    var amount: Int
    var reason: String
    var createdAt: String
    var forDate: String?
}

struct ManualAdjustment: Codable, Identifiable, Hashable {
    var id: String
    var childId: String
    var amount: Int
    var reason: String
    var createdAt: String
    var forDate: String?
    var taskId: String?
}

struct TaskEditLogEntry: Codable, Identifiable, Hashable {
    var id: String
    var taskId: String
    var taskTitle: String
    var childIds: [String]
    var field: String                 // reward | penalty
    var oldValue: Int
    var newValue: Int
    var changedAt: String
}

struct AppState: Codable, Hashable {
    var parentPin: String
    var children: [Child]
    var tasks: [TaskItem]
    var completions: [TaskCompletion]
    var rewards: [Reward]
    var rewardClaims: [RewardClaim]
    var manualPenalties: [ManualPenalty]
    var manualAdjustments: [ManualAdjustment]
    var taskEditLog: [TaskEditLogEntry]

    static let empty = AppState(
        parentPin: "", children: [], tasks: [], completions: [], rewards: [],
        rewardClaims: [], manualPenalties: [], manualAdjustments: [], taskEditLog: []
    )

    init(parentPin: String, children: [Child], tasks: [TaskItem], completions: [TaskCompletion],
         rewards: [Reward], rewardClaims: [RewardClaim], manualPenalties: [ManualPenalty],
         manualAdjustments: [ManualAdjustment], taskEditLog: [TaskEditLogEntry]) {
        self.parentPin = parentPin; self.children = children; self.tasks = tasks
        self.completions = completions; self.rewards = rewards; self.rewardClaims = rewardClaims
        self.manualPenalties = manualPenalties; self.manualAdjustments = manualAdjustments
        self.taskEditLog = taskEditLog
    }

    // Mirror the web's `{ ...defaultState, ...data }`: any missing top-level
    // field falls back to its empty default instead of failing to decode.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        parentPin = try c.decodeIfPresent(String.self, forKey: .parentPin) ?? ""
        children = try c.decodeIfPresent([Child].self, forKey: .children) ?? []
        tasks = try c.decodeIfPresent([TaskItem].self, forKey: .tasks) ?? []
        completions = try c.decodeIfPresent([TaskCompletion].self, forKey: .completions) ?? []
        rewards = try c.decodeIfPresent([Reward].self, forKey: .rewards) ?? []
        rewardClaims = try c.decodeIfPresent([RewardClaim].self, forKey: .rewardClaims) ?? []
        manualPenalties = try c.decodeIfPresent([ManualPenalty].self, forKey: .manualPenalties) ?? []
        manualAdjustments = try c.decodeIfPresent([ManualAdjustment].self, forKey: .manualAdjustments) ?? []
        taskEditLog = try c.decodeIfPresent([TaskEditLogEntry].self, forKey: .taskEditLog) ?? []
    }
}
