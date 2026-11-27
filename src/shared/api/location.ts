import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';

export interface PostLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface UserLocation {
  userId: string;
  userName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  trackedAt: string;
}

export async function postLocation(input: PostLocationInput): Promise<{ success: boolean }> {
  const user = useAuthStore.getState().user;
  if (!user) return { success: false };

  const { error } = await supabase.from('user_locations').insert({
    user_id: user.uid,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy ?? 10,
    tracked_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[location] gagal mencatat titik GPS:', error.message);
    return { success: false };
  }
  return { success: true };
}

export async function fetchLatestLocations(): Promise<UserLocation[]> {
  const st = useAuthStore.getState();
  const companyId = (st.user?.role === 'MASTER_SUPER_ADMIN' || st.user?.role === 'SUPERADMIN') ? (st.activeCompanyId || st.user.companyId) : st.user?.companyId;

  let usersQuery = supabase.from('users').select('id, name, company_id');
  if (companyId) usersQuery = usersQuery.eq('company_id', companyId);
  const { data: companyUsers, error: userErr } = await usersQuery;
  if (userErr || !companyUsers || companyUsers.length === 0) return [];

  const nameById = new Map<string, string>(companyUsers.map((u: any) => [u.id, u.name]));
  const userIds = Array.from(nameById.keys());

  const { data: locRows, error: locErr } = await supabase
    .from('user_locations')
    .select('user_id, latitude, longitude, accuracy, tracked_at')
    .in('user_id', userIds)
    .order('tracked_at', { ascending: false })
    .limit(200);

  if (locErr || !locRows) return [];

  const seen = new Set<string>();
  const latest: UserLocation[] = [];
  for (const row of locRows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    latest.push({
      userId: row.user_id,
      userName: nameById.get(row.user_id) || 'Teknisi',
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: Number(row.accuracy ?? 10),
      trackedAt: row.tracked_at,
    });
  }
  return latest;
}
