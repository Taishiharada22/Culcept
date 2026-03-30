// app/my-drops/page.tsx
import { redirect } from "next/navigation";

export default function MyDropsRedirect() {
    redirect("/drops?mine=1");
}
