/**
 * July 原田行 golden（単一正本）
 *
 * CEO 原本確認済（2026-05-30）: day25 は実際の原本で**空欄**。
 * B1a-v2 で VLM が day25 を正しく blank と読み、golden 草案の "L" が誤りと判明
 *  → golden を空欄に訂正。これにより July B1a-v2 = 31/31（100%）。
 *
 * 重要: 実シフト表に blank cell はあり得る。モデルが空欄を勝手に勤務で
 *       埋めなかったことは、予定取り込みでの安全性の重要な証拠。
 *
 * projection test / scoring test の双方がこれを import（二重管理を排除）。
 */
export const JULY_HARADA_CODES: readonly string[] = [
  "BD", "HREQ", "H", "E-18", "L", "N", "L", "G", "H", "H", // 1-10
  "L", "L", "E", "N", "BD", "H", "H", "E-18", "L", "N", // 11-20
  "L", "G", "H", "H", "", "L", "E", "N", "BD", "H", // 21-30（25=空欄）
  "E-18", // 31
];
