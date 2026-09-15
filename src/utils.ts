import type { ManualAdjustment, Task } from './types';

export const DOW_LABELS: Record<number, string> = {
  1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Вс',
};
// Display order: Mon–Sun
export const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/** Is the task scheduled to be done on this specific date? */
export function isScheduledOn(task: Task, date: string): boolean {
  if (date < task.startDate || date > task.endDate) return false;
  const dow = new Date(date + 'T12:00:00').getDay();
  switch (task.recurrence) {
    case 'once': return true;
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'specific_days': return task.specificDays.includes(dow);
  }
}

/**
 * Returns all dates (YYYY-MM-DD) the task was scheduled,
 * from startDate up to (but NOT including) `before`.
 * Used to find missed days for penalty calculation.
 */
export function getScheduledDatesBefore(task: Task, before: string): string[] {
  if (task.recurrence === 'once' || task.reportAtEnd) return []; // handled separately
  const dates: string[] = [];
  const cur = new Date(task.startDate + 'T12:00:00');
  const endLimit = task.endDate < before ? task.endDate : before;
  const endDate = new Date(endLimit + 'T12:00:00');
  while (cur < endDate) {
    const d = cur.toISOString().split('T')[0];
    if (isScheduledOn(task, d)) dates.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Returns all dates in the task's full period (startDate..endDate inclusive). */
export function getScheduledDates(task: Task): string[] {
  if (task.recurrence === 'once' || task.reportAtEnd) return [task.startDate];
  const dates: string[] = [];
  const cur = new Date(task.startDate + 'T12:00:00');
  const end = new Date(task.endDate + 'T12:00:00');
  while (cur <= end) {
    const d = cur.toISOString().split('T')[0];
    if (isScheduledOn(task, d)) dates.push(d);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Format a number with space thousands separators: 100000 → "100 000" */
export function fmtPts(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Parse a formatted number string back to number, stripping spaces: "100 000" → 100000 */
export function parsePts(s: string): number {
  const n = parseInt(s.replace(/[\s ]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * A correction linked to a task cancels ("reverts") that task's automatic
 * missed-day penalty — the parent has taken manual control of the outcome.
 * once / report-at-end tasks have a single penalty, so any linked correction
 * waives it; recurring tasks are waived only for the correction's own day.
 */
export function isAutoPenaltyWaived(
  adjustments: ManualAdjustment[] | undefined,
  task: Task,
  childId: string,
  penaltyDate: string,
): boolean {
  const perTask = task.recurrence === 'once' || task.reportAtEnd;
  return (adjustments ?? []).some(a =>
    a.taskId === task.id &&
    a.childId === childId &&
    (perTask || (a.forDate ?? a.createdAt.split('T')[0]) === penaltyDate)
  );
}

export function recurrenceLabel(task: Task): string {
  switch (task.recurrence) {
    case 'once': return 'Один раз';
    case 'daily': return 'Каждый день';
    case 'weekdays': return 'По будням';
    case 'specific_days':
      return task.specificDays.length
        ? DOW_ORDER.filter(d => task.specificDays.includes(d)).map(d => DOW_LABELS[d]).join(', ')
        : 'Дни не выбраны';
  }
}
