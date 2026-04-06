"use client";

import Link from "next/link";

interface Props {
  /** 機能名（例: "コーデ", "日記"） */
  featureName: string;
  /** 機能の簡単な説明（省略可） */
  featureDescription?: string;
}

/**
 * 匿名ユーザーが登録必須の機能ページにアクセスした際に表示するフルページ登録誘導。
 * 各機能ページで共通利用する。
 */
export default function AnonymousRegistrationPage({ featureName, featureDescription }: Props) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#fafafa] px-6">
      <div className="w-full max-w-sm text-center">
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <span className="text-2xl">✦</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-2 text-lg font-bold text-[#121830]">
          「{featureName}」を使うには{"\n"}新規登録が必要です
        </h1>

        {/* Description */}
        <p className="mb-6 text-sm leading-relaxed text-[rgba(18,24,44,0.55)]">
          {featureDescription ?? (
            <>
              無料アカウントを作成すると、
              <br />
              全ての機能と観測結果にアクセスできます。
              <br />
              <span className="text-[rgba(18,24,44,0.35)]">
                ここまでのデータは自動で引き継がれます。
              </span>
            </>
          )}
        </p>

        {/* CTA */}
        <a
          href="/login?mode=signup&next=/"
          className="mb-4 flex w-full items-center justify-center rounded-full bg-[#121830] px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
        >
          無料で新規登録する
        </a>

        {/* Back to home */}
        <Link
          href="/"
          className="block text-xs text-[rgba(18,24,44,0.35)] transition-colors hover:text-[rgba(18,24,44,0.5)]"
        >
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
