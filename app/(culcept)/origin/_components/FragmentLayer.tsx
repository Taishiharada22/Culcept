"use client";

type Props = {
  label: string;
  content: string | string[] | null | undefined;
  variant?: "default" | "highlight" | "prompts";
};

export default function FragmentLayer({
  label,
  content,
  variant = "default",
}: Props) {
  if (!content || (Array.isArray(content) && content.length === 0)) return null;

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        {label}
      </p>

      {typeof content === "string" ? (
        <p
          className={`text-xs leading-relaxed whitespace-pre-wrap ${
            variant === "highlight"
              ? "text-amber-700/80"
              : "text-gray-700"
          }`}
        >
          {content}
        </p>
      ) : variant === "prompts" ? (
        <div className="flex flex-col gap-1.5">
          {content.map((item, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-600/70 before:mr-1 before:content-['→']"
            >
              {item}
            </p>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {content.map((item, i) => (
            <span
              key={i}
              className="rounded-full bg-amber-50/60 px-2.5 py-0.5 text-[10px] text-amber-700/70 ring-1 ring-amber-200/25"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
