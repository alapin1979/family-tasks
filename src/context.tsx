import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AppState, Child, Task, TaskCompletion, Reward, RewardClaim, ManualPenalty, ManualAdjustment } from './types';
import { getScheduledDatesBefore, isAutoPenaltyWaived, todayStr } from './utils';

const defaultState: AppState = {
  parentPin: '',
  children: [],
  tasks: [],
  completions: [],
  rewards: [],
  rewardClaims: [],
  manualPenalties: [],
  manualAdjustments: [],
  taskEditLog: [],
};

const TOKEN_KEY = 'family_token';
const LOGIN_KEY = 'family_login';

export function getFamilyToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getFamilyLogin(): string | null {
  return localStorage.getItem(LOGIN_KEY);
}

export function saveFamilySession(token: string, login: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LOGIN_KEY, login);
}

export function clearFamilySession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOGIN_KEY);
}

async function fetchState(token: string): Promise<{ data: AppState | null; unauthorized: boolean }> {
  const res = await fetch('/api/state', { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return { data: null, unauthorized: true };
  const data = await res.json();
  return { data: { ...defaultState, ...data }, unauthorized: false };
}

async function pushState(state: AppState, token: string): Promise<boolean> {
  const res = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(state),
  });
  return res.status === 401;
}

export type CompletionStatus = 'none' | 'pending' | 'approved' | 'denied';

interface AppContextType {
  state: AppState;
  loaded: boolean;
  addChild: (child: Omit<Child, 'id'>) => void;
  editChild: (id: string, child: Omit<Child, 'id'>) => void;
  removeChild: (id: string) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  editTask: (id: string, task: Omit<Task, 'id'>) => void;
  removeTask: (id: string) => void;
  suggestTask: (title: string, description: string, childId: string) => void;
  getPendingTaskSuggestions: () => Task[];
  completeTask: (task: Task, childId: string) => void;
  uncompleteTask: (task: Task, childId: string) => void;
  isTaskDone: (task: Task, childId: string) => boolean;
  getCompletionStatus: (task: Task, childId: string, date?: string) => CompletionStatus;
  approveCompletion: (id: string, adjustedReward?: number, comment?: string) => void;
  denyCompletion: (id: string, comment?: string) => void;
  getPendingCompletions: () => TaskCompletion[];
  addReward: (reward: Omit<Reward, 'id'>) => void;
  removeReward: (id: string) => void;
  suggestReward: (title: string, description: string, childId: string) => void;
  setPriceForReward: (rewardId: string, cost: number) => void;
  getPendingSuggestions: () => Reward[];
  claimReward: (rewardId: string, childId: string) => void;
  approveRewardClaim: (claimId: string) => void;
  denyRewardClaim: (claimId: string) => void;
  addManualPenalty: (p: Omit<ManualPenalty, 'id'>) => void;
  removeManualPenalty: (id: string) => void;
  addManualAdjustment: (a: Omit<ManualAdjustment, 'id'>) => void;
  removeManualAdjustment: (id: string) => void;
  getChildManualAdjustment: (childId: string) => number;
  getChildEarned: (childId: string) => number;
  getChildSpent: (childId: string) => number;
  getChildAutoPenalty: (childId: string) => number;
  getChildManualPenalty: (childId: string) => number;
  getChildBalance: (childId: string) => number;
  getPendingClaims: () => RewardClaim[];
  setParentPin: (pin: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Returns the reward that was in effect for a given completion date, respecting rewardHistory
function rewardForDate(task: Task, date: string): number {
  const history = [...(task.rewardHistory ?? [])].sort((a, b) => a.until.localeCompare(b.until));
  for (const h of history) {
    if (date < h.until) return h.reward;
  }
  return task.reward;
}

// Returns the penalty that was in effect for a given date, respecting penaltyHistory
function penaltyForDate(task: Task, date: string): number {
  const history = [...(task.penaltyHistory ?? [])].sort((a, b) => a.until.localeCompare(b.until));
  for (const h of history) {
    if (date < h.until) return h.penalty;
  }
  return task.penalty;
}

export function AppProvider({ children: reactChildren, onAuthError }: { children: React.ReactNode; onAuthError: () => void }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const savePending = useRef(false);

  useEffect(() => {
    const token = getFamilyToken();
    if (!token) { onAuthError(); return; }
    fetchState(token)
      .then(({ data, unauthorized }) => {
        if (unauthorized) { clearFamilySession(); onAuthError(); return; }
        if (data) setState(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const token = getFamilyToken();
    if (!token) return;
    savePending.current = true;
    const timer = setTimeout(() => {
      pushState(state, token)
        .then(unauthorized => { if (unauthorized) { clearFamilySession(); onAuthError(); } })
        .finally(() => { savePending.current = false; });
    }, 300);
    return () => { clearTimeout(timer); };
  }, [state, loaded]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (savePending.current) return;
      const token = getFamilyToken();
      if (!token) return;
      fetchState(token)
        .then(({ data, unauthorized }) => {
          if (unauthorized) { clearFamilySession(); onAuthError(); return; }
          if (!savePending.current && data) {
            setState(prev =>
              JSON.stringify(prev) !== JSON.stringify(data) ? data : prev
            );
          }
        })
        .catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  function update(updater: (s: AppState) => AppState) {
    setState(s => updater(s));
  }

  const ctx: AppContextType = {
    state,
    loaded,

    setParentPin: (pin) => update(s => ({ ...s, parentPin: pin })),

    addChild: (child) => update(s => ({ ...s, children: [...s.children, { ...child, id: uid() }] })),
    editChild: (id, child) => update(s => ({
      ...s,
      children: s.children.map(c => c.id === id ? { ...child, id } : c),
    })),
    removeChild: (id) => update(s => ({
      ...s,
      children: s.children.filter(c => c.id !== id),
      tasks: s.tasks.map(t => ({ ...t, assignedTo: t.assignedTo.filter(cid => cid !== id) })),
      completions: s.completions.filter(c => c.childId !== id),
      manualPenalties: s.manualPenalties.filter(p => p.childId !== id),
    })),

    addTask: (task) => update(s => ({ ...s, tasks: [...s.tasks, { ...task, id: uid() }] })),
    editTask: (id, task) => update(s => {
      const old = s.tasks.find(t => t.id === id);
      let updatedTask = { ...task, id };
      const editLogEntries: import('./types').TaskEditLogEntry[] = [];

      if (old) {
        const affectedChildIds = Array.from(new Set([...old.assignedTo, ...task.assignedTo]));
        const changedAt = new Date().toISOString();

        // Record old reward in history so past completions keep their original rate
        if (old.reward !== task.reward) {
          updatedTask = {
            ...updatedTask,
            rewardHistory: [...(old.rewardHistory ?? []), { reward: old.reward, until: todayStr() }],
          };
          editLogEntries.push({
            id: uid(), taskId: id, taskTitle: task.title, childIds: affectedChildIds,
            field: 'reward', oldValue: old.reward, newValue: task.reward, changedAt,
          });
        }
        // Record old penalty in history so past missed days keep their original rate
        if (old.penalty !== task.penalty) {
          updatedTask = {
            ...updatedTask,
            penaltyHistory: [...(old.penaltyHistory ?? []), { penalty: old.penalty, until: todayStr() }],
          };
          editLogEntries.push({
            id: uid(), taskId: id, taskTitle: task.title, childIds: affectedChildIds,
            field: 'penalty', oldValue: old.penalty, newValue: task.penalty, changedAt,
          });
        }
      }

      return {
        ...s,
        tasks: s.tasks.map(t => t.id === id ? updatedTask : t),
        taskEditLog: editLogEntries.length ? [...(s.taskEditLog ?? []), ...editLogEntries] : s.taskEditLog,
      };
    }),
    removeTask: (id) => update(s => ({
      ...s,
      tasks: s.tasks.filter(t => t.id !== id),
      completions: s.completions.filter(c => c.taskId !== id),
    })),

    // Child proposes a task; it stays invisible/inert until the parent reviews and saves it via editTask
    suggestTask: (title, description, childId) => update(s => {
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return {
        ...s,
        tasks: [
          ...s.tasks,
          {
            id: uid(), title, description, reward: 0, penalty: 0,
            assignedTo: [childId], startDate: todayStr(), endDate,
            recurrence: 'once', specificDays: [], reportAtEnd: false,
            pendingApproval: true, suggestedBy: childId,
          },
        ],
      };
    }),
    getPendingTaskSuggestions: () => state.tasks.filter(t => t.pendingApproval === true),

    // Child marks task — creates pending completion, parent must approve
    completeTask: (task, childId) => update(s => {
      const date = todayStr();
      if (task.recurrence === 'once' || task.reportAtEnd) {
        const alreadyActive = s.completions.some(
          c => c.taskId === task.id && c.childId === childId && (c.approved === null || c.approved === true)
        );
        if (alreadyActive) return s;
      } else {
        const alreadyActive = s.completions.some(
          c => c.taskId === task.id && c.childId === childId && c.date === date && (c.approved === null || c.approved === true)
        );
        if (alreadyActive) return s;
      }
      return {
        ...s,
        completions: [
          ...s.completions,
          { id: uid(), taskId: task.id, childId, date, completedAt: new Date().toISOString(), approved: null },
        ],
      };
    }),

    // Child can unmark only pending (not-yet-reviewed) or denied completions
    uncompleteTask: (task, childId) => update(s => {
      if (task.recurrence === 'once' || task.reportAtEnd) {
        return {
          ...s,
          completions: s.completions.filter(
            c => !(c.taskId === task.id && c.childId === childId && c.approved !== true)
          ),
        };
      } else {
        const date = todayStr();
        return {
          ...s,
          completions: s.completions.filter(
            c => !(c.taskId === task.id && c.childId === childId && c.date === date && c.approved !== true)
          ),
        };
      }
    }),

    // Task is "done" from child's perspective if pending or approved (not denied/missing)
    isTaskDone: (task, childId) => {
      if (task.recurrence === 'once' || task.reportAtEnd) {
        return state.completions.some(
          c => c.taskId === task.id && c.childId === childId && (c.approved === null || c.approved === true)
        );
      } else {
        const date = todayStr();
        return state.completions.some(
          c => c.taskId === task.id && c.childId === childId && c.date === date && (c.approved === null || c.approved === true)
        );
      }
    },

    getCompletionStatus: (task, childId, date) => {
      const d = date ?? todayStr();
      let comp: TaskCompletion | undefined;
      if (task.recurrence === 'once' || task.reportAtEnd) {
        comp = state.completions.find(c => c.taskId === task.id && c.childId === childId);
      } else {
        comp = state.completions.find(c => c.taskId === task.id && c.childId === childId && c.date === d);
      }
      if (!comp) return 'none';
      if (comp.approved === null) return 'pending';
      if (comp.approved === true) return 'approved';
      return 'denied';
    },

    approveCompletion: (id, adjustedReward, comment) => update(s => ({
      ...s,
      completions: s.completions.map(c => c.id === id ? {
        ...c,
        approved: true,
        ...(adjustedReward !== undefined ? { adjustedReward } : {}),
        ...(comment ? { parentComment: comment } : {}),
      } : c),
    })),

    denyCompletion: (id, comment) => update(s => ({
      ...s,
      completions: s.completions.map(c => c.id === id ? {
        ...c,
        approved: false,
        ...(comment ? { parentComment: comment } : {}),
      } : c),
    })),

    getPendingCompletions: () => state.completions.filter(c => c.approved === null),

    addReward: (reward) => update(s => ({ ...s, rewards: [...s.rewards, { ...reward, id: uid() }] })),
    removeReward: (id) => update(s => {
      const reward = s.rewards.find(r => r.id === id);
      return {
        ...s,
        rewards: s.rewards.filter(r => r.id !== id),
        // Preserve reward info in any existing claims that don't yet have a snapshot
        rewardClaims: s.rewardClaims.map(c =>
          c.rewardId === id
            ? { ...c, rewardTitle: c.rewardTitle ?? reward?.title, rewardCost: c.rewardCost ?? reward?.cost }
            : c
        ),
      };
    }),

    suggestReward: (title, description, childId) => update(s => ({
      ...s,
      rewards: [...s.rewards, { id: uid(), title, description, cost: 0, suggestedBy: childId, pendingCost: true }],
    })),
    setPriceForReward: (rewardId, cost) => update(s => ({
      ...s,
      rewards: s.rewards.map(r => r.id === rewardId ? { ...r, cost, pendingCost: false } : r),
    })),
    getPendingSuggestions: () => state.rewards.filter(r => r.pendingCost === true),

    claimReward: (rewardId, childId) => update(s => {
      const reward = s.rewards.find(r => r.id === rewardId);
      return {
        ...s,
        rewardClaims: [
          ...s.rewardClaims,
          {
            id: uid(), rewardId, childId,
            claimedAt: new Date().toISOString(),
            approved: true,
            rewardTitle: reward?.title,
            rewardCost: reward?.cost,
          },
        ],
        // One-time rewards are removed after being claimed
        rewards: reward?.oneTime ? s.rewards.filter(r => r.id !== rewardId) : s.rewards,
      };
    }),
    approveRewardClaim: (_claimId) => {},
    denyRewardClaim: (_claimId) => {},

    addManualPenalty: (p) => update(s => ({
      ...s,
      manualPenalties: [...s.manualPenalties, { ...p, id: uid() }],
    })),
    removeManualPenalty: (id) => update(s => ({
      ...s,
      manualPenalties: s.manualPenalties.filter(p => p.id !== id),
    })),

    addManualAdjustment: (a) => update(s => ({
      ...s,
      manualAdjustments: [...(s.manualAdjustments ?? []), { ...a, id: uid() }],
    })),
    removeManualAdjustment: (id) => update(s => ({
      ...s,
      manualAdjustments: (s.manualAdjustments ?? []).filter(a => a.id !== id),
    })),
    getChildManualAdjustment: (childId) =>
      (state.manualAdjustments ?? [])
        .filter(a => a.childId === childId)
        .reduce((sum, a) => sum + a.amount, 0),

    // Points awarded per approved day; for once/reportAtEnd — once approved
    getChildEarned: (childId) => {
      let total = 0;
      for (const task of state.tasks) {
        if (task.pendingApproval) continue;
        if (!task.assignedTo.includes(childId)) continue;
        if (task.recurrence === 'once' || task.reportAtEnd) {
          const approvedComp = state.completions.find(
            c => c.taskId === task.id && c.childId === childId && c.approved === true
          );
          if (approvedComp) total += approvedComp.adjustedReward ?? rewardForDate(task, approvedComp.date);
        } else {
          const approvedComps = state.completions.filter(
            c => c.taskId === task.id && c.childId === childId && c.approved === true
          );
          total += approvedComps.reduce((sum, c) => sum + (c.adjustedReward ?? rewardForDate(task, c.date)), 0);
        }
      }
      return total;
    },

    getChildSpent: (childId) => {
      return state.rewardClaims
        .filter(c => c.childId === childId && c.approved)
        .reduce((sum, claim) => {
          const cost = claim.rewardCost ?? state.rewards.find(r => r.id === claim.rewardId)?.cost ?? 0;
          return sum + cost;
        }, 0);
    },

    // Penalty per past scheduled day with no approved or pending completion
    getChildAutoPenalty: (childId) => {
      const today = todayStr();
      let total = 0;
      for (const task of state.tasks) {
        if (task.pendingApproval) continue;
        if (!task.assignedTo.includes(childId)) continue;
        if (task.recurrence === 'once' || task.reportAtEnd) {
          if (task.endDate < today) {
            const penalty = penaltyForDate(task, task.endDate);
            if (penalty === 0) continue;
            const hasValid = state.completions.some(
              c => c.taskId === task.id && c.childId === childId && (c.approved === true || c.approved === null)
            );
            if (!hasValid && !isAutoPenaltyWaived(state.manualAdjustments, task, childId, task.endDate)) total += penalty;
          }
        } else {
          const scheduled = getScheduledDatesBefore(task, today);
          for (const date of scheduled) {
            const penalty = penaltyForDate(task, date);
            if (penalty === 0) continue;
            const hasValid = state.completions.some(
              c => c.taskId === task.id && c.childId === childId && c.date === date && (c.approved === true || c.approved === null)
            );
            if (!hasValid && !isAutoPenaltyWaived(state.manualAdjustments, task, childId, date)) total += penalty;
          }
        }
      }
      return total;
    },

    getChildManualPenalty: (childId) => {
      return state.manualPenalties
        .filter(p => p.childId === childId)
        .reduce((sum, p) => sum + p.amount, 0);
    },

    getChildBalance: (childId) => {
      let earned = 0;
      for (const task of state.tasks) {
        if (task.pendingApproval) continue;
        if (!task.assignedTo.includes(childId)) continue;
        if (task.recurrence === 'once' || task.reportAtEnd) {
          const approvedComp = state.completions.find(
            c => c.taskId === task.id && c.childId === childId && c.approved === true
          );
          if (approvedComp) earned += approvedComp.adjustedReward ?? rewardForDate(task, approvedComp.date);
        } else {
          const approvedComps = state.completions.filter(
            c => c.taskId === task.id && c.childId === childId && c.approved === true
          );
          earned += approvedComps.reduce((sum, c) => sum + (c.adjustedReward ?? rewardForDate(task, c.date)), 0);
        }
      }
      const spent = state.rewardClaims
        .filter(c => c.childId === childId && c.approved)
        .reduce((sum, claim) => {
          const cost = claim.rewardCost ?? state.rewards.find(r => r.id === claim.rewardId)?.cost ?? 0;
          return sum + cost;
        }, 0);
      const today = todayStr();
      let autoPenalty = 0;
      for (const task of state.tasks) {
        if (task.pendingApproval) continue;
        if (!task.assignedTo.includes(childId)) continue;
        if (task.recurrence === 'once' || task.reportAtEnd) {
          if (task.endDate < today) {
            const penalty = penaltyForDate(task, task.endDate);
            if (penalty === 0) continue;
            const hasValid = state.completions.some(
              c => c.taskId === task.id && c.childId === childId && (c.approved === true || c.approved === null)
            );
            if (!hasValid && !isAutoPenaltyWaived(state.manualAdjustments, task, childId, task.endDate)) autoPenalty += penalty;
          }
        } else {
          const scheduled = getScheduledDatesBefore(task, today);
          for (const date of scheduled) {
            const penalty = penaltyForDate(task, date);
            if (penalty === 0) continue;
            const hasValid = state.completions.some(
              c => c.taskId === task.id && c.childId === childId && c.date === date && (c.approved === true || c.approved === null)
            );
            if (!hasValid && !isAutoPenaltyWaived(state.manualAdjustments, task, childId, date)) autoPenalty += penalty;
          }
        }
      }
      const manualPenalty = state.manualPenalties
        .filter(p => p.childId === childId)
        .reduce((sum, p) => sum + p.amount, 0);
      const manualAdjustment = (state.manualAdjustments ?? [])
        .filter(a => a.childId === childId)
        .reduce((sum, a) => sum + a.amount, 0);
      return earned - spent - autoPenalty - manualPenalty + manualAdjustment;
    },

    getPendingClaims: () => state.rewardClaims.filter(c => !c.approved),
  };

  return <AppContext.Provider value={ctx}>{reactChildren}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
