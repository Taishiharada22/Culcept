import ImmersiveHomeBeacon from "@/app/(immersive)/ImmersiveHomeBeacon";

export default function ImmersiveLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            {children}
            <ImmersiveHomeBeacon />
        </>
    );
}
