alter table public.businesses
  add column if not exists logo_url text;

create index if not exists businesses_logo_url_idx
  on public.businesses (id)
  where logo_url is not null;
