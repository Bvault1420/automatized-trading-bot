-- =============================================================================
-- Playfeed – Datenbank-Schema
-- Ausführen im Supabase SQL-Editor (oder via `supabase db push`).
-- Alles ist idempotent aufgebaut, damit es mehrfach ausgeführt werden kann.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.game_visibility as enum ('public', 'unlisted', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_status as enum ('draft', 'published', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_target as enum ('game', 'comment', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('like', 'comment', 'follow', 'remix');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Hilfsfunktionen
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profile
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_url text,
  website text,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  accepted_terms_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username::text ~ '^[a-z0-9_]{3,20}$'),
  constraint display_name_length check (char_length(display_name) <= 40),
  constraint bio_length check (char_length(bio) <= 200),
  constraint website_length check (website is null or char_length(website) <= 200)
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Profil automatisch beim Registrieren anlegen (Username aus den Metadaten).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  base := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then
    base := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  base := substr(base, 1, 20);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := substr(base, 1, 20 - char_length(n::text)) || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, accepted_terms_at)
  values (
    new.id,
    candidate,
    substr(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      candidate
    ), 1, 40),
    case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() else null end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Spiele
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  html text not null,
  thumbnail_url text,
  tags text[] not null default '{}',
  visibility public.game_visibility not null default 'public',
  status public.game_status not null default 'published',
  remix_of uuid references public.games(id) on delete set null,
  allow_remix boolean not null default true,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  play_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint title_length check (char_length(title) between 1 and 80),
  constraint description_length check (char_length(description) <= 500),
  constraint html_size check (octet_length(html) between 1 and 400000),
  constraint tags_limit check (cardinality(tags) <= 8)
);

create index if not exists games_author_idx on public.games(author_id, created_at desc);
create index if not exists games_feed_idx on public.games(status, visibility, created_at desc);
create index if not exists games_tags_idx on public.games using gin(tags);
create index if not exists games_search_idx on public.games
  using gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '')));

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Likes, Kommentare, Follows, Blocks
-- -----------------------------------------------------------------------------
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists likes_game_idx on public.likes(game_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint body_length check (char_length(body) between 1 and 500)
);
create index if not exists comments_game_idx on public.comments(game_id, created_at desc);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows(following_id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

-- Sicherheits-Helfer (nach den Tabellen, da SQL-Funktionen beim Anlegen geprüft werden)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

-- Prüft, ob zwischen zwei Nutzern eine Blockierung (in beliebiger Richtung) besteht.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;


-- Vergleich geschützter Spalten ohne RLS-Rekursion (Policies dürfen die eigene Tabelle nicht direkt abfragen).
create or replace function public.game_counters_match(p_id uuid, p_like integer, p_comment integer, p_play integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = p_id and g.like_count = p_like and g.comment_count = p_comment and g.play_count = p_play
  );
$$;

create or replace function public.profile_protected_match(p_id uuid, p_admin boolean, p_banned boolean, p_followers integer, p_following integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id and p.is_admin = p_admin and p.is_banned = p_banned
      and p.follower_count = p_followers and p.following_count = p_following
  );
$$;

create or replace function public.can_remix(p_remix_of uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = p_remix_of
      and ((g.allow_remix and g.status = 'published' and g.visibility <> 'private') or g.author_id = auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Meldungen (Moderation) & Benachrichtigungen
-- -----------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null,
  details text not null default '',
  status public.report_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint reason_length check (char_length(reason) between 1 and 60),
  constraint details_length check (char_length(details) <= 1000)
);
create index if not exists reports_status_idx on public.reports(status, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  game_id uuid references public.games(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Rate-Limiting (einfaches Zeitfenster pro Nutzer & Aktion)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, action, window_start)
);

create or replace function public.check_rate_limit(p_action text, p_max integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws timestamptz;
  current_count integer;
begin
  if uid is null then
    -- Service-Role/Server-Skripte ohne Nutzerkontext werden nicht limitiert.
    return;
  end if;
  ws := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (user_id, action, window_start, count)
  values (uid, p_action, ws, 1)
  on conflict (user_id, action, window_start)
  do update set count = public.rate_limits.count + 1
  returning count into current_count;
  if current_count > p_max then
    raise exception 'Zu viele Anfragen. Bitte warte kurz.' using errcode = 'P0001';
  end if;
  -- Alte Fenster gelegentlich aufräumen
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Trigger: Zähler, Benachrichtigungen, Limits, Sperren
-- -----------------------------------------------------------------------------
create or replace function public.on_like_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.games set like_count = like_count + 1 where id = new.game_id returning author_id into owner;
    if owner is not null and owner <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, game_id)
      values (owner, new.user_id, 'like', new.game_id);
    end if;
    return new;
  else
    update public.games set like_count = greatest(like_count - 1, 0) where id = old.game_id;
    delete from public.notifications
      where type = 'like' and actor_id = old.user_id and game_id = old.game_id;
    return old;
  end if;
end $$;

drop trigger if exists likes_change on public.likes;
create trigger likes_change after insert or delete on public.likes
  for each row execute function public.on_like_change();

create or replace function public.on_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  if tg_op = 'INSERT' then
    update public.games set comment_count = comment_count + 1 where id = new.game_id returning author_id into owner;
    if owner is not null and owner <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, game_id, comment_id)
      values (owner, new.user_id, 'comment', new.game_id, new.id);
    end if;
    return new;
  else
    update public.games set comment_count = greatest(comment_count - 1, 0) where id = old.game_id;
    return old;
  end if;
end $$;

drop trigger if exists comments_change on public.comments;
create trigger comments_change after insert or delete on public.comments
  for each row execute function public.on_comment_change();

create or replace function public.on_follow_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set follower_count = follower_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    insert into public.notifications (user_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
    return new;
  else
    update public.profiles set follower_count = greatest(follower_count - 1, 0) where id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    delete from public.notifications
      where type = 'follow' and actor_id = old.follower_id and user_id = old.following_id;
    return old;
  end if;
end $$;

drop trigger if exists follows_change on public.follows;
create trigger follows_change after insert or delete on public.follows
  for each row execute function public.on_follow_change();

create or replace function public.on_game_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare original_owner uuid;
begin
  if new.remix_of is not null then
    select author_id into original_owner from public.games where id = new.remix_of;
    if original_owner is not null and original_owner <> new.author_id and new.status = 'published' then
      insert into public.notifications (user_id, actor_id, type, game_id)
      values (original_owner, new.author_id, 'remix', new.id);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists games_after_insert on public.games;
create trigger games_after_insert after insert on public.games
  for each row execute function public.on_game_insert();

-- Blockieren beendet gegenseitiges Folgen.
create or replace function public.on_block_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.follows
    where (follower_id = new.blocker_id and following_id = new.blocked_id)
       or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end $$;

drop trigger if exists blocks_after_insert on public.blocks;
create trigger blocks_after_insert after insert on public.blocks
  for each row execute function public.on_block_insert();

-- Rate-Limits vor Schreibzugriffen
create or replace function public.rl_games() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('create_game', 30, 3600); return new; end $$;
create or replace function public.rl_comments() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('comment', 60, 3600); return new; end $$;
create or replace function public.rl_reports() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('report', 20, 3600); return new; end $$;
create or replace function public.rl_likes() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('like', 600, 3600); return new; end $$;
create or replace function public.rl_follows() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.check_rate_limit('follow', 200, 3600); return new; end $$;

drop trigger if exists games_rate_limit on public.games;
create trigger games_rate_limit before insert on public.games for each row execute function public.rl_games();
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments for each row execute function public.rl_comments();
drop trigger if exists reports_rate_limit on public.reports;
create trigger reports_rate_limit before insert on public.reports for each row execute function public.rl_reports();
drop trigger if exists likes_rate_limit on public.likes;
create trigger likes_rate_limit before insert on public.likes for each row execute function public.rl_likes();
drop trigger if exists follows_rate_limit on public.follows;
create trigger follows_rate_limit before insert on public.follows for each row execute function public.rl_follows();

-- Gesperrte Nutzer dürfen nichts schreiben.
create or replace function public.assert_not_banned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = auth.uid() and is_banned) then
    raise exception 'Dieses Konto ist gesperrt.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists games_not_banned on public.games;
create trigger games_not_banned before insert or update on public.games for each row execute function public.assert_not_banned();
drop trigger if exists comments_not_banned on public.comments;
create trigger comments_not_banned before insert on public.comments for each row execute function public.assert_not_banned();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.rate_limits enable row level security;

-- profiles
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and public.profile_protected_match(id, is_admin, is_banned, follower_count, following_count)
  );
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update
  using (public.is_admin()) with check (public.is_admin());

-- games
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select using (
  auth.uid() = author_id
  or public.is_admin()
  or (
    status = 'published'
    and visibility in ('public', 'unlisted')
    and not exists (select 1 from public.profiles p where p.id = author_id and p.is_banned)
    and (auth.uid() is null or not public.is_blocked_between(auth.uid(), author_id))
  )
);
drop policy if exists "games_insert_own" on public.games;
create policy "games_insert_own" on public.games for insert with check (
  auth.uid() = author_id
  and status in ('draft', 'published')
  and like_count = 0 and comment_count = 0 and play_count = 0
  and (remix_of is null or public.can_remix(remix_of))
);
drop policy if exists "games_update_own" on public.games;
create policy "games_update_own" on public.games for update
  using (auth.uid() = author_id)
  with check (
    auth.uid() = author_id
    and status in ('draft', 'published')
    and public.game_counters_match(id, like_count, comment_count, play_count)
  );
drop policy if exists "games_admin_update" on public.games;
create policy "games_admin_update" on public.games for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "games_delete_own" on public.games;
create policy "games_delete_own" on public.games for delete using (auth.uid() = author_id or public.is_admin());

-- likes
drop policy if exists "likes_select" on public.likes;
create policy "likes_select" on public.likes for select using (true);
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.games g where g.id = game_id)
);
drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes for delete using (auth.uid() = user_id);

-- comments
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select using (
  exists (select 1 from public.games g where g.id = game_id)
  and (auth.uid() is null or not public.is_blocked_between(auth.uid(), user_id))
);
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.games g where g.id = game_id and g.status = 'published')
);
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete using (
  auth.uid() = user_id
  or public.is_admin()
  or exists (select 1 from public.games g where g.id = game_id and g.author_id = auth.uid())
);

-- follows
drop policy if exists "follows_select" on public.follows;
create policy "follows_select" on public.follows for select using (true);
drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows for insert with check (
  auth.uid() = follower_id and not public.is_blocked_between(follower_id, following_id)
);
drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete using (auth.uid() = follower_id);

-- blocks
drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own" on public.blocks for select using (auth.uid() = blocker_id);
drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own" on public.blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own" on public.blocks for delete using (auth.uid() = blocker_id);

-- reports
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own" on public.reports for insert with check (auth.uid() = reporter_id and status = 'open');
drop policy if exists "reports_select_admin" on public.reports;
create policy "reports_select_admin" on public.reports for select using (public.is_admin() or auth.uid() = reporter_id);
drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin" on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete using (auth.uid() = user_id);

-- rate_limits: keine direkten Zugriffe (nur über check_rate_limit)

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Karten-View (Spiel + Autor + Nutzerbezug). security_invoker => RLS der Tabellen gilt.
create or replace view public.game_cards
with (security_invoker = true) as
select
  g.id,
  g.title,
  g.description,
  g.thumbnail_url,
  g.tags,
  g.visibility,
  g.status,
  g.like_count,
  g.comment_count,
  g.play_count,
  g.remix_of,
  g.allow_remix,
  g.created_at,
  p.id as author_id,
  p.username::text as author_username,
  p.display_name as author_display_name,
  p.avatar_url as author_avatar_url,
  p.is_banned as author_banned,
  (auth.uid() is not null and exists (
    select 1 from public.likes l where l.game_id = g.id and l.user_id = auth.uid()
  )) as liked_by_me,
  (auth.uid() is not null and exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id
  )) as following_author
from public.games g
join public.profiles p on p.id = g.author_id;

-- Feed
create or replace function public.get_feed(
  p_mode text default 'foryou',
  p_limit integer default 10,
  p_offset integer default 0,
  p_seed text default ''
)
returns setof public.game_cards
language sql stable security invoker set search_path = public as $$
  with base as (
    select c.*
    from public.game_cards c
    where c.status = 'published'
      and c.visibility = 'public'
      and not c.author_banned
      and (auth.uid() is null or not public.is_blocked_between(auth.uid(), c.author_id))
      and (
        p_mode <> 'following'
        or c.following_author
      )
  ),
  ranked as (
    select b.*,
      case
        when p_mode in ('following', 'new') then extract(epoch from b.created_at)
        else
          (b.like_count * 3 + b.comment_count * 5 + b.play_count * 0.2 + 10)
          / power(greatest(extract(epoch from (now() - b.created_at)) / 3600, 0) + 2, 1.2)
          * (0.85 + 0.3 * (abs(hashtext(b.id::text || p_seed)) % 1000) / 1000.0)
      end as score
    from base b
  )
  select
    r.id, r.title, r.description, r.thumbnail_url, r.tags, r.visibility, r.status,
    r.like_count, r.comment_count, r.play_count, r.remix_of, r.allow_remix, r.created_at,
    r.author_id, r.author_username, r.author_display_name, r.author_avatar_url, r.author_banned,
    r.liked_by_me, r.following_author
  from ranked r
  order by r.score desc, r.id desc
  limit greatest(1, least(p_limit, 30))
  offset greatest(0, p_offset);
$$;

-- Suche (Titel/Beschreibung/Tags)
create or replace function public.search_games(p_query text, p_limit integer default 30)
returns setof public.game_cards
language sql stable security invoker set search_path = public as $$
  select c.*
  from public.game_cards c
  where c.status = 'published' and c.visibility = 'public' and not c.author_banned
    and (auth.uid() is null or not public.is_blocked_between(auth.uid(), c.author_id))
    and (
      to_tsvector('simple', coalesce(c.title, '') || ' ' || coalesce(c.description, ''))
        @@ plainto_tsquery('simple', p_query)
      or c.title ilike '%' || p_query || '%'
      or exists (select 1 from unnest(c.tags) t where t ilike '%' || p_query || '%')
    )
  order by (c.like_count * 3 + c.play_count) desc, c.created_at desc
  limit greatest(1, least(p_limit, 60));
$$;

-- Beliebte Tags
create or replace function public.trending_tags(p_limit integer default 20)
returns table (tag text, cnt bigint)
language sql stable security invoker set search_path = public as $$
  select t as tag, count(*) as cnt
  from public.games g, unnest(g.tags) t
  where g.status = 'published' and g.visibility = 'public'
    and g.created_at > now() - interval '30 days'
  group by t
  order by cnt desc, t
  limit greatest(1, least(p_limit, 50));
$$;

-- Play-Zähler (auch anonym erlaubt; bewusst leichtgewichtig)
create or replace function public.record_play(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.games set play_count = play_count + 1
  where id = p_game_id and status = 'published';
end $$;

-- Username verfügbar?
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,20}$'
    and lower(p_username) not in (
      'admin','administrator','root','support','help','playfeed','official','moderator','mod',
      'system','api','login','signup','settings','explore','create','legal','about','staff','team'
    )
    and not exists (select 1 from public.profiles where username = lower(p_username));
$$;

-- Ungelesene Benachrichtigungen
create or replace function public.unread_notification_count()
returns integer language sql stable security invoker set search_path = public as $$
  select count(*)::integer from public.notifications where user_id = auth.uid() and not read;
$$;

-- -----------------------------------------------------------------------------
-- Storage: Buckets & Policies
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif']),
  ('thumbnails', 'thumbnails', true, 3145728, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public_read_media" on storage.objects;
create policy "public_read_media" on storage.objects for select
  using (bucket_id in ('avatars', 'thumbnails'));

drop policy if exists "users_write_own_media" on storage.objects;
create policy "users_write_own_media" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'thumbnails')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users_update_own_media" on storage.objects;
create policy "users_update_own_media" on storage.objects for update to authenticated
  using (bucket_id in ('avatars', 'thumbnails') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('avatars', 'thumbnails') and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users_delete_own_media" on storage.objects;
create policy "users_delete_own_media" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars', 'thumbnails') and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.games, public.game_cards, public.likes, public.comments, public.follows to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.games to authenticated;
grant insert, delete on public.likes, public.follows, public.blocks to authenticated;
grant insert, delete on public.comments to authenticated;
grant select on public.blocks, public.notifications, public.reports to authenticated;
grant update, delete on public.notifications to authenticated;
grant insert, update on public.reports to authenticated;
grant execute on function public.get_feed(text, integer, integer, text) to anon, authenticated;
grant execute on function public.search_games(text, integer) to anon, authenticated;
grant execute on function public.trending_tags(integer) to anon, authenticated;
grant execute on function public.record_play(uuid) to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to anon, authenticated;
grant execute on function public.game_counters_match(uuid, integer, integer, integer) to authenticated;
grant execute on function public.profile_protected_match(uuid, boolean, boolean, integer, integer) to authenticated;
grant execute on function public.can_remix(uuid) to authenticated;
revoke all on public.rate_limits from anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from anon, authenticated, public;
