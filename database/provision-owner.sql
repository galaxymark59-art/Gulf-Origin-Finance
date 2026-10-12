-- Run only after creating the authorized owner with Supabase Auth.
begin;
insert into public.owner_profiles(id) select id from auth.users where lower(email)='ahmedmarwan8374@gmail.com' on conflict(id) do nothing;
insert into public.business_profiles(owner_id,body)
select id, '{"name":"Gulf Origin International","phone":"","email":"","address":"","city":"","vat":"","footer":"Thank you for your payment.","authorized":"","logo":"","language":"en"}'::jsonb from public.owner_profiles
on conflict(owner_id) do nothing;
commit;
