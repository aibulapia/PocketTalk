-- PocketTalk v2: admin + reports + secure moderation policies
-- Run once in Supabase SQL Editor AFTER the existing PocketTalk SQL files.

alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','message','room')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reports_status_created_idx on public.reports(status, created_at desc);
create index if not exists reports_target_idx on public.reports(target_type, target_id);
alter table public.reports enable row level security;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
with check (auth.uid() = reporter_id);
drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports for select to authenticated using (public.is_admin());
drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin moderation. Owner policies remain unchanged; these add admin authority.
drop policy if exists posts_delete_admin on public.posts;
create policy posts_delete_admin on public.posts for delete to authenticated using (public.is_admin());
drop policy if exists post_images_delete_admin on public.post_images;
create policy post_images_delete_admin on public.post_images for delete to authenticated using (public.is_admin() or exists (select 1 from public.posts p where p.id = post_images.post_id and p.author_id = auth.uid()));
drop policy if exists comments_delete_admin on public.comments;
create policy comments_delete_admin on public.comments for delete to authenticated using (public.is_admin());
drop policy if exists chat_messages_delete_admin on public.chat_messages;
create policy chat_messages_delete_admin on public.chat_messages for delete to authenticated using (public.is_admin());
drop policy if exists chat_rooms_delete_admin on public.chat_rooms;
create policy chat_rooms_delete_admin on public.chat_rooms for delete to authenticated using (public.is_admin());

-- Mark the current administrator account manually. Replace the UUID first.
-- update public.profiles set is_admin = true where id = 'PASTE_CURRENT_ANONYMOUS_USER_UUID_HERE';

-- Check result:
-- select id, nickname, is_admin from public.profiles order by is_admin desc, created_at;
