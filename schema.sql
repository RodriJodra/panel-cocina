-- ─────────────────────────────────────────────────────────────
--  Panel de cocina · esquema para Supabase
--  Pega todo esto en Supabase → SQL Editor → New query → Run.
--  Se puede ejecutar varias veces sin romper nada.
-- ─────────────────────────────────────────────────────────────

-- Tareas y notas comparten tabla; "lista" indica a cuál pertenece.
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  lista       text not null,
  texto       text not null check (char_length(texto) between 1 and 500),
  hecho       boolean not null default false,
  asignado    text,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Tareas que se repiten: cada cuánto (d1, d3, s1, m1…) y cuándo toca la próxima vez.
alter table public.items add column if not exists repetir text
  check (repetir in ('d1', 'd2', 'd3', 's1', 's2', 'm1'));
alter table public.items add column if not exists proxima date;

alter table public.items drop constraint if exists items_lista_check;
alter table public.items add constraint items_lista_check check (lista in ('compra', 'tareas', 'notas'));

-- Menú semanal: una fila por día (0 = lunes … 6 = domingo) y comida.
create table if not exists public.menu (
  dia         smallint not null check (dia between 0 and 6),
  comida      text not null check (comida in ('comida', 'cena')),
  texto       text not null default '' check (char_length(texto) <= 120),
  actualizado timestamptz not null default now(),
  primary key (dia, comida)
);

-- Recetas: ingredientes y pasos van como texto, uno por línea.
create table if not exists public.recetas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null check (char_length(titulo) between 1 and 120),
  raciones     text,
  tiempo       text,
  ingredientes text not null default '',
  pasos        text not null default '',
  fuente       text,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now()
);

-- Seguridad: solo usuarios con sesión iniciada pueden leer y escribir.
-- Crea vuestras dos cuentas y desactiva los registros nuevos (ver README).
alter table public.items   enable row level security;
alter table public.menu    enable row level security;
alter table public.recetas enable row level security;

drop policy if exists "casa puede todo en items" on public.items;
create policy "casa puede todo en items" on public.items
  for all to authenticated using (true) with check (true);

drop policy if exists "casa puede todo en menu" on public.menu;
create policy "casa puede todo en menu" on public.menu
  for all to authenticated using (true) with check (true);

drop policy if exists "casa puede todo en recetas" on public.recetas;
create policy "casa puede todo en recetas" on public.recetas
  for all to authenticated using (true) with check (true);

-- Tiempo real: los cambios se ven al instante en todos los dispositivos.
do $$
declare t text;
begin
  foreach t in array array['items', 'menu', 'recetas'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
