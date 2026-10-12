-- Gulf Origin private collection ledger. Run as the project database administrator.
begin;
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
create table public.owner_profiles(id uuid primary key references auth.users(id),singleton boolean not null default true unique check(singleton));
create table public.business_profiles(owner_id uuid primary key references public.owner_profiles(id), body jsonb not null, version bigint not null default 1);
create table public.merchants(id uuid primary key,owner_id uuid not null references public.owner_profiles(id),profile jsonb not null,prefix text not null unique check(prefix ~ '^[A-Z0-9]{1,12}$'),balance bigint not null default 0 check(abs(balance)<=999999999999),opening bigint not null default 0,sequence bigint not null default 0,version bigint not null default 1,created_at timestamptz not null default now(),last_payment timestamptz);
create index merchant_owner_name on public.merchants(owner_id, lower(profile->>'name'));
create index merchant_phone on public.merchants((profile->>'phone'));
create table public.financial_transactions(id uuid primary key,merchant_id uuid not null references public.merchants(id),owner_id uuid not null references public.owner_profiles(id),kind text not null check(kind in ('opening','payment','adjustment','reversal')),amount bigint not null check(amount>=0 and amount<=999999999999),delta bigint not null,previous bigint not null,balance bigint not null,method text not null,note text not null default '',occurred_at timestamptz not null,created_at timestamptz not null default now(),reference text not null unique,reverses uuid unique references public.financial_transactions(id),check(balance=previous+delta),check((kind='payment' and amount>0 and delta=-amount) or kind<>'payment'));
create index transaction_merchant_date on public.financial_transactions(merchant_id,created_at,id);
create index transaction_owner_date on public.financial_transactions(owner_id,occurred_at,id);
create table public.receipts(id uuid primary key,transaction_id uuid not null unique references public.financial_transactions(id),merchant_id uuid not null references public.merchants(id),owner_id uuid not null references public.owner_profiles(id),reference text not null unique,snapshot jsonb not null,created_at timestamptz not null default now());
create table public.receipt_shares(id uuid primary key,receipt_id uuid not null references public.receipts(id),owner_id uuid not null references public.owner_profiles(id),status text not null check(status in ('share_initiated','confirmed_sent','failed')),created_at timestamptz not null default now());
create index receipt_share_recent on public.receipt_shares(receipt_id,created_at desc,id);
create table public.sync_operations(id uuid primary key,owner_id uuid not null references public.owner_profiles(id),request jsonb not null,result jsonb not null,created_at timestamptz not null default now());
create table public.audit_logs(id bigint generated always as identity primary key,owner_id uuid not null references public.owner_profiles(id),operation_id uuid not null,action text not null,body jsonb not null,created_at timestamptz not null default now());
create function private.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'IMMUTABLE_LEDGER';end;$$;
create trigger immutable_transactions before update or delete on public.financial_transactions for each row execute function private.immutable();
create trigger immutable_receipts before update or delete on public.receipts for each row execute function private.immutable();
create trigger immutable_shares before update or delete on public.receipt_shares for each row execute function private.immutable();
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function private.immutable();
create trigger immutable_sync before update or delete on public.sync_operations for each row execute function private.immutable();
do $$declare t text;begin foreach t in array array['owner_profiles','business_profiles','merchants','financial_transactions','receipts','receipt_shares','sync_operations','audit_logs'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from anon,authenticated',t);
execute format('grant select on public.%I to authenticated',t);
if t='owner_profiles' then execute format('create policy owner_read on public.%I for select to authenticated using (id=(select auth.uid()))',t);
else execute format('create policy owner_read on public.%I for select to authenticated using (owner_id=(select auth.uid()))',t);end if;
end loop;end$$;
create function private.merchant_json(m public.merchants) returns jsonb language sql immutable set search_path='' as $$
 select m.profile || jsonb_build_object('id',m.id,'prefix',m.prefix,'balance',m.balance,'opening',m.opening,'sequence',m.sequence,'version',m.version,'created_at',m.created_at,'last_payment',m.last_payment);
$$;
create function private.commit_operation(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();opid uuid:=(p->>'id')::uuid;k text:=p->>'kind';v jsonb:=p->'payload';m public.merchants;t public.financial_transactions;b jsonb;old public.sync_operations;amt bigint;d bigint;ref text;mid uuid;res jsonb:='{}';stamp timestamptz;
begin
if uid is null or not exists(select 1 from public.owner_profiles where id=uid) then raise exception 'OWNER_ONLY';end if;
perform pg_advisory_xact_lock(hashtextextended(opid::text,0));
select * into old from public.sync_operations where id=opid;
if found then if old.owner_id<>uid or old.request<>p then raise exception 'IDEMPOTENCY_MISMATCH';end if;return old.result;end if;
if k in ('merchant','edit_merchant') then
if length(trim(v->>'name')) not between 1 and 150 or coalesce(v->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' or coalesce(v->>'language','') not in ('en','ar') then raise exception 'INVALID_MERCHANT';end if;
if coalesce(v->>'prefix','') !~ '^[A-Z0-9]{1,12}$' then raise exception 'INVALID_PREFIX';end if;
if exists(select 1 from public.merchants where prefix=v->>'prefix' and id<>(v->>'id')::uuid) then raise exception 'PREFIX_IN_USE';end if;
mid:=(v->>'id')::uuid;
if k='merchant' then
amt:=(v->>'opening')::bigint;if amt is null or abs(amt)>999999999999 then raise exception 'INVALID_AMOUNT';end if;
insert into public.merchants(id,owner_id,profile,prefix,balance,opening) values(mid,uid,v-'balance'-'sequence'-'version',v->>'prefix',amt,amt) returning * into m;
insert into public.financial_transactions(id,merchant_id,owner_id,kind,amount,delta,previous,balance,method,note,occurred_at,reference) values(opid,mid,uid,'opening',0,amt,0,amt,'adjustment','Opening balance',now(),m.prefix||' OPEN');
else
select * into strict m from public.merchants where id=mid and owner_id=uid for update;
if (p->>'expected')::bigint is distinct from m.version then raise exception 'BALANCE_CONFLICT';end if;
update public.merchants set profile=v-'balance'-'opening'-'sequence'-'version',prefix=v->>'prefix',version=version+1 where id=mid returning * into m;
end if;res:=private.merchant_json(m);
elsif k='entry' then
mid:=(v->>'merchant_id')::uuid;select * into strict m from public.merchants where id=mid and owner_id=uid for update;
if (p->>'expected')::bigint is distinct from m.balance then raise exception 'BALANCE_CONFLICT';end if;
stamp:=(v->>'occurred_at')::timestamptz;if stamp is null or stamp>now()+interval '5 minutes' then raise exception 'INVALID_DATE';end if;
amt:=(v->>'amount')::bigint;
if v->>'kind'='payment' then if amt is null or amt<=0 or amt>999999999999 then raise exception 'INVALID_AMOUNT';end if;d:=-amt;
elsif v->>'kind'='adjustment' then amt:=0;d:=(v->>'delta')::bigint;if d is null or d=0 or abs(d)>999999999999 then raise exception 'INVALID_AMOUNT';end if;
elsif v->>'kind'='reversal' then
select * into strict t from public.financial_transactions where id=(v->>'reverses')::uuid and merchant_id=mid and owner_id=uid and kind in ('payment','adjustment');
d:=-t.delta;amt:=t.amount;v:=v||jsonb_build_object('method',t.method);if exists(select 1 from public.financial_transactions where reverses=t.id) then raise exception 'ALREADY_REVERSED';end if;
else raise exception 'INVALID_ENTRY';end if;
if m.balance+d<0 and coalesce((v->>'allow_credit')::boolean,false)=false then raise exception 'OVERPAYMENT';end if;
ref:=m.prefix||' '||lpad((m.sequence+1)::text,greatest(3,length((m.sequence+1)::text)),'0');
insert into public.financial_transactions(id,merchant_id,owner_id,kind,amount,delta,previous,balance,method,note,occurred_at,reference,reverses)
values(opid,mid,uid,v->>'kind',amt,d,m.balance,m.balance+d,coalesce(v->>'method','cash'),left(coalesce(v->>'note',''),1000),stamp,ref,(v->>'reverses')::uuid) returning * into t;
select body into b from public.business_profiles where owner_id=uid;if b is null then raise exception 'SETUP_REQUIRED';end if;
insert into public.receipts(id,transaction_id,merchant_id,owner_id,reference,snapshot) values(opid,opid,mid,uid,ref,jsonb_build_object('business',b,'merchant',private.merchant_json(m),'entry',to_jsonb(t)));
update public.merchants set balance=t.balance,sequence=sequence+1,version=version+1,last_payment=case when t.kind='payment' then greatest(last_payment,stamp) else last_payment end where id=mid;
res:=to_jsonb(t);
elsif k='business' then
if length(trim(v->>'name')) not between 1 and 150 or octet_length(coalesce(v->>'logo',''))>1000000 then raise exception 'INVALID_PROFILE';end if;
insert into public.business_profiles(owner_id,body) values(uid,v) on conflict(owner_id) do update set body=excluded.body,version=public.business_profiles.version+1;
res:=v;
elsif k='share' then
if not exists(select 1 from public.receipts where id=(v->>'id')::uuid and owner_id=uid) then raise exception 'RECEIPT_NOT_FOUND';end if;
insert into public.receipt_shares(id,receipt_id,owner_id,status) values(opid,(v->>'id')::uuid,uid,v->>'status');res:=v;
else raise exception 'INVALID_OPERATION';end if;
insert into public.sync_operations values(opid,uid,p,res,now());
insert into public.audit_logs(owner_id,operation_id,action,body) values(uid,opid,k,jsonb_build_object('entity',coalesce(v->>'id',v->>'merchant_id'),'result',res));
return res;
end;$$;
revoke all on function private.commit_operation(jsonb) from public,anon,authenticated;
grant execute on function private.commit_operation(jsonb) to authenticated;
create function public.commit_operation(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.commit_operation(p);$$;
revoke all on function public.commit_operation(jsonb) from public,anon,authenticated;
grant execute on function public.commit_operation(jsonb) to authenticated;
grant execute on function private.merchant_json(public.merchants) to authenticated;
create function public.get_snapshot() returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object(
'owner',auth.uid(),'business',(select body from public.business_profiles where owner_id=auth.uid()),
'merchants',coalesce((select jsonb_agg(private.merchant_json(m) order by m.created_at,m.id) from public.merchants m),'[]'),
'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from public.financial_transactions t),'[]'),
'receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('status',coalesce((select status from public.receipt_shares s where s.receipt_id=r.id order by s.created_at desc,s.id desc limit 1),'generated')) order by r.created_at,r.id) from public.receipts r),'[]'));
$$;
revoke all on function public.get_snapshot() from public,anon,authenticated;
grant execute on function public.get_snapshot() to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('receipts','receipts',false,10485760,array['application/pdf']) on conflict(id) do nothing;
create policy owner_receipt_download on storage.objects for select to authenticated using(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.owner_profiles where id=(select auth.uid())));
create policy owner_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.receipts where owner_id=(select auth.uid()) and id::text=split_part(storage.filename(name),'.',1)));
commit;
