"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase/client";
import SelfStateAlert from "@/components/orbiter/SelfStateAlert";
import type { SelfStateReport } from "@/lib/orbiter/types";
import BaselineSection, { type BaselineInfo } from "./BaselineSection";

// ── Types ──
interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface StargazerInfo {
  archetypeCode: string | null;
  archetypeName: string | null;
  archetypeEmoji: string | null;
  confidence: number;
  observationCount: number;
}

interface IdentityProgress {
  origin: { pct: number; insight: string };
  genome: { pct: number; insight: string };
  presence: { pct: number; insight: string };
  style: { pct: number; insight: string };
  phenotype: { pct: number; insight: string };
}

interface Props {
  user: UserInfo;
  stargazer: StargazerInfo;
  hasOrigin: boolean;
  unreadNotifCount: number;
  baseline: BaselineInfo;
}

// ── Observation Level ──
function computeObservationLevel(
  obs: number,
  confidence: number,
  identity: IdentityProgress | null,
): { level: number; emoji: string; label: string } {
  const levels = [
    { emoji: "🌑", label: "未観測" },
    { emoji: "🌒", label: "覚醒" },
    { emoji: "🌓", label: "探索" },
    { emoji: "🌔", label: "深化" },
    { emoji: "🌕", label: "統合" },
  ];

  if (!identity) {
    const lv = obs >= 50 ? 3 : obs >= 20 ? 2 : obs >= 5 ? 1 : 0;
    return { level: lv, ...levels[lv] };
  }

  const pcts = [identity.origin.pct, identity.genome.pct, identity.style.pct, identity.phenotype.pct, identity.presence.pct];
  const above10 = pcts.filter((p) => p >= 10).length;
  const above20 = pcts.filter((p) => p >= 20).length;
  const above30 = pcts.filter((p) => p >= 30).length;

  let lv = 0;
  if (confidence >= 0.7 && above30 >= 5) lv = 4;
  else if (obs >= 50 && above10 >= 5) lv = 3;
  else if (obs >= 20 && above20 >= 2) lv = 2;
  else if (obs >= 5 || pcts.some((p) => p >= 10)) lv = 1;

  return { level: lv, ...levels[lv] };
}

// ── Constants ──
const C = {
  bg: "linear-gradient(180deg, #ede5f5 0%, #e0d4f0 30%, #ddd0ef 60%, #e0d5f1 100%)",
  bgSolid: "#ede5f5",
  card: "rgba(255,255,255,0.72)",
  cardBorder: "rgba(0,0,0,0.06)",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  sync: "#3B82F6",
  neural: "#8B5CF6",
  pulse: "#EC4899",
  amber: "#F59E0B",
  emerald: "#10B981",
};

const IDENTITY_ELEMENTS = [
  { key: "origin", label: "Origin", sub: "背景・経験", color: C.sync, href: "/origin" },
  { key: "genome", label: "Genome", sub: "思考・認知", color: C.neural, href: "/genome-card" },
  { key: "presence", label: "Presence", sub: "印象・雰囲気", color: C.emerald, href: "/sns/profile" },
  { key: "style", label: "Style", sub: "好み・表現", color: C.amber, href: "/my-style" },
  { key: "phenotype", label: "Phenotype", sub: "顔・体型・色", color: C.pulse, href: "/body-color/avatar" },
] as const;

const MENU_ITEMS = [
  { href: "/my-page/notifications", icon: "🔔", label: "通知" },
  { href: "/stargazer", icon: "🔭", label: "Stargazer" },
  { href: "/genome-card", icon: "🧬", label: "Genome Card" },
  { href: "/origin", icon: "🗺️", label: "Origin" },
] as const;

export default function MyPageClient({ user, stargazer, hasOrigin, unreadNotifCount, baseline }: Props) {
  const router = useRouter();
  const [identity, setIdentity] = useState<IdentityProgress | null>(null);
  const [selfState, setSelfState] = useState<SelfStateReport | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Inline name editing ──
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user.displayName);
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const displayedName = savedName ?? user.displayName;

  const handleNameSave = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === displayedName) {
      setEditingName(false);
      setNameValue(displayedName);
      return;
    }
    setSavingName(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed, name: trimmed },
      });
      if (error) throw error;
      setSavedName(trimmed);
      setEditingName(false);
      router.refresh();
    } catch {
      setNameValue(displayedName);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  useEffect(() => {
    fetch("/api/aneurasync/home-identity-progress")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.items) {
          setIdentity({
            origin: d.items.origin ?? { pct: 0, insight: "" },
            genome: d.items.genome ?? { pct: 0, insight: "" },
            presence: d.items.presence ?? { pct: 0, insight: "" },
            style: d.items.style ?? { pct: 0, insight: "" },
            phenotype: d.items.phenotype ?? { pct: 0, insight: "" },
          });
        }
      })
      .catch(() => {});

    fetch("/api/orbiter/self-state", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.ok) setSelfState(d.selfStateReport); })
      .catch(() => {});
  }, []);

  const obsLevel = computeObservationLevel(stargazer.observationCount, stargazer.confidence, identity);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = supabaseBrowser();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount) return;
    const confirmed = window.confirm(
      "このアカウントのデータをすべて削除します。プロフィール、診断、画像、会話を含めて元に戻せません。削除を続けますか？",
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeletingAccount(true);

    try {
      const response = await fetch("/api/account/delete", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "アカウント削除に失敗しました。");
      }

      const supabase = supabaseBrowser();
      await supabase.auth.signOut().catch(() => {});
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "アカウント削除に失敗しました。");
      setDeletingAccount(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.t1 }}>
      {/* ── Header ── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(20px)",
          background: "rgba(237,229,245,0.95)",
          borderBottom: `1px solid ${C.cardBorder}`,
        }}
      >
        <Link href="/" style={{ color: C.t2, textDecoration: "none", fontSize: 14 }}>
          ← ホーム
        </Link>
        <span style={{ fontSize: 14, fontWeight: 700 }}>マイページ</span>
        <div style={{ width: 48 }} />
      </header>

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 100px" }}>
        {/* ── Profile Card ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: C.card,
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 20,
            padding: "28px 20px",
            textAlign: "center",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              margin: "0 auto 12px",
              background: `linear-gradient(135deg, ${C.sync}, ${C.neural})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              overflow: "hidden",
            }}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              stargazer.archetypeEmoji ?? "👤"
            )}
          </div>

          {editingName ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <input
                ref={nameInputRef}
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSave();
                  if (e.key === "Escape") { setEditingName(false); setNameValue(displayedName); }
                }}
                maxLength={60}
                disabled={savingName}
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  textAlign: "center",
                  border: "1.5px solid rgba(99,102,241,0.3)",
                  borderRadius: 10,
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.8)",
                  outline: "none",
                  width: "70%",
                  color: C.t1,
                }}
              />
              <button
                type="button"
                onClick={handleNameSave}
                disabled={savingName}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#6366F1",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 14px",
                  cursor: savingName ? "wait" : "pointer",
                  opacity: savingName ? 0.5 : 1,
                }}
              >
                {savingName ? "..." : "保存"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: C.t1,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: 0,
              }}
            >
              {displayedName}
              <span style={{ fontSize: 12, color: C.t3, opacity: 0.6 }}>✏️</span>
            </button>
          )}
          <p style={{ fontSize: 12, color: C.t3, margin: "4px 0 0" }}>{user.email}</p>

          {/* Observation Level */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 16,
              padding: "6px 14px",
              borderRadius: 20,
              background: "rgba(0,0,0,0.04)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span>{obsLevel.emoji}</span>
            <span>Lv.{obsLevel.level}</span>
            <span style={{ color: C.t2 }}>{obsLevel.label}</span>
          </div>

          {/* Stargazer Archetype */}
          {stargazer.archetypeName && (
            <Link href="/stargazer" style={{ textDecoration: "none", display: "block", marginTop: 16 }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 14,
                  background: "rgba(139,92,246,0.08)",
                  border: "1px solid rgba(139,92,246,0.15)",
                }}
              >
                <div style={{ fontSize: 12, color: C.neural, fontWeight: 600, marginBottom: 4 }}>
                  🔭 Stargazer Type
                </div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  {stargazer.archetypeEmoji} {stargazer.archetypeName}
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>
                  観測 {stargazer.observationCount}回 · 確信度 {Math.round(stargazer.confidence * 100)}%
                </div>
              </div>
            </Link>
          )}

          {!stargazer.archetypeName && stargazer.observationCount > 0 && (
            <Link href="/stargazer" style={{ textDecoration: "none", display: "block", marginTop: 16 }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 14,
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.1)",
                  fontSize: 13,
                  color: C.neural,
                }}
              >
                🔭 観測 {stargazer.observationCount}回 — タイプ解析中...
              </div>
            </Link>
          )}

          {stargazer.observationCount === 0 && (
            <Link href="/stargazer" style={{ textDecoration: "none", display: "block", marginTop: 16 }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  background: `linear-gradient(135deg, rgba(139,92,246,0.12), rgba(59,130,246,0.12))`,
                  border: "1px solid rgba(139,92,246,0.15)",
                  fontSize: 14,
                  fontWeight: 700,
                  color: C.neural,
                }}
              >
                🔭 最初の観測を始める →
              </div>
            </Link>
          )}
        </motion.section>

        {/* ── Orbiter Self-State Alert ── */}
        {selfState && selfState.decisionQualityHint !== "optimal" && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            style={{ marginTop: 16 }}
          >
            <SelfStateAlert selfStateReport={selfState} />
          </motion.section>
        )}

        {/* ── Identity Elements ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{ marginTop: 20 }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.t2, marginBottom: 10, letterSpacing: 1 }}>
            IDENTITY ELEMENTS
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {IDENTITY_ELEMENTS.map((el) => {
              const prog = identity?.[el.key as keyof IdentityProgress];
              const pct = prog?.pct ?? 0;
              return (
                <Link key={el.key} href={el.href} style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: C.card,
                      border: `1px solid ${C.cardBorder}`,
                      transition: "background 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `${el.color}18`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 800,
                        color: el.color,
                        flexShrink: 0,
                      }}
                    >
                      {el.label[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.t1 }}>{el.label}</div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{el.sub}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <div style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(0,0,0,0.04)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            height: "100%",
                            borderRadius: 2,
                            background: el.color,
                            transition: "width 0.6s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: C.t3, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.section>

        {/* ── Baseline (1日の始点・終点) ── */}
        <BaselineSection
          baseline={baseline}
          cardStyle={{
            background: C.card,
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 20,
          }}
          textColor1={C.t1}
          textColor2={C.t2}
          textColor3={C.t3}
        />

        {/* ── Menu ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ marginTop: 20 }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: C.t2, marginBottom: 10, letterSpacing: 1 }}>
            MENU
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {MENU_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 16px",
                    borderRadius: 12,
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.t1, flex: 1 }}>{item.label}</span>
                  {item.href.includes("notifications") && unreadNotifCount > 0 && (
                    <span
                      style={{
                        background: "#EF4444",
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        borderRadius: 10,
                        padding: "2px 7px",
                        minWidth: 18,
                        textAlign: "center",
                      }}
                    >
                      {unreadNotifCount}
                    </span>
                  )}
                  <span style={{ fontSize: 14, color: C.t3 }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        </motion.section>

        {/* ── Logout ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{ marginTop: 32, textAlign: "center" }}
        >
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut || deletingAccount}
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              color: "#EF4444",
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 28px",
              borderRadius: 12,
              cursor: loggingOut || deletingAccount ? "wait" : "pointer",
              opacity: loggingOut || deletingAccount ? 0.5 : 1,
              transition: "opacity 0.2s",
            }}
          >
            {loggingOut ? "ログアウト中..." : "ログアウト"}
          </button>

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deletingAccount || loggingOut}
              style={{
                background: "rgba(127,29,29,0.08)",
                border: "1px solid rgba(185,28,28,0.18)",
                color: "#B91C1C",
                fontSize: 14,
                fontWeight: 700,
                padding: "10px 24px",
                borderRadius: 12,
                cursor: deletingAccount || loggingOut ? "wait" : "pointer",
                opacity: deletingAccount || loggingOut ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {deletingAccount ? "データを削除中..." : "データを削除する"}
            </button>
          </div>

          <p style={{ margin: "10px auto 0", maxWidth: 320, fontSize: 11, lineHeight: 1.6, color: "#9F1239" }}>
            削除すると、このアカウントに紐づくプロフィール、診断、画像、会話データは復元できません。
          </p>

          {deleteError && (
            <p style={{ margin: "10px auto 0", maxWidth: 320, fontSize: 12, lineHeight: 1.6, color: "#B91C1C" }}>
              {deleteError}
            </p>
          )}
        </motion.div>
      </main>
    </div>
  );
}
