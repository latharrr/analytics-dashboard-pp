import { getServerAuthClient } from "@/lib/supabase/serverAuthClient";

export async function SignedInAs() {
  const supabase = getServerAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  return (
    <span className="hidden max-w-[10rem] truncate text-xs text-ink-muted sm:inline md:max-w-xs">
      {user.email}
    </span>
  );
}
