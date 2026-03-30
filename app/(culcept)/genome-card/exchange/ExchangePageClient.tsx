"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FloatingNavLight } from "@/components/ui/glassmorphism-design";
import { MAIN_NAV } from "@/lib/navigation";
import SendRequestModal from "../_components/SendRequestModal";
import type { GenomeConnection } from "@/lib/genome/cardTypes";

const C = { bg: "linear-gradient(180deg, #f8f6f3 0%, #f6f3f0 30%, #f4f1ed 60%, #f6f3f0 100%)", s1: "#ffffff", s2: "#f5f6fa", t1: "#1a1a2e", t2: "#4a4a68", t3: "#8888a0", t4: "#c8c8dc", neural: "#8B5CF6", pulse: "#EC4899" };

export default function ExchangePageClient() {
  const [connections, setConnections] = useState<GenomeConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendModal, setShowSendModal] = useState(false);

  const fetchData = async () => { try { const res = await fetch("/api/genome-connections"); const data = await res.json(); if (data.ok) setConnections(data.connections); } finally { setLoading(false); } };
  useEffect(() => { fetchData(); }, []);

  const received = connections.filter((c) => c.status === "pending" && c.targetId !== c.requesterId);
  const sent = connections.filter((c) => c.status === "pending" && c.requesterId !== c.targetId);
  const accepted = connections.filter((c) => c.status === "accepted");

  const handleAction = async (id: string, action: string) => {
    await fetch(`/api/genome-connections/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    fetchData();
  };

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <main className="max-w-lg mx-auto px-4 pt-8 pb-32 space-y-6">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <Link href="/genome-card" style={{ fontSize: 12, color: C.neural }}>← Genome Card</Link>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: C.t1 }}>カード交換管理</h1>
          </div>
          <button onClick={() => setShowSendModal(true)} className="px-4 py-2 rounded-xl text-xs font-medium"
            style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>+ リクエスト</button>
        </motion.div>

        {loading ? (
          <div className="rounded-2xl animate-pulse" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24, height: 80 }} />
        ) : (
          <>
            {received.length > 0 && (
              <div className="space-y-2">
                <h2 className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.t1 }}>
                  受信リクエスト
                  <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ fontSize: 9, fontWeight: 700, color: "white", background: `linear-gradient(135deg, #ef4444, ${C.pulse})` }}>{received.length}</span>
                </h2>
                {received.map((conn) => (
                  <div key={conn.id} className="rounded-2xl flex items-center justify-between" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${C.neural}15, ${C.pulse}15)`, fontSize: 14, color: C.t2 }}>
                        {conn.counterpart.displayName?.[0] ?? "?"}</div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>{conn.counterpart.displayName ?? "ユーザー"}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleAction(conn.id, "accept")} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: `linear-gradient(135deg, ${C.neural}, ${C.pulse})`, color: "white" }}>承認</button>
                      <button onClick={() => handleAction(conn.id, "decline")} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: C.s2, color: C.t3 }}>拒否</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sent.length > 0 && (
              <div className="space-y-2">
                <h2 style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>送信済み</h2>
                {sent.map((conn) => (
                  <div key={conn.id} className="rounded-2xl flex items-center gap-3" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.s2, fontSize: 14, color: C.t3 }}>
                      {conn.counterpart.displayName?.[0] ?? "?"}</div>
                    <div className="flex-1">
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.t2 }}>{conn.counterpart.displayName ?? "ユーザー"}</span>
                      <p style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>返答待ち</p>
                    </div>
                    <span style={{ fontSize: 9, padding: "3px 10px", borderRadius: 20, background: "#F59E0B15", color: "#F59E0B" }}>保留中</span>
                  </div>
                ))}
              </div>
            )}
            {accepted.length > 0 && (
              <div className="space-y-2">
                <h2 style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>接続済み</h2>
                {accepted.map((conn) => (
                  <div key={conn.id} className="rounded-2xl flex items-center gap-3" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: "12px 16px" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.1))`, fontSize: 14, color: "rgb(16,185,129)" }}>
                      {conn.counterpart.displayName?.[0] ?? "?"}</div>
                    <div className="flex-1">
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.t1 }}>{conn.counterpart.displayName ?? "ユーザー"}</span>
                      <div className="flex gap-3 mt-1">
                        <Link href={`/genome-card/${conn.counterpart.userId}`} style={{ fontSize: 11, color: C.neural }}>カードを見る</Link>
                        {conn.threadId && <Link href={`/talk/${conn.threadId}`} style={{ fontSize: 11, color: C.pulse }}>トーク</Link>}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, padding: "3px 10px", borderRadius: 20, background: "rgba(16,185,129,0.1)", color: "rgb(16,185,129)" }}>接続済み</span>
                  </div>
                ))}
              </div>
            )}
            {connections.length === 0 && (
              <div className="rounded-2xl text-center py-10" style={{ background: C.s1, border: `1px solid ${C.s2}`, padding: 24 }}>
                <div style={{ fontSize: 32, color: C.t4, marginBottom: 12 }}>∞</div>
                <p style={{ fontSize: 13, color: C.t3 }}>リクエストがありません</p>
              </div>
            )}
          </>
        )}
        <SendRequestModal isOpen={showSendModal} onClose={() => setShowSendModal(false)} onSent={fetchData} />
      </main>
      <FloatingNavLight items={MAIN_NAV} activeHref="/genome-card" />
    </div>
  );
}
