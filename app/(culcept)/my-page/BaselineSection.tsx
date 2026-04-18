"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Baseline 編集セクション（/my-page）
// 仕様: docs/baseline-edit-spec-v1.md §4
// 表示 + 編集モーダル。PATCH /api/baseline に差分だけ送る。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BaselineInfo {
  prefecture: string | null;
  city: string | null;
  homeLabel: string | null;
  homePlaceType: "home" | "other";
  homeCoords: { lat: number; lng: number } | null;
  coordsStatus: "resolved" | "fallback" | "unresolved";
  completedAt: string | null;
}

interface Props {
  baseline: BaselineInfo;
  cardStyle: React.CSSProperties;
  textColor1: string;
  textColor2: string;
  textColor3: string;
}

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

// displayLabel 導出（仕様 §4）
function deriveDisplayLabel(baseline: BaselineInfo): string {
  if (baseline.homeLabel) return baseline.homeLabel;
  return baseline.homePlaceType === "home" ? "自宅" : "居住地";
}

export default function BaselineSection({
  baseline,
  cardStyle,
  textColor1,
  textColor2,
  textColor3,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "info" | "error"; text: string } | null>(null);

  const displayLabel = deriveDisplayLabel(baseline);
  const areaText = baseline.prefecture
    ? `${baseline.prefecture}${baseline.city ? " " + baseline.city : ""}`
    : "未設定";

  const showSilentAssumption =
    baseline.homeLabel === null && baseline.completedAt !== null && baseline.homePlaceType === "home";

  const showIncompletePrompt = baseline.completedAt === null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      style={{ ...cardStyle, padding: "20px", marginTop: 16 }}
    >
      <h2 style={{ fontSize: 12, fontWeight: 700, color: textColor3, margin: "0 0 12px", letterSpacing: 0.5 }}>
        ベース（1日の始点・終点）
      </h2>

      {showIncompletePrompt ? (
        <div style={{ fontSize: 13, color: textColor2 }}>
          baseline を先に完了してください。
          <a href="/baseline" style={{ color: "#6366F1", marginLeft: 6, textDecoration: "underline" }}>
            設定する →
          </a>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>🏠</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: textColor1 }}>{displayLabel}</div>
              <div style={{ fontSize: 13, color: textColor2, marginTop: 2 }}>{areaText}</div>
              {baseline.coordsStatus === "fallback" && (
                <div style={{ fontSize: 11, color: textColor3, marginTop: 4 }}>
                  市区町村未解決・県の中心で動きます
                </div>
              )}
              {baseline.coordsStatus === "unresolved" && (
                <div style={{ fontSize: 11, color: "#C2410C", marginTop: 4 }}>
                  位置情報を設定してください
                </div>
              )}
              {showSilentAssumption && (
                <div style={{ fontSize: 11, color: textColor3, marginTop: 4, opacity: 0.85 }}>
                  現在は『自宅』として扱っています。変更できます。
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#6366F1",
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              編集
            </button>
          </div>
        </>
      )}

      {editOpen && (
        <EditModal
          baseline={baseline}
          onClose={() => setEditOpen(false)}
          onSaved={(msg) => {
            setEditOpen(false);
            setToast({ kind: msg.kind, text: msg.text });
            router.refresh();
            setTimeout(() => setToast(null), 5000);
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 420,
            zIndex: 100,
            background: toast.kind === "error" ? "#FEE2E2" : "rgba(30,30,60,0.92)",
            color: toast.kind === "error" ? "#991B1B" : "#fff",
            padding: "12px 18px",
            borderRadius: 12,
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toast.text}
        </div>
      )}
    </motion.section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Edit Modal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface EditModalProps {
  baseline: BaselineInfo;
  onClose: () => void;
  onSaved: (msg: { kind: "success" | "info" | "error"; text: string }) => void;
}

function EditModal({ baseline, onClose, onSaved }: EditModalProps) {
  const router = useRouter();
  const [label, setLabel] = useState<string>(baseline.homeLabel ?? "");
  const [placeType, setPlaceType] = useState<"home" | "other">(baseline.homePlaceType);
  const [prefecture, setPrefecture] = useState<string>(baseline.prefecture ?? "");
  const [city, setCity] = useState<string>(baseline.city ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const payload: Record<string, unknown> = {};
    // 差分のみ送信
    const trimmedLabel = label.trim();
    const currentLabel = baseline.homeLabel ?? "";
    if (trimmedLabel !== currentLabel) {
      payload.homeLabel = trimmedLabel === "" ? null : trimmedLabel;
    }
    if (placeType !== baseline.homePlaceType) payload.homePlaceType = placeType;
    if (prefecture !== (baseline.prefecture ?? "")) payload.prefecture = prefecture;
    const trimmedCity = city.trim();
    const currentCity = baseline.city ?? "";
    if (trimmedCity !== currentCity) {
      payload.city = trimmedCity === "" ? null : trimmedCity;
    }

    // バリデーション（クライアント側早期弾き）
    if (typeof payload.homeLabel === "string" && payload.homeLabel.length > 40) {
      setError("ラベルは 40 文字以内にしてください");
      return;
    }
    if (payload.prefecture && !PREFECTURES.includes(payload.prefecture as (typeof PREFECTURES)[number])) {
      setError("都道府県が不正です");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/baseline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        // client 側で login へ
        router.replace("/login?next=/my-page");
        return;
      }
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "保存に失敗しました。時間をおいて再度お試しください");
        setSaving(false);
        return;
      }

      // 成功: coords_status で toast テキストを分岐
      const status = json.baseline?.coordsStatus as "resolved" | "fallback" | "unresolved" | undefined;
      if (status === "fallback") {
        onSaved({
          kind: "info",
          text: "ベースを更新しました。市区町村の詳細位置は未解決なので、県の中心をプランの起点として使います",
        });
      } else {
        onSaved({ kind: "success", text: "ベースを更新しました" });
      }
    } catch (e) {
      console.error("[baseline] PATCH network error:", e);
      setError("保存に失敗しました。時間をおいて再度お試しください");
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          maxHeight: "90dvh",
          overflowY: "auto",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>ベースを編集</h3>

        {/* ラベル */}
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#4a4a68" }}>ラベル（任意）</div>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder="自宅 / 実家 / 単身赴任先 など"
            disabled={saving}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              outline: "none",
            }}
          />
        </label>

        {/* 種別 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#4a4a68" }}>種別</div>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input
                type="radio"
                name="placeType"
                value="home"
                checked={placeType === "home"}
                onChange={() => setPlaceType("home")}
                disabled={saving}
              />
              自宅
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" }}>
              <input
                type="radio"
                name="placeType"
                value="other"
                checked={placeType === "other"}
                onChange={() => setPlaceType("other")}
                disabled={saving}
              />
              その他
            </label>
          </div>
        </div>

        {/* 都道府県 */}
        <label style={{ display: "block", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#4a4a68" }}>都道府県</div>
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            disabled={saving}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              outline: "none",
              background: "#fff",
            }}
          >
            <option value="">選択してください</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {/* 市区町村 */}
        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#4a4a68" }}>市区町村（任意）</div>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="例: 渋谷区 / 甲府市"
            disabled={saving}
            style={{
              width: "100%",
              fontSize: 14,
              padding: "8px 12px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              outline: "none",
            }}
          />
        </label>

        {error && (
          <div
            role="alert"
            style={{
              fontSize: 12,
              color: "#991B1B",
              background: "#FEE2E2",
              padding: "8px 12px",
              borderRadius: 8,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              fontSize: 13,
              padding: "8px 16px",
              border: "1px solid rgba(0,0,0,0.15)",
              borderRadius: 8,
              background: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              color: "#4a4a68",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: "8px 16px",
              border: "none",
              borderRadius: 8,
              background: "#6366F1",
              color: "#fff",
              cursor: saving ? "wait" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
