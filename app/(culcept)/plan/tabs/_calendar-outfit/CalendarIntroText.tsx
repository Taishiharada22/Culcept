/**
 * Slice 1 — section ① イントロ文 (presentational pure)
 *
 * 画像最上部の、その日の装いへ誘う 1〜2 文。煽らず、そっと。
 */

import { CAL_OUTFIT_PALETTE } from "./_palette";

export function CalendarIntroText({ text }: { text: string }) {
  return (
    <p
      className={`px-1 text-[13px] leading-relaxed ${CAL_OUTFIT_PALETTE.subtle}`}
      data-testid="plan-calendar-outfit-intro"
    >
      {text}
    </p>
  );
}
