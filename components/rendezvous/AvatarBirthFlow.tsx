"use client";

/**
 * AvatarBirthFlow
 * 本人確認 + 分身誕生の5ステップフロー
 * Step 1: 書類タイプ選択 + 生年月日入力
 * Step 2: 書類撮影
 * Step 3: 確認プレビュー
 * Step 4: セルフィー撮影
 * Step 5: 送信 + 分身誕生演出
 */

import { useState, useRef, useCallback, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  onComplete: () => void;
};

type DocumentType = "drivers_license" | "passport" | "my_number";

const DOC_LABELS: Record<DocumentType, string> = {
  drivers_license: "運転免許証",
  passport: "パスポート",
  my_number: "マイナンバーカード",
};

const DOC_GUIDE: Record<DocumentType, string> = {
  drivers_license: "運転免許証の表面全体が枠内に収まるように撮影してください",
  passport: "パスポートの顔写真ページを開いて撮影してください",
  my_number: "マイナンバーカードの表面全体が枠内に収まるように撮影してください",
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

const TOTAL_STEPS = 5;

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(10,10,25,0.75)",
  backdropFilter: "blur(8px)",
  padding: 16,
};

const cardStyle: CSSProperties = {
  maxWidth: 420,
  width: "100%",
  maxHeight: "90dvh",
  overflowY: "auto",
  background: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(24px)",
  borderRadius: 24,
  padding: "32px 24px",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
};

const titleStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#fff",
  textAlign: "center",
  marginBottom: 8,
};

const subtitleStyle: CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.7)",
  textAlign: "center",
  marginBottom: 24,
  lineHeight: 1.7,
};

const primaryBtnStyle = (disabled: boolean): CSSProperties => ({
  width: "100%",
  padding: "14px",
  borderRadius: 14,
  border: "none",
  background: disabled
    ? "rgba(99,102,241,0.25)"
    : "linear-gradient(135deg, #6366F1, #8B5CF6)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 700,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all 0.2s",
  opacity: disabled ? 0.6 : 1,
});

const secondaryBtnStyle: CSSProperties = {
  padding: "10px 20px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.8)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const selectStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.08)",
  fontSize: 14,
  color: "#fff",
  outline: "none",
  flex: 1,
  minWidth: 0,
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            borderRadius: 4,
            background:
              i === current
                ? "linear-gradient(135deg, #6366F1, #8B5CF6)"
                : i < current
                ? "rgba(99,102,241,0.5)"
                : "rgba(255,255,255,0.15)",
            transition: "all 0.3s",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Particle burst animation for step 5 success
// ---------------------------------------------------------------------------
function ParticleBurst() {
  const particles = Array.from({ length: 24 });
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((_, i) => {
        const angle = (360 / particles.length) * i;
        const distance = 80 + Math.random() * 60;
        const size = 4 + Math.random() * 4;
        const hue = 240 + Math.random() * 80;
        return (
          <motion.div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: size,
              height: size,
              borderRadius: "50%",
              background: `hsl(${hue}, 80%, 70%)`,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos((angle * Math.PI) / 180) * distance,
              y: Math.sin((angle * Math.PI) / 180) * distance,
              opacity: 0,
              scale: 0.3,
            }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AvatarBirthFlow({ onComplete }: Props) {
  const [step, setStep] = useState(0);

  // Step 1 state
  const [agreed, setAgreed] = useState(false);
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [year, setYear] = useState<number | "">("");
  const [month, setMonth] = useState<number | "">("");
  const [day, setDay] = useState<number | "">("");

  // Step 2 state
  const [docImage, setDocImage] = useState<File | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Step 4 state
  const [selfieImage, setSelfieImage] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Step 5 state
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days =
    year && month
      ? Array.from({ length: daysInMonth(Number(year), Number(month)) }, (_, i) => i + 1)
      : [];

  // Handlers
  const handleDocCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocImage(file);
    setDocPreview(URL.createObjectURL(file));
  }, []);

  const handleSelfieCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieImage(file);
    setSelfiePreview(URL.createObjectURL(file));
  }, []);

  const resetDoc = () => {
    setDocImage(null);
    setDocPreview(null);
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const resetSelfie = () => {
    setSelfieImage(null);
    setSelfiePreview(null);
    if (selfieInputRef.current) selfieInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!docImage || !selfieImage || !docType || !year || !month || !day) return;
    setSubmitting(true);
    setError(null);

    try {
      const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const fd = new FormData();
      fd.append("documentImage", docImage);
      fd.append("selfieImage", selfieImage);
      fd.append("documentType", docType);
      fd.append("birthDate", birthDate);

      const res = await fetch("/api/rendezvous/identity-verify", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "送信に失敗しました" }));
        setError(data.error || "送信に失敗しました");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => onComplete(), 2500);
    } catch {
      setError("通信エラーが発生しました");
      setSubmitting(false);
    }
  };

  // Auto-submit when reaching step 5
  const goToStep = (next: number) => {
    setStep(next);
    if (next === 4) {
      // slight delay so UI renders first
      setTimeout(handleSubmit, 300);
    }
  };

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  const renderStep0 = () => (
    <motion.div
      key="step0"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 40 }}>&#x2728;</span>
      </div>
      <h2 style={titleStyle}>分身を現実と結びつける</h2>
      <p style={subtitleStyle}>
        あなた自身であることを確認し、分身に命を吹き込みます
      </p>

      {/* Privacy note */}
      <div
        style={{
          background: "rgba(99,102,241,0.08)",
          borderRadius: 12,
          padding: "12px 16px",
          marginBottom: 24,
          border: "1px solid rgba(99,102,241,0.12)",
        }}
      >
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: 0 }}>
          書類は暗号化保管され、マッチング相手に表示されることはありません
        </p>
      </div>

      {/* Consent checkbox */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginTop: 16, marginBottom: 24 }}>
        <input type="checkbox" checked={agreed} onChange={() => setAgreed(!agreed)} style={{ marginTop: 4, accentColor: "#6366f1" }} />
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          <a href="/legal/terms" target="_blank" style={{ color: "#818cf8", textDecoration: "underline" }}>利用規約</a>
          および
          <a href="/legal/privacy" target="_blank" style={{ color: "#818cf8", textDecoration: "underline" }}>プライバシーポリシー</a>
          に同意します
        </span>
      </label>

      {/* Document type selector */}
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 12, fontWeight: 600 }}>
        本人確認書類を選択
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {(Object.keys(DOC_LABELS) as DocumentType[]).map((key) => (
          <button
            key={key}
            onClick={() => setDocType(key)}
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: docType === key ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.1)",
              background: docType === key ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
              color: docType === key ? "#A5B4FC" : "rgba(255,255,255,0.7)",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s",
            }}
          >
            {DOC_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Birth date */}
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 12, fontWeight: 600 }}>
        生年月日
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <select
          value={year}
          onChange={(e) => { setYear(e.target.value ? Number(e.target.value) : ""); setDay(""); }}
          style={selectStyle}
        >
          <option value="">年</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => { setMonth(e.target.value ? Number(e.target.value) : ""); setDay(""); }}
          style={selectStyle}
        >
          <option value="">月</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <select
          value={day}
          onChange={(e) => setDay(e.target.value ? Number(e.target.value) : "")}
          style={selectStyle}
        >
          <option value="">日</option>
          {days.map((d) => (
            <option key={d} value={d}>{d}日</option>
          ))}
        </select>
      </div>

      <button
        onClick={() => goToStep(1)}
        disabled={!docType || !year || !month || !day || !agreed}
        style={primaryBtnStyle(!docType || !year || !month || !day || !agreed)}
      >
        次へ
      </button>
    </motion.div>
  );

  const renderStep1 = () => (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <h2 style={titleStyle}>書類を撮影してください</h2>
      <p style={subtitleStyle}>{docType ? DOC_GUIDE[docType] : ""}</p>

      {!docPreview ? (
        <div
          style={{
            border: "2px dashed rgba(255,255,255,0.15)",
            borderRadius: 16,
            padding: "40px 20px",
            textAlign: "center",
            marginBottom: 24,
            cursor: "pointer",
          }}
          onClick={() => docInputRef.current?.click()}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x1F4F7;</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            タップして撮影
          </p>
          <input
            ref={docInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleDocCapture}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 12,
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={docPreview}
              alt="撮影プレビュー"
              style={{ width: "100%", display: "block" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={resetDoc} style={secondaryBtnStyle}>
              撮り直す
            </button>
            <button
              onClick={() => goToStep(2)}
              style={{ ...primaryBtnStyle(false), flex: 1 }}
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );

  const renderStep2 = () => (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <h2 style={titleStyle}>確認</h2>
      <p style={subtitleStyle}>
        生年月日のみを確認します。その他の情報は確認後も表示されません
      </p>

      {docPreview && (
        <div
          style={{
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.1)",
            position: "relative",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={docPreview}
            alt="書類プレビュー"
            style={{ width: "100%", display: "block", filter: "blur(6px)" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
              プライバシー保護のためぼかし表示
            </span>
          </div>
        </div>
      )}

      <button onClick={() => goToStep(3)} style={primaryBtnStyle(false)}>
        次へ
      </button>
    </motion.div>
  );

  const renderStep3 = () => (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
    >
      <h2 style={titleStyle}>現在のお顔を撮影してください</h2>
      <p style={subtitleStyle}>書類の写真と照合するために使用します</p>

      {!selfiePreview ? (
        <div
          style={{
            border: "2px dashed rgba(255,255,255,0.15)",
            borderRadius: 16,
            padding: "32px 20px",
            textAlign: "center",
            marginBottom: 24,
            cursor: "pointer",
          }}
          onClick={() => selfieInputRef.current?.click()}
        >
          {/* Face guide circle */}
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: "50%",
              border: "3px dashed rgba(99,102,241,0.4)",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 40 }}>&#x1F9D1;</span>
          </div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            タップしてフロントカメラで撮影
          </p>
          <input
            ref={selfieInputRef}
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleSelfieCapture}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              overflow: "hidden",
              margin: "0 auto 16px",
              border: "3px solid rgba(99,102,241,0.4)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selfiePreview}
              alt="セルフィープレビュー"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={resetSelfie} style={secondaryBtnStyle}>
              撮り直す
            </button>
            <button
              onClick={() => goToStep(4)}
              style={{ ...primaryBtnStyle(false), flex: "0 1 auto", padding: "12px 32px" }}
            >
              次へ
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );

  const renderStep4 = () => (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.3 }}
      style={{ textAlign: "center", position: "relative" }}
    >
      {!success ? (
        <>
          {/* Loading spinner */}
          <motion.div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.1)",
              borderTopColor: "#8B5CF6",
              margin: "40px auto 24px",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 8 }}>
            書類を送信しています...
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            暗号化して安全に保管します
          </p>
          {error && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 13, color: "#F87171", marginBottom: 12 }}>{error}</p>
              <button onClick={handleSubmit} style={primaryBtnStyle(false)}>
                再試行
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <ParticleBurst />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
            style={{
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366F1, #8B5CF6, #A78BFA)",
              margin: "40px auto 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 40px rgba(139,92,246,0.4)",
            }}
          >
            <span style={{ fontSize: 44 }}>&#x2728;</span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            style={{ fontSize: 16, color: "#fff", fontWeight: 700, marginBottom: 8 }}
          >
            分身が誕生の準備をしています...
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
          >
            確認完了まで少々お待ちください
          </motion.p>
        </>
      )}
    </motion.div>
  );

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <StepDots current={step} total={TOTAL_STEPS} />
        <AnimatePresence mode="wait">
          {steps[step]()}
        </AnimatePresence>
      </div>
    </div>
  );
}
