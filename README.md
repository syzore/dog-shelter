# Dog Shelter Photo Triage

A drag-and-drop dashboard for triaging burst photography of shelter dogs into
per-dog buckets.

Next.js (App Router) + Tailwind on Vercel, Supabase for Postgres, Cloudflare R2
for images.

## Status

- [x] **Step 1** — Scaffold, env template, Supabase + R2 clients
- [x] **Step 2** — Presigned R2 upload API and client upload utility
- [x] **Step 3** — 20/80 UI shell
- [x] **Step 4** — Real Supabase data + optimistic drag-and-drop
- [x] **Step 5** — Canvas/MSE burst selection
- [x] **Step 6** — Bucket management (inline create, archive/unarchive)

## Required: R2 bucket CORS

The browser talks to R2 directly — presigned PUT uploads and canvas pixel
reads for burst detection are both cross-origin requests, and **both fail
without a CORS policy on the bucket**. This cannot be set via an
object-scoped API token; do it once in the dashboard:

Cloudflare → R2 → _your bucket_ → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://dog-shelter-omega.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace the second origin with your real deployment URL(s).

## Burst selection

Shift+click (or long-press) a photo to select its whole burst. Every photo
captured within 60 seconds of the anchor is downsampled to 64×64 grayscale on
a hidden canvas and compared to the anchor by mean squared error; frames
under the threshold join the selection, and the stack drags as one. Photos
that fail to load (usually missing CORS) are skipped and reported, never
fatal.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

Every value in `.env.example` is documented in place. `.env.local` is gitignored
and must stay that way.

## Database

```sql
create table dogs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'adopted')),
  created_at timestamptz not null default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  r2_url text not null,
  captured_at timestamptz not null,
  dog_id uuid references dogs (id) on delete set null,
  is_used boolean not null default false
);

-- The unsorted grid is the app's hot path: dog_id is null, ordered by capture time.
create index photos_unsorted_idx on photos (captured_at) where dog_id is null;
```

## Upload flow

1. Client asks `/api/upload/presigned-url` for a signed PUT. The **server** picks
   the R2 key (`photos/<uuid>.<ext>`) so a caller can't overwrite an existing
   object, and signs `ContentType` and `ContentLength` so a leaked URL can only
   upload an image of exactly the declared size (25MB cap).
2. Client PUTs the bytes straight to R2.
3. Client calls `/api/photos`, which `HeadObject`s the key before inserting, so
   an abandoned upload can't leave a row pointing at a 404.

## Known caveats

**No authentication.** Every route is public. Anyone who finds the deployed URL
can write objects into the R2 bucket and read all dogs and photos. This was a
deliberate, informed choice for an internal tool; the unlisted URL is currently
the only thing protecting it. Revisit before sharing the URL widely.

**`captured_at` comes from `file.lastModified`.** Burst grouping windows on this
field, so it has to be the real capture time. Direct card/cable imports preserve
it; AirDrop, some cloud syncs, and re-encoding tools do not, and will stamp every
file with "now" — which collapses all photos into one window and quietly degrades
burst detection into nonsense. Reading EXIF `DateTimeOriginal` is the fix if that
becomes a problem.

**Drag-and-drop uses native HTML5 events**, not `@hello-pangea/dnd`. It stays
fast at any grid size and adds no dependency, at the cost of rougher drag feel
and no built-in keyboard dragging.
