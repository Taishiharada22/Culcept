// app/explore/page.tsx
import ExplorePageClient from "./ExplorePageClient";

export const revalidate = 60;

export default function ExplorePage() {
    return <ExplorePageClient />;
}
