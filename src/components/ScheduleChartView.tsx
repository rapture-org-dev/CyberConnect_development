'use client';

import { useMemo } from 'react';
import type { SheetRow } from '@/types';
import { getLocalizedCell, translate, type Language } from '@/lib/data';

function parseSheetDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86400000);
}

const statusBarClass: Record<string, string> = {
  'Not started': 'bg-gray-500/80',
  'In progress': 'bg-amber-500/85',
  'In review': 'bg-cyan-500/85',
  Done: 'bg-emerald-500/85',
  Blocked: 'bg-red-500/80',
  'Need to be checked': 'bg-brand-500/80',
};

interface Props {
  tasks: SheetRow[];
  language: Language;
}

export function ScheduleChartView({ tasks, language }: Props) {
  const { rangeStart, rangeEnd, rows, todayOffsetFrac } = useMemo(() => {
    const today = startOfDay(new Date());
    const items: {
      row: SheetRow;
      label: string;
      code: string;
      start: Date;
      end: Date;
      status: string;
      sprint: string;
    }[] = [];

    for (const row of tasks) {
      const deadline = parseSheetDate(row.deadline);
      const completed = parseSheetDate(row.completed_date);
      const pd = Math.min(21, Math.max(1, Math.round(Number(row.person_day) || 5)));
      const status = String(row.status ?? 'Not started');

      const end: Date | null = deadline ?? completed;
      if (!end) continue;

      let start = deadline ? addDays(end, -pd) : addDays(end, -1);
      if (start > end) start = addDays(end, -1);

      const label = getLocalizedCell(row, 'task', language) || '—';
      const code = String(row.task_code ?? '').trim() || '—';
      const sprint = getLocalizedCell(row, 'sprint', language) || '';

      items.push({ row, label, code, start: startOfDay(start), end: startOfDay(end), status, sprint });
    }

    items.sort((a, b) => a.end.getTime() - b.end.getTime() || a.start.getTime() - b.start.getTime());

    let rangeStart = addDays(today, -7);
    let rangeEnd = addDays(today, 42);
    for (const it of items) {
      if (it.start < rangeStart) rangeStart = it.start;
      if (it.end > rangeEnd) rangeEnd = it.end;
    }
    if (items.length === 0) {
      rangeStart = addDays(today, -7);
      rangeEnd = addDays(today, 56);
    } else {
      rangeStart = addDays(rangeStart, -3);
      rangeEnd = addDays(rangeEnd, 7);
    }

    const totalDays = Math.max(1, diffDays(rangeStart, rangeEnd));
    const todayOff = diffDays(rangeStart, today);
    const todayOffsetFrac = Math.min(1, Math.max(0, todayOff / totalDays));

    return { rangeStart, rangeEnd, rows: items, todayOffsetFrac };
  }, [tasks, language]);

  const undated = useMemo(() => {
    const datedIds = new Set(rows.map((r) => r.row.id));
    return tasks.filter((t) => !datedIds.has(t.id));
  }, [tasks, rows]);

  const totalDays = Math.max(1, diffDays(rangeStart, rangeEnd));
  const monthTicks = useMemo(() => {
    const ticks: { date: Date; left: number }[] = [];
    let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const end = rangeEnd;
    while (cur <= end) {
      if (cur >= rangeStart) {
        const left = diffDays(rangeStart, cur) / totalDays;
        ticks.push({ date: new Date(cur), left });
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return ticks;
  }, [rangeStart, rangeEnd, totalDays]);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-US', {
        month: 'short',
        day: 'numeric',
      }),
    [language]
  );

  if (tasks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-surface-950 px-6 py-16 text-center">
        <p className="text-lg text-gray-300">
          {language === 'ja' ? 'タスクがありません。' : 'No tasks in this project yet.'}
        </p>
        <p className="max-w-md text-sm text-gray-500">
          {language === 'ja'
            ? 'スケジュールは「タスク」シートの行から生成されます。'
            : 'The schedule is built from rows on the Tasks sheet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-950">
      <div className="shrink-0 border-b border-surface-800 px-4 py-3">
        <p className="text-sm text-gray-400">
          {language === 'ja'
            ? '期限・完了日と工数（P/Day）からタイムラインを表示します。期限がないタスクは下に一覧します。'
            : 'Timeline from deadlines, completion dates, and person-days (P/Day). Tasks without a deadline are listed below.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400">
            {language === 'ja'
              ? '期限または完了日があるタスクがありません。「タスク」で期限を設定してください。'
              : 'No tasks have a deadline or completion date yet. Set deadlines on the Tasks sheet.'}
          </div>
        ) : (
          <div className="flex min-w-[720px] flex-col gap-0 p-4">
            <div className="flex border-b border-surface-800 pb-2 pl-[19rem] pr-2">
              <div className="relative h-8 flex-1">
                {monthTicks.map((t, i) => (
                  <span
                    key={i}
                    className="absolute top-0 whitespace-nowrap text-xs text-gray-500"
                    style={{ left: `${t.left * 100}%`, transform: 'translateX(-2px)' }}
                  >
                    {fmt.format(t.date)}
                  </span>
                ))}
              </div>
            </div>

            {rows.map((item) => {
              const sOff = diffDays(rangeStart, item.start);
              const eOff = diffDays(rangeStart, item.end);
              const left = Math.max(0, sOff / totalDays);
              const right = Math.min(1, eOff / totalDays);
              const width = Math.max(0.01, right - left);
              const barClass = statusBarClass[item.status] ?? 'bg-brand-600/80';

              return (
                <div
                  key={item.row.id}
                  className="flex min-h-[44px] items-center border-b border-surface-800/80 py-1.5"
                >
                  <div className="w-72 shrink-0 pr-3">
                    <div className="truncate font-mono text-xs text-brand-400">{item.code}</div>
                    <div className="truncate text-sm text-gray-200" title={item.label}>
                      {item.label}
                    </div>
                    {item.sprint ? (
                      <div className="truncate text-[11px] text-gray-500">{item.sprint}</div>
                    ) : null}
                  </div>
                  <div className="relative h-9 min-w-0 flex-1 rounded bg-surface-900/80">
                    <div
                      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-brand-400/70"
                      style={{ left: `${todayOffsetFrac * 100}%` }}
                      title={language === 'ja' ? '今日' : 'Today'}
                    />
                    <div
                      className={`absolute top-1/2 h-6 -translate-y-1/2 rounded-md shadow-sm ${barClass} ring-1 ring-black/20`}
                      style={{
                        left: `${left * 100}%`,
                        width: `${width * 100}%`,
                        minWidth: 4,
                      }}
                      title={`${item.start.toISOString().slice(0, 10)} → ${item.end.toISOString().slice(0, 10)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {undated.length > 0 && (
          <div className="border-t border-surface-800 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-300">
              {language === 'ja' ? '期限なし' : 'No deadline'}
              <span className="ml-2 text-gray-500">({undated.length})</span>
            </h3>
            <ul className="max-h-48 space-y-1 overflow-auto text-sm text-gray-400">
              {undated.map((r) => (
                <li key={r.id} className="flex gap-2 truncate">
                  <span className="shrink-0 font-mono text-xs text-brand-400/90">
                    {String(r.task_code ?? '').trim() || '—'}
                  </span>
                  <span className="truncate">{getLocalizedCell(r, 'task', language)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-surface-800 bg-surface-900/50 px-4 py-2">
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          <span className="text-gray-400">{translate('Status', language)}</span>
          {Object.keys(statusBarClass).map((st) => (
            <span key={st} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-6 rounded ${statusBarClass[st]}`} />
              {st}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
