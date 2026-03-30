import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageTransition } from "@/components/animation/PageTransition";
import LegalFooter from "./LegalFooter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CulceptLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <Breadcrumb />
            <PageTransition>{children}</PageTransition>

            <LegalFooter />
        </>
    );
}
