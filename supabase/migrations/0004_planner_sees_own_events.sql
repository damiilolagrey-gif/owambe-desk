-- The planner's membership row is added by an AFTER INSERT trigger, which the insert's RETURNING
-- check can't see yet. Let planners always read events they created.
create policy "planner sees own events" on public.events for select using (planner_id = auth.uid());
