/**
 * ルーティンセット — 繰り返し使えるタスクテンプレート
 * Todoist/TickTickのプロジェクトテンプレートに相当。
 * localStorage管理。将来sync対応。
 */

const STORAGE_KEY = "origin_routine_templates_v1";

export type RoutineTemplate = {
  id: string;
  name: string;
  tasks: { text: string; recurrence?: { pattern: string } }[];
  createdAt: string;
};

// 組み込みテンプレート
const BUILT_IN_TEMPLATES: RoutineTemplate[] = [
  {
    id: "morning",
    name: "朝のルーティン",
    tasks: [
      { text: "水を1杯飲む" },
      { text: "ストレッチ 5分" },
      { text: "今日の計画を立てる" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "evening",
    name: "夜のルーティン",
    tasks: [
      { text: "明日の準備をする" },
      { text: "今日の振り返り" },
      { text: "デジタルデトックス" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "weekly_review",
    name: "週次レビュー",
    tasks: [
      { text: "今週の完了タスクを振り返る" },
      { text: "来週の目標を設定する" },
      { text: "持ち越しタスクを整理する" },
      { text: "法則の変化を確認する" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
  },
];

export function loadTemplates(): RoutineTemplate[] {
  if (typeof window === "undefined") return BUILT_IN_TEMPLATES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom: RoutineTemplate[] = raw ? JSON.parse(raw) : [];
    return [...BUILT_IN_TEMPLATES, ...custom];
  } catch {
    return BUILT_IN_TEMPLATES;
  }
}

export function saveCustomTemplate(template: Omit<RoutineTemplate, "id" | "createdAt">): RoutineTemplate {
  const newTemplate: RoutineTemplate = {
    ...template,
    id: `tpl_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  if (typeof window === "undefined") return newTemplate;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom: RoutineTemplate[] = raw ? JSON.parse(raw) : [];
    custom.push(newTemplate);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch { /* silent */ }
  return newTemplate;
}

export function deleteCustomTemplate(id: string): void {
  if (typeof window === "undefined") return;
  // Don't delete built-in templates
  if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const custom: RoutineTemplate[] = raw ? JSON.parse(raw) : [];
    const filtered = custom.filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch { /* silent */ }
}

/**
 * 現在のタスク一覧からテンプレートを生成
 */
export function createTemplateFromTasks(
  name: string,
  tasks: { text: string; recurrence?: { pattern: string } }[],
): RoutineTemplate {
  return saveCustomTemplate({
    name,
    tasks: tasks.map((t) => ({
      text: t.text,
      recurrence: t.recurrence,
    })),
  });
}
