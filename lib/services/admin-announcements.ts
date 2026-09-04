import type { SupabaseClient } from "@supabase/supabase-js";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  publishedAt: string;
  createdAt: string;
}

function mapRow(r: { id: string; title: string; body: string; link_url: string | null; published_at: string; created_at: string }): Announcement {
  return { id: r.id, title: r.title, body: r.body, linkUrl: r.link_url, publishedAt: r.published_at, createdAt: r.created_at };
}

const COLUMNS = "id,title,body,link_url,published_at,created_at";

// Read by anyone approved (RLS announcements_select_approved) — used both by the
// admin CRUD panel and the public /novidades listing.
export async function loadAnnouncements(client: SupabaseClient): Promise<Announcement[]> {
  const { data, error } = await client.from("announcements").select(COLUMNS).order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function createAnnouncement(
  client: SupabaseClient,
  input: { title: string; body: string; linkUrl: string | null; createdBy: string },
): Promise<Announcement> {
  const { data, error } = await client
    .from("announcements")
    .insert({ title: input.title, body: input.body, link_url: input.linkUrl, created_by: input.createdBy })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function updateAnnouncement(
  client: SupabaseClient,
  id: string,
  input: { title: string; body: string; linkUrl: string | null },
): Promise<void> {
  const { error } = await client
    .from("announcements")
    .update({ title: input.title, body: input.body, link_url: input.linkUrl, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAnnouncement(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("announcements").delete().eq("id", id);
  if (error) throw error;
}
