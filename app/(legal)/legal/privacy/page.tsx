import type { Metadata } from "next";
import {
  LegalListItem,
  LegalNote,
  LegalPage,
  LegalParagraph,
  LegalSection,
  LegalUnorderedList,
} from "@/app/legal/_components/LegalPage";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Aneurasync",
  description: "Aneurasync / Rendezvous のプライバシーポリシー",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      description="Aneurasync / Rendezvous における個人情報の取り扱い方針です。"
      lastUpdated="2026年3月14日"
    >
      <LegalSection title="1. 基本方針" first>
        <LegalParagraph>
          Aneurasync（以下「本サービス」）は、マッチング機能「Rendezvous」を含むすべてのサービスにおいて、個人情報の保護に関する法律（個人情報保護法）およびその他の関連法令を遵守し、ユーザーの皆様の個人情報を適切に管理いたします。
        </LegalParagraph>
        <LegalParagraph>
          ユーザーの信頼を最重要視し、収集した情報の安全な管理と透明性の高い運用に努めます。
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="2. 収集する情報">
        <LegalParagraph>
          本サービスでは、以下の情報を収集することがあります。
        </LegalParagraph>
        <BulletList
          items={[
            "アカウント情報（メールアドレス、表示名）",
            "本人確認書類（運転免許証、パスポート、マイナンバーカードの画像）",
            "顔写真（本人確認用に撮影されたセルフィー）",
            "生年月日",
            "プロフィール情報（自己紹介、写真、スタイル情報等）",
            "行動データ（マッチング操作、チャット内容、アプリ使用パターン）",
            "端末情報（ブラウザ種類、OS、言語設定）",
            "ローカルストレージデータ（表示設定、最終訪問日時等）",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 情報の利用目的">
        <LegalParagraph>
          収集した情報は、以下の目的のために利用いたします。
        </LegalParagraph>
        <BulletList
          items={[
            "サービスの提供・運営",
            "本人確認・年齢確認",
            "マッチングアルゴリズムの改善",
            "分身（アバター）の行動生成",
            "自己発見インサイトの生成",
            "不正利用の検知・防止",
            "カスタマーサポート",
            "サービス改善のための統計分析（個人を特定しない形）",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. 本人確認書類の取り扱い" accent>
        <LegalParagraph>
          本サービスでは、安全なマッチング環境を確保するために本人確認書類の提出をお願いしております。書類の取り扱いについては、以下の方針を厳守いたします。
        </LegalParagraph>
        <BulletList
          items={[
            "書類画像は暗号化した上で、Supabase Storage に安全に保管します",
            "管理者による目視確認時においても、生年月日以外の情報にはぼかし処理を施します",
            "確認完了後も書類画像はアカウント存続中保管いたします（再確認が必要となった場合に備えるため）",
            "退会時は、30日以内に書類画像を含むすべての関連データを完全に削除いたします",
            "マッチング相手に書類画像が表示されることは一切ありません",
            "第三者への提供は、法令に基づく場合を除き行いません",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. データの保管と安全管理措置">
        <LegalParagraph>
          ユーザーの個人情報を適切に保護するため、以下の安全管理措置を講じております。
        </LegalParagraph>
        <BulletList
          items={[
            "SSL/TLS による通信の暗号化",
            "Supabase Row Level Security (RLS) によるデータベースレベルのアクセス制御",
            "管理者アクセスの厳格な制限と操作履歴の記録",
            "定期的なセキュリティ確認の実施",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. 第三者提供">
        <LegalParagraph>
          本サービスは、原則として、ユーザーの個人情報を第三者に提供いたしません。ただし、以下の場合を除きます。
        </LegalParagraph>
        <BulletList
          items={[
            "法令に基づく場合",
            "人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難な場合",
            "ユーザー本人の同意がある場合",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. ユーザーの権利">
        <LegalParagraph>
          ユーザーは、自己の個人情報について、以下の権利を行使することができます。
        </LegalParagraph>
        <BulletList
          items={[
            "個人情報の開示請求",
            "内容の訂正・追加・削除",
            "利用停止・消去の請求",
            "第三者提供の停止の請求",
          ]}
        />
        <LegalParagraph>
          上記の請求は、アプリ内の設定画面、またはお問い合わせ先メールアドレスよりお申し出ください。ご本人確認の上、合理的な期間内に対応いたします。
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="8. Cookie・ローカルストレージの使用">
        <LegalParagraph>
          本サービスでは、Cookie およびブラウザのローカルストレージを以下の目的で使用しております。
        </LegalParagraph>
        <BulletList
          items={[
            "認証状態の維持",
            "表示設定の保存",
            "最終訪問日時の記録",
          ]}
        />
        <LegalParagraph>
          ユーザーはブラウザの設定により、Cookie やローカルストレージの使用を無効化することができます。ただし、一部の機能が正常に動作しなくなる場合があります。
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="9. 行動データの分析">
        <LegalParagraph>
          本サービスでは、マッチング精度の向上およびユーザー体験の改善のために、スワイプパターン、チャット頻度、返信速度等の行動データを分析することがあります。
        </LegalParagraph>
        <BulletList
          items={[
            "分析結果は、自己発見インサイトとしてユーザー本人にのみ表示されます",
            "個人を特定した形での外部公開は一切行いません",
            "統計処理を施した上でサービス改善に活用する場合があります",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. 未成年者の情報">
        <LegalParagraph>
          本サービスは、18歳未満の方のご利用を禁止しております。18歳未満であることが判明した場合は、該当アカウントおよびすべての関連データを速やかに削除いたします。
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="11. ポリシーの変更">
        <LegalParagraph>
          本ポリシーの内容は、法令の改正やサービス内容の変更等に伴い、改定されることがあります。重要な変更がある場合は、アプリ内通知またはその他適切な方法にて、事前にお知らせいたします。
        </LegalParagraph>
        <LegalParagraph>
          変更後のプライバシーポリシーは、本ページに掲載した時点から効力を生じるものとし、変更後に本サービスの利用を継続された場合は、変更後のポリシーに同意いただいたものとみなします。
        </LegalParagraph>
      </LegalSection>

      <LegalSection title="12. お問い合わせ">
        <LegalParagraph>
          個人情報の取り扱いに関するお問い合わせは、以下のメールアドレスまでご連絡ください。
        </LegalParagraph>
        <LegalNote>support@aneurasync.app</LegalNote>
      </LegalSection>

      <LegalSection title="13. 施行日">
        <LegalParagraph>
          本プライバシーポリシーは、2026年3月14日より施行いたします。
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <LegalUnorderedList>
      {items.map((item) => (
        <LegalListItem key={item}>
          {item}
        </LegalListItem>
      ))}
    </LegalUnorderedList>
  );
}
