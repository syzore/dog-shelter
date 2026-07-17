-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run.

create table if not exists dogs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'adopted')),
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  r2_url text not null,
  captured_at timestamptz not null,
  dog_id uuid references dogs (id) on delete set null,
  is_used boolean not null default false
);

-- The unsorted grid is the hot path: dog_id is null, ordered by capture time.
create index if not exists photos_unsorted_idx
  on photos (captured_at)
  where dog_id is null;

-- Filing a burst updates many rows by dog_id; the sidebar counts by it too.
create index if not exists photos_dog_id_idx on photos (dog_id);

-- ---------------------------------------------------------------------------
-- Row Level Security is intentionally NOT enabled.
--
-- The app has no auth, and the browser talks to Supabase with the anon key, so
-- enabling RLS without policies would lock the app out of its own data, and
-- adding permissive anon policies would leave it just as open while looking
-- secure. Leaving RLS off states the situation honestly instead.
--
-- The consequence: anyone holding the project URL and the anon key (which is
-- public by design and shipped in the client bundle) can read and write these
-- tables directly. Enable RLS and add real policies as part of adding auth.
-- ---------------------------------------------------------------------------
