-- Free SMS for testing: a Supabase "Send SMS" auth hook.
--
-- Instead of texting the 6-digit login code, Supabase calls this function,
-- which saves the code in public.dev_sms_codes. Read it in the dashboard:
-- Table Editor -> dev_sms_codes (newest at the top).
--
-- Setup: run this in SQL Editor, then Authentication -> Hooks ->
-- "Send SMS hook" -> Postgres -> schema public, function send_sms_hook -> Enable.
--
-- Before real users: disable the hook and switch on a real SMS provider.

create table public.dev_sms_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  otp text not null,
  created_at timestamptz not null default now()
);

create index dev_sms_codes_created_idx on public.dev_sms_codes (created_at desc);

-- App users can never read codes: RLS is on and only the auth server has a policy.
alter table public.dev_sms_codes enable row level security;
revoke all on table public.dev_sms_codes from anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant select, insert, delete on table public.dev_sms_codes to supabase_auth_admin;

create policy "auth server manages dev codes"
  on public.dev_sms_codes for all to supabase_auth_admin
  using (true) with check (true);

create function public.send_sms_hook(event jsonb)
returns void language plpgsql as $$
declare
  v_phone text := event -> 'user' ->> 'phone';
  v_otp text := event -> 'sms' ->> 'otp';
begin
  insert into public.dev_sms_codes (phone, otp) values (v_phone, v_otp);

  -- Also shows up in Logs -> Postgres.
  raise log 'Roami login code for %: %', v_phone, v_otp;

  -- Keep the table tidy: codes expire anyway.
  delete from public.dev_sms_codes where created_at < now() - interval '1 day';
end;
$$;

grant execute on function public.send_sms_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.send_sms_hook(jsonb) from authenticated, anon, public;
