// app/social/page.tsx
import { Metadata } from "next";
import SocialFeedClient from "./SocialFeedClient";

export const metadata: Metadata = {
    title: "ソーシャルフィード | Culcept",
    description: "ファッション好きのコミュニティ。コーデを投稿・発見・共有しよう",
};

export default function SocialPage() {
    return <SocialFeedClient />;
}
