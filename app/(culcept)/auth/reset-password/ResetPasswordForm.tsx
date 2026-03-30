"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  LightBackground,
  GlassCard,
  GlassButton,
  GlassInput,
} from "@/components/ui/glassmorphism-design";

type Phase = "loading" | "form" | "success" | "error";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // ── Step 1: hash fragment からセッションを確立 ──
  React.useEffect(() => {
    const supabase = supabaseBrowser();

    // Supabase JS は URL hash を自動検出して onAuthStateChange を発火する
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string) => {
        if (event === "PASSWORD_RECOVERY") {
          setPhase("form");
        } else if (event === "SIGNED_IN") {
          // recovery 以外の signed_in (すでにセッションがある場合)
          // form を表示して updateUser を許可
          setPhase("form");
        }
      },
    );

    // hash がない場合（直接アクセス）— 既存セッションがあれば form 表示
    const checkExisting = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setPhase("form");
      } else {
        // 1秒待っても onAuthStateChange が来なければエラー
        setTimeout(() => {
          setPhase((prev) => prev === "loading" ? "error" : prev);
        }, 3000);
      }
    };
    checkExisting();

    // hash を URL から消す（履歴には残さない）
    if (typeof window !== "undefined" && window.location.hash) {
      // hash の処理は Supabase が自動でやるので、少し待ってから消す
      setTimeout(() => {
        window.history.replaceState(null, "", window.location.pathname);
      }, 500);
    }

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ── Step 2: パスワード更新 ──
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") ?? "").trim();
    const confirm = String(formData.get("confirm") ?? "").trim();

    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      setSaving(false);
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません");
      setSaving(false);
      return;
    }

    const supabase = supabaseBrowser();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setPhase("success");
    // 2秒後にホームへ
    setTimeout(() => router.push("/"), 2000);
  };

  const headingStyle = { fontFamily: "'Cormorant Garamond', serif" };

  return (
    <LightBackground>
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <GlassCard className="p-8 sm:p-10">
            <div className="text-center mb-8">
              <h1
                className="text-2xl font-bold text-slate-900"
                style={headingStyle}
              >
                パスワード再設定
              </h1>
              <p className="text-slate-500 mt-2 text-sm">
                {phase === "loading" && "認証情報を確認中..."}
                {phase === "form" && "新しいパスワードを入力してください"}
                {phase === "success" && "パスワードを更新しました"}
                {phase === "error" && "リンクが無効または期限切れです"}
              </p>
            </div>

            {phase === "loading" && (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {phase === "form" && (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-2">
                    新しいパスワード
                  </label>
                  <GlassInput
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    placeholder="6文字以上"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-600 mb-2">
                    パスワード確認
                  </label>
                  <GlassInput
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    placeholder="もう一度入力"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <GlassButton
                  type="submit"
                  disabled={saving}
                  loading={saving}
                  variant="gradient"
                  size="lg"
                  className="w-full justify-center"
                >
                  パスワードを更新
                </GlassButton>
              </form>
            )}

            {phase === "success" && (
              <div className="text-center py-6">
                <div className="text-4xl mb-4">✅</div>
                <p className="text-slate-600">
                  ホーム画面に移動します...
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="text-center py-6 space-y-4">
                <div className="text-4xl mb-4">⚠️</div>
                <p className="text-sm text-slate-500">
                  パスワードリセットのリンクが無効です。
                  もう一度リセットメールを送信してください。
                </p>
                <GlassButton
                  variant="ghost"
                  onClick={() => router.push("/login")}
                  className="mx-auto"
                >
                  ログイン画面へ
                </GlassButton>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </LightBackground>
  );
}
