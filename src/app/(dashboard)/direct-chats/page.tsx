import { KpiPageHeader } from "@/components/kpi/KpiPageHeader";
import { DirectChatsView } from "@/components/directChats/DirectChatsView";

export default function DirectChatsPage() {
  return (
    <div>
      <KpiPageHeader
        title="Direct Chats"
        description="Every in-app chat — 1-on-1 direct messages and pool/group rooms — browsable by conversation or by user. See who messaged whom, when, and the message text (including buy/sell DMs), with names and phone numbers. Filter by chat type, date, or name/phone; sort by newest/oldest, signup, or message count; expand any row for the full message timeline. Message content is real user data. Bot accounts are excluded from the by-user list."
      />
      <DirectChatsView />
    </div>
  );
}
