/**
 * CoAlterBackdrop — CoAlter の Home / Talk 用 **Apple 風の柔らかい背景**（CEO 2026-06-21）
 *
 * フラットなグレーをやめ、ごく淡い縦グラデ + 数個のソフトな色グロー（violet/sky/rose）で
 * iOS のような奥行きのある下地にする。pointer-events なし・最背面（-z-10）。
 * **プラン overlay は不変**（CEO 指示）。この下地はチャット/ホームの背後のみ。
 */
export function CoAlterBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#f4f6fb]">
      {/* 上は白に近く・下にかけてごく淡いクール（Apple の system background 風の明るさ） */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-white/55 to-[#e9edf5]" />
      {/* ソフトな色グロー（彩度低め・大きくぼかして奥行きだけ与える） */}
      <div className="absolute -left-24 -top-20 h-80 w-80 rounded-full bg-violet-300/30 blur-[90px]" />
      <div className="absolute -right-28 top-24 h-80 w-80 rounded-full bg-sky-300/30 blur-[100px]" />
      <div className="absolute bottom-[-10%] left-1/4 h-80 w-80 rounded-full bg-rose-200/30 blur-[100px]" />
      {/* 最上層に薄い白ヴェールを重ねて、全体を一段明るく澄ませる */}
      <div className="absolute inset-0 bg-white/20" />
    </div>
  );
}
