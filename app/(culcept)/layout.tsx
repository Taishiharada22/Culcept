import { PageTransition } from "@/components/animation/PageTransition";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CulceptLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <PageTransition>{children}</PageTransition>
        </>
    );
}
