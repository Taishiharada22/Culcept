// lib/origin/v6/chapters.ts
// Default chapter definitions for the Japan-map life roadmap.
// Each chapter has a position on the Japan map SVG (1000×1400 viewBox).
// Route flows roughly south → north across Japan, with some lateral movement.

import type { ChapterDef } from "./types";

/**
 * Default 12 chapters positioned across Japan.
 * The main road winds through them from south (birth) to north (present).
 * Positions are in SVG coordinates within a 1000×1400 viewBox.
 */
export const DEFAULT_CHAPTERS: ChapterDef[] = [
  // === Southern Japan (early life) ===
  { id: "birth",            label: "誕生",        icon: "👶", ageHint: "0歳",      order: 0,  mapX: 310, mapY: 1260 },
  { id: "early_childhood",  label: "幼少期",      icon: "🌱", ageHint: "0-6歳",    order: 1,  mapX: 420, mapY: 1120 },
  // === Shikoku / Chugoku area ===
  { id: "elementary_lower", label: "小学生(前半)", icon: "🎒", ageHint: "7-9歳",    order: 2,  mapX: 530, mapY: 1010 },
  { id: "elementary_upper", label: "小学生(後半)", icon: "📚", ageHint: "10-12歳",  order: 3,  mapX: 420, mapY: 900  },
  // === Kinki area ===
  { id: "middle_school",    label: "中学生",      icon: "🏫", ageHint: "13-15歳",  order: 4,  mapX: 560, mapY: 800  },
  // === Chubu area ===
  { id: "high_school",      label: "高校生",      icon: "⚡", ageHint: "16-18歳",  order: 5,  mapX: 500, mapY: 660  },
  { id: "crossroads",       label: "進路選択",    icon: "🔀", ageHint: "18歳",     order: 6,  mapX: 620, mapY: 580  },
  // === Kanto area ===
  { id: "higher_education", label: "大学/専門",   icon: "🎓", ageHint: "18-22歳",  order: 7,  mapX: 710, mapY: 490  },
  { id: "first_job",        label: "社会人1年目", icon: "💼", ageHint: "22-23歳",  order: 8,  mapX: 680, mapY: 380  },
  // === Tohoku area ===
  { id: "early_career",     label: "社会人初期",  icon: "🏢", ageHint: "23-26歳",  order: 9,  mapX: 660, mapY: 280  },
  // === Hokkaido area ===
  { id: "turning_point",    label: "転機",        icon: "🌊", ageHint: "特別な時", order: 10, mapX: 590, mapY: 150  },
  { id: "present",          label: "現在",        icon: "📍", ageHint: "今",       order: 11, mapX: 660, mapY: 80   },
];

/** Minimum branch answers to unlock the next chapter */
export const UNLOCK_THRESHOLD = 2;

/** Minimum branch answers to mark a chapter as "complete" */
export const COMPLETE_THRESHOLD = 4;
