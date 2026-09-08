export type RecurrenceType = 'once' | 'daily' | 'weekdays' | 'specific_days';

export interface Child {
  id: string;
  name: string;
  avatar: string;
  pin: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  penalty: number; // points deducted per missed occurrence (0 = no penalty)
  assignedTo: string[];
  startDate: string;
  endDate: string;
  recurrence: RecurrenceType;
  specificDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat (used when recurrence='specific_days')
  reportAtEnd: boolean; // if true — one checkbox for whole period, not per-day
  rewardHistory?: { reward: number; until: string }[];  // past reward rates keyed by effective-until date
  penaltyHistory?: { penalty: number; until: string }[]; // past penalty rates keyed by effective-until date
  pendingApproval?: boolean; // true = child-suggested task waiting for parent to approve/configure
  suggestedBy?: string;      // childId if proposed by child
}

export interface TaskCompletion {
  id: string;
  taskId: string;
  childId: string;
  date: string; // YYYY-MM-DD
  completedAt: string;
  approved: boolean | null; // null = pending parent review, true = approved, false = denied
  adjustedReward?: number;  // parent override for this completion's points
  parentComment?: string;   // parent's note shown to the child
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  cost: number;
  oneTime?: boolean;     // if true — deleted after first claim
  suggestedBy?: string;  // childId if proposed by child
  pendingCost?: boolean; // true = waiting for parent to set price
}

export interface RewardClaim {
  id: string;
  rewardId: string;
  childId: string;
  claimedAt: string;
  approved: boolean;
  rewardTitle?: string;  // snapshot at claim time — preserved if reward is deleted
  rewardCost?: number;   // snapshot at claim time — preserved if reward is deleted
}

export interface ManualPenalty {
  id: string;
  childId: string;
  amount: number;
  reason: string;
  createdAt: string; // when the penalty was actually entered
  forDate?: string;   // YYYY-MM-DD this penalty is dated for, if backdated (defaults to createdAt's date)
}

export interface ManualAdjustment {
  id: string;
  childId: string;
  amount: number; // positive = add points, negative = remove points
  reason: string;
  createdAt: string; // when the correction was actually entered
  forDate?: string;   // YYYY-MM-DD this correction is dated for, if backdated (defaults to createdAt's date)
  taskId?: string;    // optional: which task this correction relates to
}

// Audit entry recorded whenever a task's reward or penalty rate is edited,
// so parents/children can see what changed, when, and for which task.
export interface TaskEditLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;   // snapshot — survives task deletion
  childIds: string[];  // children affected, snapshot at edit time
  field: 'reward' | 'penalty';
  oldValue: number;
  newValue: number;
  changedAt: string;
}

export interface AppState {
  parentPin: string;
  children: Child[];
  tasks: Task[];
  completions: TaskCompletion[];
  rewards: Reward[];
  rewardClaims: RewardClaim[];
  manualPenalties: ManualPenalty[];
  manualAdjustments: ManualAdjustment[];
  taskEditLog: TaskEditLogEntry[];
}

export type ActiveView = 'home' | 'parent' | 'child';
