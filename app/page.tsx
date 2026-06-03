import Explorer from '@/components/Explorer';
import { createSupabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <Explorer userEmail={user?.email ?? ''} />;
}
