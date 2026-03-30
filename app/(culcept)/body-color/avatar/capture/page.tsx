import Link from "next/link";
import RealFaceCaptureInput from "@/components/body/RealFaceCaptureInput";
import {
    GlassButton,
    GlassCard,
    GlassNavbar,
    LightBackground,
} from "@/components/ui/glassmorphism-design";

type PageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RealFaceCaptureStandalonePage({ searchParams }: PageProps) {
    const params = (await searchParams) ?? {};
    const tokenValue = params?.token;
    const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-900">
                            実顔写真の診断用セットアップ
                        </h1>
                        <p className="text-xs text-slate-400">
                            スマホで撮影し、枠合わせと適合チェックを完了してください
                        </p>
                    </div>
                    <GlassButton href="/body-color/avatar" variant="secondary" size="sm">
                        PC画面へ戻る
                    </GlassButton>
                </div>
            </GlassNavbar>

            <div className="h-20" />

            <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
                {token ? (
                    <RealFaceCaptureInput standaloneMode standaloneToken={token} />
                ) : (
                    <GlassCard className="p-6">
                        <div className="text-lg font-bold text-slate-900">セッションURLが無効です</div>
                        <div className="mt-2 text-sm text-slate-500">
                            PC 側の「スマホで撮影する」から、もう一度 QR または URL を開いてください。
                        </div>
                        <div className="mt-4">
                            <Link href="/body-color/avatar" className="text-sm font-semibold text-violet-600 hover:text-violet-800">
                                PC 画面へ戻る
                            </Link>
                        </div>
                    </GlassCard>
                )}
            </main>
        </LightBackground>
    );
}
