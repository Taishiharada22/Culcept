import { Breadcrumb } from "@/components/ui/Breadcrumb";
import ImmersiveHomeBeacon from "@/app/(immersive)/ImmersiveHomeBeacon";

export default function ImmersiveLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <Breadcrumb light />
            {children}
            <ImmersiveHomeBeacon />
        </>
    );
}
