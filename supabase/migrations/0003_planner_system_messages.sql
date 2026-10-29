-- Planners can post status updates (terms shared) into a vendor chat. Policies are OR'd, so this
-- adds to "send messages" without replacing it.
create policy "planner posts updates" on public.messages for insert with check (
  kind = 'system' and sender_id is null and event_role(event_id) = 'planner'
  and vendor_event(event_vendor_id) = event_id);
