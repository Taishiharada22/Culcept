// app/auth/reset-password/page.tsx
// パスワード再設定ページ
// URL hash の access_token/refresh_token を処理し、新パスワードを設定する

import ResetPasswordForm from "./ResetPasswordForm";

export const metadata = {
  title: "パスワード再設定 - Aneurasync",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
