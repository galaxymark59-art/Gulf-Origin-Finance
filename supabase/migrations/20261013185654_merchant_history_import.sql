-- Reviewed historical imports create new merchant workspaces atomically.
begin;
-- Keep the actual insertion order when dates in an old file have no time of day.
alter table public.financial_transactions alter column created_at set default clock_timestamp();
create table public.import_batches(id uuid primary key,owner_id uuid not null references public.owner_profiles(id),file_hash text not null check(file_hash ~ '^[a-f0-9]{64}$'),filename text not null,created_by uuid not null references auth.users(id),result jsonb not null,created_at timestamptz not null default now(),unique(owner_id,file_hash));
alter table public.import_batches enable row level security;
revoke all on public.import_batches from public,anon,authenticated;
grant select on public.import_batches to authenticated;
create policy owner_import_history on public.import_batches for select to authenticated using(owner_id=(select private.business_id()) and (select private.permission('manage_owners')));
create trigger immutable_import before update or delete on public.import_batches for each row execute function private.immutable();
create function public.import_merchant_history(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare oid uuid:=private.business_id();uid uuid:=auth.uid();batch uuid:=(p->>'id')::uuid;g jsonb;r jsonb;m public.merchants;res jsonb;opening bigint;stamp timestamptz;amount bigint;payload jsonb;result jsonb;count_merchants integer:=0;count_rows integer:=0;
begin
 if not exists(select 1 from public.user_accounts where id=uid and active and role='owner') or not private.permission('manage_owners') then raise exception 'PERMISSION_DENIED';end if;
 if p->>'file_hash' !~ '^[a-f0-9]{64}$' or jsonb_typeof(p->'merchants')<>'array' or jsonb_array_length(p->'merchants') not between 1 and 10000 then raise exception 'INVALID_IMPORT';end if;
 perform pg_advisory_xact_lock(hashtextextended(oid::text||':history-import',0));
 select b.result into res from public.import_batches b where b.owner_id=oid and b.file_hash=p->>'file_hash';if found then return res;end if;
 perform set_config('mcube.importing','true',true);
 for g in select value from jsonb_array_elements(p->'merchants') loop
  if length(trim(g->>'name')) not between 1 and 150 or coalesce(g->>'phone','') !~ '^(\+[1-9][0-9]{7,14})?$' or (g->>'opening') is null then raise exception 'INVALID_IMPORT_MERCHANT';end if;
  if exists(select 1 from public.merchants where owner_id=oid and (lower(trim(profile->>'name'))=lower(trim(g->>'name')) or (coalesce(g->>'phone','')<>'' and profile->>'phone'=g->>'phone'))) then raise exception 'IMPORT_MERCHANT_EXISTS';end if;
  opening:=(g->>'opening')::bigint;stamp:=(g->>'start_on')::date::timestamp at time zone 'Asia/Riyadh';
  if abs(opening)>999999999999 or stamp>now()+interval '5 minutes' or stamp<'1900-01-01'::timestamptz then raise exception 'INVALID_IMPORT';end if;
  insert into public.merchants(id,owner_id,profile,prefix,balance,opening) values((g->>'id')::uuid,oid,jsonb_build_object('id',g->>'id','name',trim(g->>'name'),'phone',coalesce(g->>'phone',''),'contact','','city','','address','','notes','Imported from '||left(p->>'filename',150),'language','en'),'IM'||upper(substr(replace(g->>'id','-',''),1,10)),opening,opening) returning * into m;
  insert into public.financial_transactions(id,merchant_id,owner_id,created_by,kind,amount,delta,previous,balance,method,note,occurred_at,reference) values((g->>'opening_id')::uuid,m.id,oid,uid,'opening',0,opening,0,opening,'adjustment','Opening amount before imported history',stamp,m.prefix||' OPEN');
  for r in select value from jsonb_array_elements(g->'rows') loop
   count_rows:=count_rows+1;if count_rows>10000 then raise exception 'IMPORT_TOO_LARGE';end if;
   if r->>'kind' not in ('payment','invoice','return','adjustment') then raise exception 'INVALID_IMPORT';end if;
   amount:=(r->>'amount')::bigint;if amount is null or amount=0 or abs(amount)>999999999999 or (r->>'kind'<>'adjustment' and amount<0) then raise exception 'INVALID_IMPORT';end if;
   if length(trim(r->>'reference')) not between 1 and 80 or (r->>'occurred_at')::timestamptz<stamp then raise exception 'INVALID_IMPORT';end if;
   payload:=jsonb_build_object('merchant_id',m.id,'kind',r->>'kind','amount',amount,'method',coalesce(nullif(r->>'method',''),'other'),'occurred_at',r->>'occurred_at','note','Imported reference: '||(r->>'reference')||case when coalesce(r->>'note','')='' then '' else E'\n'||(r->>'note') end);
   if r->>'kind' in ('invoice','return') then payload:=payload||jsonb_build_object('document',jsonb_build_object('reference',r->>'reference','date',((r->>'occurred_at')::timestamptz at time zone 'Asia/Riyadh')::date,'lines',jsonb_build_array(jsonb_build_object('id',r->>'id','description','Historical total; item details not supplied','quantity',1000,'unit_price',amount,'total',amount))));end if;
   result:=private.commit_operation(jsonb_build_object('id',r->>'id','kind','entry','payload',payload,'expected',m.balance));
   select * into strict m from public.merchants where id=m.id;
  end loop;
  if g ? 'closing' and m.balance<>(g->>'closing')::bigint then raise exception 'IMPORT_BALANCE_MISMATCH';end if;
  count_merchants:=count_merchants+1;
 end loop;
 perform set_config('mcube.importing','false',true);
 res:=jsonb_build_object('merchants',count_merchants,'transactions',count_rows);
 insert into public.import_batches(id,owner_id,file_hash,filename,created_by,result) values(batch,oid,p->>'file_hash',left(p->>'filename',200),uid,res);
 return res;
end;$$;
revoke all on function public.import_merchant_history(jsonb) from public,anon,authenticated;
grant execute on function public.import_merchant_history(jsonb) to authenticated;
create or replace function private.enqueue_payment_notification() returns trigger language plpgsql security definer set search_path='' as $$declare recipient uuid;event_id uuid;begin
 if new.kind<>'payment' or current_setting('mcube.importing',true)='true' then return new;end if;
 select u.id into recipient from public.user_accounts u where u.id=new.owner_id and u.active and u.role='owner';if recipient is null then return new;end if;
 insert into public.notification_events(transaction_id,recipient_id,created_by) values(new.id,recipient,coalesce(new.created_by,new.owner_id)) returning id into event_id;
 if exists(select 1 from public.push_devices where owner_id=recipient and active) then
  insert into private.notification_outbox(event_id) values(event_id);begin perform private.dispatch_payment_notifications();exception when others then null;end;
 end if;return new;end;$$;
commit;
