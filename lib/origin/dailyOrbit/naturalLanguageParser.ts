import type { Recurrence } from "./types";

export type ParsedTask = {
  text: string;
  dueDate?: string;
  dueTime?: string;
  recurrence?: Recurrence;
};

const DAY_MAP: Record<string, number> = {
  '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6,
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function parseTaskInput(raw: string): ParsedTask {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Normalize full-width digits to half-width before parsing
  let text = toHalfWidth(raw);
  let dueDate: string | undefined;
  let dueTime: string | undefined;
  let recurrence: ParsedTask['recurrence'] | undefined;

  // 毎週X曜 (must check before 来週X曜)
  const weeklyMatch = text.match(/毎週([日月火水木金土])曜/);
  if (weeklyMatch) {
    const dayNum = DAY_MAP[weeklyMatch[1]];
    if (dayNum !== undefined) {
      recurrence = { pattern: 'weekly', dayOfWeek: dayNum };
      text = text.replace(weeklyMatch[0], '');
    }
  }

  // 隔週X曜
  if (!recurrence) {
    const biweeklyMatch = text.match(/隔週([日月火水木金土])曜/);
    if (biweeklyMatch) {
      const dayNum = DAY_MAP[biweeklyMatch[1]];
      if (dayNum !== undefined) {
        recurrence = { pattern: 'biweekly', dayOfWeek: dayNum };
        text = text.replace(biweeklyMatch[0], '');
      }
    }
  }

  // 毎月X日 / 毎月月末
  if (!recurrence) {
    const monthEndMatch = text.match(/毎月(?:月末|末日)/);
    if (monthEndMatch) {
      recurrence = { pattern: 'monthly', dayOfMonth: 32 };
      text = text.replace(monthEndMatch[0], '');
    } else {
      const monthlyMatch = text.match(/毎月(\d{1,2})日/);
      if (monthlyMatch) {
        const dom = parseInt(monthlyMatch[1], 10);
        if (dom >= 1 && dom <= 31) {
          recurrence = { pattern: 'monthly', dayOfMonth: dom };
          text = text.replace(monthlyMatch[0], '');
        }
      }
    }
  }

  // X日ごと / X日おき
  if (!recurrence) {
    const customMatch = text.match(/(\d{1,3})日(?:ごと|おき|毎)/);
    if (customMatch) {
      const interval = parseInt(customMatch[1], 10);
      if (interval >= 2 && interval <= 365) {
        recurrence = { pattern: 'custom', intervalDays: interval };
        text = text.replace(customMatch[0], '');
      }
    }
  }

  // 毎平日 / 平日毎日
  if (!recurrence && /(?:毎平日|平日(?:毎日)?)/.test(text)) {
    recurrence = { pattern: 'weekdays' };
    text = text.replace(/(?:毎平日|平日(?:毎日)?)/, '');
  }

  // 毎朝 → daily
  if (!recurrence && /毎朝/.test(text)) {
    recurrence = { pattern: 'daily' };
    text = text.replace(/毎朝/, '');
  }

  // 毎日 (skip if followed by kanji like 毎日新聞)
  if (!recurrence && /毎日(?![\p{Script=Han}])/u.test(text)) {
    recurrence = { pattern: 'daily' };
    text = text.replace(/毎日/, '');
  }

  // 明後日 (must check before 明日; only when followed by space, digit, or end)
  if (/明後日(?=[\s　\d]|$)/.test(text)) {
    dueDate = toISODate(addDays(today, 2));
    text = text.replace(/明後日/, '');
  }

  // 明日 (only when followed by space, digit, or end — prevents 明日香, 明日は天気が...)
  if (!dueDate && /明日(?=[\s　\d]|$)/.test(text)) {
    dueDate = toISODate(addDays(today, 1));
    text = text.replace(/明日/, '');
  }

  // 来週X曜
  if (!dueDate) {
    const nextWeekMatch = text.match(/来週([日月火水木金土])曜/);
    if (nextWeekMatch) {
      const targetDay = DAY_MAP[nextWeekMatch[1]];
      if (targetDay !== undefined) {
        const currentDay = today.getDay();
        // "next week" = the coming Monday-Sunday block after this week
        const daysUntilNextMonday = ((1 - currentDay) + 7) % 7 || 7;
        const nextMonday = addDays(today, daysUntilNextMonday);
        const offset = (targetDay - 1 + 7) % 7; // days from Monday (日=6)
        dueDate = toISODate(addDays(nextMonday, offset));
        text = text.replace(nextWeekMatch[0], '');
      }
    }
  }

  // X月X日
  if (!dueDate) {
    const dateMatch = text.match(/([０-９\d]{1,2})月([０-９\d]{1,2})日/);
    if (dateMatch) {
      const month = parseInt(toHalfWidth(dateMatch[1]), 10);
      const day = parseInt(toHalfWidth(dateMatch[2]), 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        let year = today.getFullYear();
        const candidate = new Date(year, month - 1, day);
        candidate.setHours(0, 0, 0, 0);
        if (candidate < today) {
          year += 1;
        }
        dueDate = toISODate(new Date(year, month - 1, day));
        text = text.replace(dateMatch[0], '');
      }
    }
  }

  // X時 / X時半 (skip if followed by 間 like 3時間, 14時間)
  const timeMatch = text.match(/(\d{1,2})時半?(?!間)/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const hasHalf = timeMatch[0].endsWith('半');
    if (hour >= 0 && hour <= 23) {
      dueTime = `${String(hour).padStart(2, '0')}:${hasHalf ? '30' : '00'}`;
      text = text.replace(timeMatch[0], '');
    }
  }

  text = text.replace(/\s+/g, ' ').trim();

  if (text === '') {
    text = raw.trim();
  }

  const result: ParsedTask = { text };
  if (dueDate) result.dueDate = dueDate;
  if (dueTime) result.dueTime = dueTime;
  if (recurrence) result.recurrence = recurrence;
  return result;
}

export function formatDueInfo(parsed: ParsedTask): string | null {
  const parts: string[] = [];

  if (parsed.dueDate) {
    const [, m, d] = parsed.dueDate.split('-');
    const date = new Date(parsed.dueDate + 'T00:00:00');
    const dayLabel = DAY_LABELS[date.getDay()];
    parts.push(`📅 ${parseInt(m, 10)}/${parseInt(d, 10)}(${dayLabel})`);
  }

  if (parsed.dueTime) {
    parts.push(`🕐 ${parsed.dueTime}`);
  }

  if (parsed.recurrence) {
    const r = parsed.recurrence;
    if (r.pattern === 'daily') {
      parts.push('🔁 毎日');
    } else if (r.pattern === 'weekdays') {
      parts.push('🔁 毎平日');
    } else if (r.pattern === 'weekly' && r.dayOfWeek != null) {
      parts.push(`🔁 毎週${DAY_LABELS[r.dayOfWeek]}曜`);
    } else if (r.pattern === 'biweekly' && r.dayOfWeek != null) {
      parts.push(`🔁 隔週${DAY_LABELS[r.dayOfWeek]}曜`);
    } else if (r.pattern === 'monthly') {
      parts.push(r.dayOfMonth === 32 ? '🔁 毎月末' : `🔁 毎月${r.dayOfMonth}日`);
    } else if (r.pattern === 'custom' && r.intervalDays) {
      parts.push(`🔁 ${r.intervalDays}日ごと`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
