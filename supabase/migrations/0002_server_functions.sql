-- Server-only operations. The app server calls these with SERVER_SECRET, so it never needs the
-- service role key. The secret lives in a schema the API does not expose.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.settings (key text primary key, value text not null);
-- Set the secret once, outside migrations:
--   insert into private.settings values ('server_secret', '<same value as SERVER_SECRET>');

create function private.check_secret(s text) returns void
language plpgsql security definer set search_path = private as $$
begin
  if s is null or s is distinct from (select value from settings where key = 'server_secret') then
    raise exception 'Not allowed';
  end if;
end $$;

-- Paystack checked the account name and made a subaccount; store it for the vendor.
create function public.server_save_bank(s text, uid uuid, p_bank_code text, p_bank_name text,
  p_account_number text, p_account_name text, p_subaccount text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.check_secret(s);
  insert into bank_accounts (user_id, bank_code, bank_name, account_number, account_name, subaccount_code, updated_at)
  values (uid, p_bank_code, p_bank_name, p_account_number, p_account_name, p_subaccount, now())
  on conflict (user_id) do update set bank_code = excluded.bank_code, bank_name = excluded.bank_name,
    account_number = excluded.account_number, account_name = excluded.account_name,
    subaccount_code = excluded.subaccount_code, updated_at = now();
  insert into messages (event_id, event_vendor_id, kind, body)
    select v.event_id, v.id, 'system', 'Vendor added a verified bank account (' || p_bank_name || ').'
    from event_vendors v where v.vendor_user_id = uid;
end $$;

-- Everything the server needs to start a payment for a milestone, checked against the caller.
create function public.server_payment_context(s text, uid uuid, m uuid)
returns table (milestone_id uuid, event_id uuid, event_vendor_id uuid, label text, amount_kobo bigint,
  status text, vendor_name text, subaccount_code text, is_planner boolean, terms_status text)
language plpgsql security definer set search_path = public as $$
begin
  perform private.check_secret(s);
  return query
    select ms.id, v.event_id, v.id, ms.label, ms.amount_kobo, ms.status, v.name, b.subaccount_code,
      exists (select 1 from event_members em where em.event_id = v.event_id and em.user_id = uid and em.role = 'planner'),
      v.terms_status
    from milestones ms join event_vendors v on v.id = ms.event_vendor_id
    left join bank_accounts b on b.user_id = v.vendor_user_id
    where ms.id = m;
end $$;

create function public.server_create_payment(s text, uid uuid, m uuid, ev uuid, ref text, amt bigint, fee bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.check_secret(s);
  insert into payments (event_id, milestone_id, reference, amount_kobo, fee_kobo, paid_by)
  values (ev, m, ref, amt, fee, uid);
end $$;

-- Called after Paystack confirms the money. Safe to call more than once for the same reference.
create function public.server_record_payment(s text, ref text, paid_amount bigint)
returns table (recorded boolean, vendor_phone text, vendor_name text, label text, amount_kobo bigint,
  balance_kobo bigint, event_title text)
language plpgsql security definer set search_path = public as $$
declare p payments; ms milestones; v event_vendors;
begin
  perform private.check_secret(s);
  select * into p from payments where reference = ref for update;
  if not found then raise exception 'Unknown payment reference'; end if;
  select * into ms from milestones where id = p.milestone_id;
  select * into v from event_vendors where id = ms.event_vendor_id;
  if p.status = 'success' then
    return query select false, v.phone, v.name, ms.label, p.amount_kobo, 0::bigint, ''::text;
    return;
  end if;
  if paid_amount < p.amount_kobo + p.fee_kobo then raise exception 'Amount paid is less than expected'; end if;
  update payments set status = 'success', paid_at = now() where id = p.id;
  update milestones set status = 'paid', paid_at = now() where id = ms.id;
  insert into messages (event_id, event_vendor_id, kind, body)
  values (p.event_id, v.id, 'system',
    'Payment sent: ₦' || to_char(p.amount_kobo / 100, 'FM999,999,999,999') || ' for "' || ms.label ||
    '". Paystack ref ' || ref || '. It goes straight to the vendor''s bank account.');
  return query
    select true, v.phone, v.name, ms.label, p.amount_kobo,
      (select coalesce(sum(x.amount_kobo), 0) from milestones x where x.event_vendor_id = v.id and x.status = 'unpaid')::bigint,
      (select e.title from events e where e.id = p.event_id);
end $$;

-- Lock down who can call what.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.add_planner_member() from authenticated;
grant execute on function public.server_save_bank(text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.server_payment_context(text, uuid, uuid) to anon, authenticated;
grant execute on function public.server_create_payment(text, uuid, uuid, uuid, text, bigint, bigint) to anon, authenticated;
grant execute on function public.server_record_payment(text, text, bigint) to anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
