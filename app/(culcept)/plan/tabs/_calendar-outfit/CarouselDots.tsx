/**
 * Slice 1 — section ④ carousel のページネーションドット (presentational pure)
 *
 * 現在表示中のコーデ index を控えめなドットで示す。 tap で該当 index へ。
 */

export function CarouselDots({
  count,
  activeIndex,
  onSelect,
}: {
  count: number;
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5" data-testid="plan-calendar-outfit-carousel-dots">
      {Array.from({ length: count }, (_, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`${i + 1} 枚目のコーデへ`}
            aria-current={isActive ? "true" : undefined}
            className={
              "h-1.5 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 " +
              (isActive ? "w-5 bg-violet-500" : "w-1.5 bg-violet-200 hover:bg-violet-300")
            }
          />
        );
      })}
    </div>
  );
}
