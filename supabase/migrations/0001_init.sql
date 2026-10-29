-- Owambe Desk: initial schema. Money is stored in kobo (₦1 = 100 kobo).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  planner_id uuid not null default auth.uid() references public.profiles (id),
  title text not null check (length(title) between 2 and 120),
  event_date date,
  venue text,
  guests int check (guests >= 0),
  budget_kobo bigint not null default 0 check (budget_kobo >= 0),
  created_at timestamptz not null default now()
);

create table public.event_members (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('planner', 'vendor', 'client')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index on public.event_members (user_id);

create table public.event_vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(name) between 2 and 120),
  category text not null default 'Other',
  phone text,
  total_kobo bigint not null default 0 check (total_kobo >= 0),
  vendor_user_id uuid references public.profiles (id),
  terms_status text not null default 'none' check (terms_status in ('none', 'sent', 'accepted')),
  created_at timestamptz not null default now()
);
create index on public.event_vendors (event_id);
create index on public.event_vendors (vendor_user_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  event_vendor_id uuid not null references public.event_vendors (id) on delete cascade,
  position int not null,
  label text not null,
  pct int not null check (pct between 1 and 100),
  amount_kobo bigint not null check (amount_kobo > 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  unique (event_vendor_id, position)
);

create table public.bank_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bank_code text not null,
  bank_name text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null,
  subaccount_code text not null,
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  milestone_id uuid not null references public.milestones (id) on delete restrict,
  reference text not null unique,
  amount_kobo bigint not null,
  fee_kobo bigint not null default 0,
  status text not null default 'initialized' check (status in ('initialized', 'success', 'failed')),
  paid_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.payments (event_id);
create index on public.payments (milestone_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_vendor_id uuid not null references public.event_vendors (id) on delete cascade,
  sender_id uuid references public.profiles (id),
  kind text not null default 'text' check (kind in ('text', 'system')),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (event_vendor_id, created_at);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  event_vendor_id uuid not null references public.event_vendors (id) on delete cascade,
  number text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  note text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.invoices (event_vendor_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  description text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  category text not null default 'Other',
  paid_with text not null default 'Cash',
  spent_on date not null default current_date,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.expenses (event_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  description text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  requested_by uuid not null default auth.uid() references public.profiles (id),
  decided_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.approvals (event_id);

create table public.invites (
  token text primary key default encode(extensions.gen_random_bytes(12), 'hex'),
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null check (role in ('vendor', 'client')),
  event_vendor_id uuid references public.event_vendors (id) on delete cascade,
  used_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- helpers (security definer so policies don't recurse) ----------

create function public.event_role(e uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from event_members where event_id = e and user_id = auth.uid()
$$;

create function public.is_vendor_of(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_vendors where id = ev and vendor_user_id = auth.uid())
$$;

create function public.vendor_event(ev uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from event_vendors where id = ev
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.add_planner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into event_members (event_id, user_id, role) values (new.id, new.planner_id, 'planner');
  return new;
end $$;
create trigger on_event_created after insert on public.events
  for each row execute function public.add_planner_member();

-- Join an event from a WhatsApp invite link.
create function public.accept_invite(t text) returns table (event_id uuid, event_vendor_id uuid)
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from invites where token = t;
  if not found then raise exception 'This invite link is not valid'; end if;
  if inv.used_by is not null and inv.used_by <> auth.uid() then
    raise exception 'This invite link has already been used';
  end if;
  insert into event_members (event_id, user_id, role)
    values (inv.event_id, auth.uid(), inv.role) on conflict do nothing;
  if inv.event_vendor_id is not null then
    update event_vendors set vendor_user_id = auth.uid() where id = inv.event_vendor_id;
  end if;
  update invites set used_by = auth.uid() where token = t;
  return query select inv.event_id, inv.event_vendor_id;
end $$;

create function public.accept_terms(ev uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_vendor_of(ev) then raise exception 'Only the vendor can accept these terms'; end if;
  update event_vendors set terms_status = 'accepted' where id = ev and terms_status = 'sent';
  insert into messages (event_id, event_vendor_id, kind, body)
    values (vendor_event(ev), ev, 'system', 'Payment terms accepted by the vendor.');
end $$;

create function public.decide_approval(a uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare ap approvals;
begin
  select * into ap from approvals where id = a;
  if event_role(ap.event_id) is distinct from 'client' then raise exception 'Only the client can decide'; end if;
  update approvals set status = case when approve then 'approved' else 'declined' end, decided_by = auth.uid()
    where id = a and status = 'pending';
end $$;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.event_vendors enable row level security;
alter table public.milestones enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.approvals enable row level security;
alter table public.invites enable row level security;

create policy "own profile" on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from event_members me join event_members them on me.event_id = them.event_id
    where me.user_id = auth.uid() and them.user_id = profiles.id));
create policy "update own profile" on public.profiles for update using (id = auth.uid());

create policy "members see event" on public.events for select using (event_role(id) is not null);
create policy "planner creates event" on public.events for insert with check (planner_id = auth.uid());
create policy "planner edits event" on public.events for update using (event_role(id) = 'planner');

create policy "members see members" on public.event_members for select using (event_role(event_id) is not null);

create policy "see vendors" on public.event_vendors for select using (
  event_role(event_id) in ('planner', 'client') or vendor_user_id = auth.uid());
create policy "planner adds vendors" on public.event_vendors for insert with check (event_role(event_id) = 'planner');
create policy "planner edits vendors" on public.event_vendors for update using (event_role(event_id) = 'planner');
create policy "planner removes vendors" on public.event_vendors for delete using (event_role(event_id) = 'planner');

create policy "see milestones" on public.milestones for select using (
  event_role(vendor_event(event_vendor_id)) in ('planner', 'client') or is_vendor_of(event_vendor_id));
create policy "planner writes milestones" on public.milestones for all
  using (event_role(vendor_event(event_vendor_id)) = 'planner')
  with check (event_role(vendor_event(event_vendor_id)) = 'planner');

-- Bank details: the owner, and planners of events the vendor works on. Couples never see them.
-- Writes go through the server, which checks the account with Paystack first.
create policy "see bank account" on public.bank_accounts for select using (
  user_id = auth.uid() or exists (
    select 1 from event_vendors v where v.vendor_user_id = bank_accounts.user_id and event_role(v.event_id) = 'planner'));

create policy "see payments" on public.payments for select using (
  event_role(event_id) in ('planner', 'client') or exists (
    select 1 from milestones m where m.id = payments.milestone_id and is_vendor_of(m.event_vendor_id)));

-- Chat is between planner and vendor. Couples see the system updates (payments, terms).
create policy "see messages" on public.messages for select using (
  event_role(event_id) = 'planner' or is_vendor_of(event_vendor_id)
  or (kind = 'system' and event_role(event_id) = 'client'));
create policy "send messages" on public.messages for insert with check (
  sender_id = auth.uid() and kind = 'text'
  and (event_role(event_id) = 'planner' or is_vendor_of(event_vendor_id))
  and vendor_event(event_vendor_id) = event_id);

create policy "see invoices" on public.invoices for select using (
  event_role(event_id) in ('planner', 'client') or is_vendor_of(event_vendor_id));
create policy "send invoices" on public.invoices for insert with check (
  (is_vendor_of(event_vendor_id) or event_role(event_id) = 'planner')
  and vendor_event(event_vendor_id) = event_id);

create policy "see expenses" on public.expenses for select using (event_role(event_id) in ('planner', 'client'));
create policy "planner logs expenses" on public.expenses for insert with check (event_role(event_id) = 'planner');

create policy "see approvals" on public.approvals for select using (event_role(event_id) in ('planner', 'client'));
create policy "planner requests approval" on public.approvals for insert with check (event_role(event_id) = 'planner');

create policy "planner sees invites" on public.invites for select using (event_role(event_id) = 'planner');
create policy "planner creates invites" on public.invites for insert with check (event_role(event_id) = 'planner');

-- Live chat updates
alter publication supabase_realtime add table public.messages;
