"use client";

/**
 * Minimal markdown formatting toolbar for Origin journals.
 * Wraps selected text or inserts formatting at cursor position.
 */

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (newValue: string) => void;
};

type Action = {
  label: string;
  icon: string;
  prefix: string;
  suffix: string;
  block?: boolean; // true = line-level (heading, list)
};

const ACTIONS: Action[] = [
  { label: "太字", icon: "B", prefix: "**", suffix: "**" },
  { label: "斜体", icon: "I", prefix: "*", suffix: "*" },
  { label: "取り消し", icon: "S", prefix: "~~", suffix: "~~" },
  { label: "見出し", icon: "H", prefix: "## ", suffix: "", block: true },
  { label: "リスト", icon: "•", prefix: "- ", suffix: "", block: true },
  { label: "引用", icon: ">", prefix: "> ", suffix: "", block: true },
  { label: "コード", icon: "<>", prefix: "`", suffix: "`" },
  { label: "区切り", icon: "—", prefix: "\n---\n", suffix: "", block: true },
];

export default function MarkdownToolbar({ textareaRef, onInsert }: Props) {
  const handleAction = (action: Action) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    const selected = value.slice(start, end);

    let newValue: string;
    let newCursorPos: number;

    if (action.block) {
      // Line-level: insert at beginning of line
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (selected) {
        newValue = value.slice(0, lineStart) + action.prefix + value.slice(lineStart);
        newCursorPos = end + action.prefix.length;
      } else {
        newValue = value.slice(0, start) + action.prefix;
        newCursorPos = start + action.prefix.length;
      }
    } else if (selected) {
      // Wrap selection
      newValue = value.slice(0, start) + action.prefix + selected + action.suffix + value.slice(end);
      newCursorPos = end + action.prefix.length + action.suffix.length;
    } else {
      // Insert with placeholder
      newValue = value.slice(0, start) + action.prefix + action.suffix;
      newCursorPos = start + action.prefix.length;
    }

    onInsert(newValue);

    // Restore cursor position
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCursorPos, newCursorPos);
    });
  };

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          onClick={() => handleAction(action)}
          title={action.label}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600"
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}
