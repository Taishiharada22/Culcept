/**
 * 回想ハンドル — 記憶の入口となる具体的場面カード
 * DeepExplorationFlow Phase 2 で使用
 */

import type { LifePeriod, MemoryHandle } from "./types";

/* ─── 汎用ハンドル（どの時代にも使える） ─── */

export const UNIVERSAL_HANDLES: MemoryHandle[] = [
  { id: "morning_routine", label: "朝の始まり", icon: "🌅" },
  { id: "way_to", label: "向かう道中", icon: "🚶" },
  { id: "main_activity", label: "メインの活動", icon: "⚡" },
  { id: "break_time", label: "休憩・空き時間", icon: "☕" },
  { id: "way_home", label: "帰り道", icon: "🌆" },
  { id: "night_time", label: "夜の時間", icon: "🌙" },
  { id: "alone_time", label: "一人の時間", icon: "🪶" },
  { id: "with_people", label: "人といた時間", icon: "👥" },
];

/* ─── 時代別ハンドル ─── */

export const PERIOD_HANDLES: Record<LifePeriod, MemoryHandle[]> = {
  early_childhood: [
    { id: "ec_playground", label: "遊び場", icon: "🎪" },
    { id: "ec_home", label: "家の中", icon: "🏠" },
    { id: "ec_family", label: "家族と一緒の時間", icon: "👨‍👩‍👧" },
    { id: "ec_nap", label: "昼寝の前後", icon: "😴" },
  ],
  elementary: [
    { id: "el_classroom", label: "教室", icon: "🏫" },
    { id: "el_recess", label: "休み時間", icon: "⚽" },
    { id: "el_commute", label: "通学路", icon: "🎒" },
    { id: "el_after", label: "放課後", icon: "🌳" },
    { id: "el_homework", label: "宿題の時間", icon: "📓" },
    { id: "el_event", label: "行事の日", icon: "🎊" },
  ],
  middle_school: [
    { id: "ms_club", label: "部活", icon: "🏅" },
    { id: "ms_classroom", label: "教室", icon: "🏫" },
    { id: "ms_exam", label: "テスト前", icon: "📝" },
    { id: "ms_morning", label: "朝練", icon: "🌅" },
    { id: "ms_festival", label: "文化祭・体育祭", icon: "🎉" },
    { id: "ms_after_club", label: "部活帰り", icon: "🌆" },
    { id: "ms_cram", label: "塾", icon: "📖" },
  ],
  high_school: [
    { id: "hs_classroom", label: "教室", icon: "🏫" },
    { id: "hs_club", label: "部活", icon: "🏅" },
    { id: "hs_exam_prep", label: "受験勉強", icon: "📚" },
    { id: "hs_commute", label: "通学の電車", icon: "🚃" },
    { id: "hs_friend", label: "友達との時間", icon: "🤝" },
    { id: "hs_career", label: "進路を考えた時間", icon: "🧭" },
  ],
  late_teens: [
    { id: "lt_new_place", label: "新しい場所", icon: "🏙️" },
    { id: "lt_alone", label: "初めての一人暮らし", icon: "🪶" },
    { id: "lt_new_people", label: "新しい人間関係", icon: "👥" },
    { id: "lt_decision", label: "自分で決めた瞬間", icon: "⚡" },
  ],
  early_twenties: [
    { id: "et_work_start", label: "仕事の始まり", icon: "💼" },
    { id: "et_daily", label: "毎日の通勤", icon: "🚃" },
    { id: "et_weekend", label: "週末の過ごし方", icon: "☀️" },
    { id: "et_relationship", label: "人間関係の変化", icon: "🔄" },
  ],
  mid_twenties: [
    { id: "mt_routine", label: "日々のルーティン", icon: "🔁" },
    { id: "mt_turning", label: "転機", icon: "🌊" },
    { id: "mt_growth", label: "成長を感じた瞬間", icon: "🌱" },
    { id: "mt_doubt", label: "迷いが生まれた時", icon: "🤔" },
  ],
  thirties: [
    { id: "th_settled", label: "落ち着いた時間", icon: "🍵" },
    { id: "th_pressure", label: "責任を感じた時", icon: "⚖️" },
    { id: "th_change", label: "変化を選んだ時", icon: "🔀" },
  ],
  forties_plus: [
    { id: "fp_look_back", label: "振り返った時", icon: "🪞" },
    { id: "fp_acceptance", label: "受け入れた時", icon: "🌿" },
    { id: "fp_new_start", label: "新しく始めたこと", icon: "🌅" },
  ],
  special_period: [
    { id: "sp_before", label: "変化の前", icon: "⏳" },
    { id: "sp_during", label: "変化の最中", icon: "🌀" },
    { id: "sp_after", label: "変化の後", icon: "🌈" },
    { id: "sp_turning", label: "決断の瞬間", icon: "⚡" },
  ],
};

/** 指定時代のハンドル一覧を返す（汎用 + 時代別） */
export function getHandlesForPeriod(period: LifePeriod): MemoryHandle[] {
  return [...PERIOD_HANDLES[period], ...UNIVERSAL_HANDLES];
}
