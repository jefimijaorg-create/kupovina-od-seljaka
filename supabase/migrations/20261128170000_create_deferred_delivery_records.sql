-- ADMIN #46: deferred deliveries
-- Source IDs in stavke_porudzbine, porudzbine and ture are bigint.
create table if not exists public.odlozene_isporuke (
  id bigint generated always as identity primary key,
  originalna_stavka_id bigint not null references public.stavke_porudzbine(id) on delete cascade,
  porudzbina_id bigint not null references public.porudzbine(id) on delete cascade,
  izvorna_tura_id bigint not null references public.ture(id),
  ciljna_tura_id bigint not null references public.ture(id),
  odlozena_kolicina numeric not null check (odlozena_kolicina > 0),
  status text not null default 'odlozeno',
  napomena text,
  created_at timestamptz not null default now(),
  constraint odlozene_isporuke_different_tours check (izvorna_tura_id <> ciljna_tura_id),
  constraint odlozene_isporuke_status_check check (status in ('odlozeno','isporuceno','otkazano'))
);
create index if not exists odlozene_isporuke_source_tour_idx on public.odlozene_isporuke(izvorna_tura_id);
create index if not exists odlozene_isporuke_target_tour_idx on public.odlozene_isporuke(ciljna_tura_id);
create index if not exists odlozene_isporuke_order_idx on public.odlozene_isporuke(porudzbina_id);
alter table public.odlozene_isporuke enable row level security;
drop policy if exists odlozene_isporuke_admin_read on public.odlozene_isporuke;
create policy odlozene_isporuke_admin_read on public.odlozene_isporuke for select to authenticated using (exists (select 1 from public.app_users au where au.auth_user_id=auth.uid() and au.is_active is true and au.role in ('super_admin','admin','operator','viewer')));
drop policy if exists odlozene_isporuke_admin_write on public.odlozene_isporuke;
create policy odlozene_isporuke_admin_write on public.odlozene_isporuke for all to authenticated using (exists (select 1 from public.app_users au where au.auth_user_id=auth.uid() and au.is_active is true and au.role in ('super_admin','admin','operator'))) with check (exists (select 1 from public.app_users au where au.auth_user_id=auth.uid() and au.is_active is true and au.role in ('super_admin','admin','operator')));
