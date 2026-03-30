/**
 * Origin 共通アニメーション定数
 * 全コンポーネントで統一されたモーションを提供
 */

export const ORIGIN_MOTION = {
  // カード出現
  cardEnter: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
  // リスト要素（stagger用）
  listItem: (i: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: i * 0.06, duration: 0.25 },
  }),
  // セクション遷移
  sectionEnter: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.25 },
  },
  // 折り畳み展開
  collapse: {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" as const },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.2 },
  },
} as const;
