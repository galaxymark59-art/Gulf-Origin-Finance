-- Additive Mcube Exporters update. Existing ledger rows and receipt snapshots are preserved.
begin;
create table private.pre_mcube_business_profiles as table public.business_profiles;
create table private.pre_mcube_merchants as table public.merchants;
create table private.pre_mcube_transactions as table public.financial_transactions;
create table private.pre_mcube_receipts as table public.receipts;
revoke all on private.pre_mcube_business_profiles,private.pre_mcube_merchants,private.pre_mcube_transactions,private.pre_mcube_receipts from public,anon,authenticated;
alter table private.pre_mcube_business_profiles enable row level security;
alter table private.pre_mcube_merchants enable row level security;
alter table private.pre_mcube_transactions enable row level security;
alter table private.pre_mcube_receipts enable row level security;

create table public.user_accounts (
 id uuid primary key references auth.users(id), owner_id uuid not null references public.owner_profiles(id),
 name text not null check(length(trim(name)) between 1 and 150), email text not null,
 role text not null check(role in ('owner','collector','viewer')), active boolean not null default true,
 permissions jsonb not null default '{}', last_activity timestamptz, must_change_password boolean not null default false,
 created_at timestamptz not null default now(), unique(owner_id,email)
);
insert into public.user_accounts(id,owner_id,name,email,role)
 select o.id,o.id,coalesce(nullif(u.raw_user_meta_data->>'name',''),'Owner'),u.email,'owner' from public.owner_profiles o join auth.users u on u.id=o.id;
create index user_accounts_business_role on public.user_accounts(owner_id,active,role);
create function private.business_id() returns uuid language sql stable security definer set search_path='' as $$
 select owner_id from public.user_accounts where id=auth.uid() and active;
$$;
create function private.permission(p text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when role='owner' then true
 when role='viewer' and p not in ('view_records','export_reports') then false
 when permissions ? p then (permissions->>p)::boolean
 else p='view_records' or (role='collector' and p in ('record_transactions','export_reports','manage_cash')) end
 from public.user_accounts where id=auth.uid() and active),false);
$$;
revoke all on function private.business_id(),private.permission(text) from public,anon,authenticated;
grant execute on function private.business_id(),private.permission(text) to authenticated;

alter table public.financial_transactions add column created_by uuid references auth.users(id), add column cash_user uuid references auth.users(id), add column document jsonb;
alter table public.receipt_shares add column created_by uuid references auth.users(id);
alter table public.sync_operations add column created_by uuid references auth.users(id);
alter table public.audit_logs add column created_by uuid references auth.users(id);
alter table public.financial_transactions drop constraint financial_transactions_kind_check;
alter table public.financial_transactions add constraint financial_transactions_kind_check check(kind in ('opening','payment','adjustment','reversal','invoice','return'));
create index transaction_actor_date on public.financial_transactions(owner_id,created_by,occurred_at,id);
create unique index invoice_reference_unique on public.financial_transactions(owner_id,merchant_id,lower(trim(document->>'reference'))) where kind='invoice';
create unique index invoice_file_unique on public.financial_transactions(owner_id,(document->>'file_hash')) where kind='invoice' and document->>'file_hash' is not null;
create unique index return_reference_unique on public.financial_transactions(owner_id,merchant_id,lower(trim(document->>'reference'))) where kind='return';
create index merchant_payment_due on public.merchants(owner_id,(profile->>'due_on')) where balance>0;

create table public.cash_accounts(id uuid primary key references auth.users(id), owner_id uuid not null references public.owner_profiles(id),start_on date not null, opening_cash bigint not null check(opening_cash between 0 and 999999999999),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.savings_accounts(owner_id uuid primary key references public.owner_profiles(id),start_on date not null,opening_savings bigint not null check(opening_savings between 0 and 999999999999),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.cash_movements(
 id uuid primary key, owner_id uuid not null references public.owner_profiles(id),created_by uuid not null references auth.users(id),cash_user uuid not null references auth.users(id),
 kind text not null check(kind in ('expense','purchase','other_in','other_out','savings_deposit','savings_withdrawal','transfer_out','transfer_in','reversal')),
 amount bigint not null check(amount between 1 and 999999999999),cash_delta bigint not null,savings_delta bigint not null,expense bigint not null default 0,purchase bigint not null default 0,
 destination text not null default 'cash',reference text not null unique,note text not null default '',occurred_at timestamptz not null,created_at timestamptz not null default now(),
 reverses uuid unique references public.cash_movements(id), transfer_user uuid references auth.users(id)
);
create index cash_movement_business_date on public.cash_movements(owner_id,occurred_at,id);
create index cash_movement_user_date on public.cash_movements(cash_user,occurred_at,id);
create table public.cash_checks(id uuid primary key,owner_id uuid not null references public.owner_profiles(id),created_by uuid not null references auth.users(id),scope_user uuid references auth.users(id),date date not null,counted bigint not null check(counted between 0 and 999999999999),expected bigint not null,difference bigint not null check(difference=counted-expected),note text not null default '',reference text not null unique,created_at timestamptz not null default now());
create index cash_check_business_date on public.cash_checks(owner_id,date,scope_user,created_at);
create table private.document_counters(owner_id uuid primary key references public.owner_profiles(id),sequence bigint not null default 0);
create table public.user_admin_requests(id uuid primary key,owner_id uuid not null references public.owner_profiles(id),created_by uuid not null references auth.users(id),request jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table private.document_counters enable row level security;
alter table public.user_accounts enable row level security;
alter table public.cash_accounts enable row level security;
alter table public.savings_accounts enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_checks enable row level security;
alter table public.user_admin_requests enable row level security;

do $$declare t text;begin
 foreach t in array array['business_profiles','merchants','financial_transactions','receipts','receipt_shares','sync_operations','audit_logs'] loop
 execute format('drop policy owner_read on public.%I',t);
 execute format('create policy team_read on public.%I for select to authenticated using (owner_id=(select private.business_id()) and (select private.permission(''view_records'')))',t);
 end loop;
 foreach t in array array['user_accounts','cash_accounts','savings_accounts','cash_movements','cash_checks','user_admin_requests'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t in ('user_accounts','user_admin_requests') then
 execute format('create policy team_read on public.%I for select to authenticated using (owner_id=(select private.business_id()) and (select private.permission(''manage_users'')))',t);
 else
 execute format('create policy team_read on public.%I for select to authenticated using (owner_id=(select private.business_id()) and (select private.permission(''view_records'')))',t);
 execute format('create trigger immutable_record before update or delete on public.%I for each row execute function private.immutable()',t);
 end if;
 end loop;
end$$;
-- A member can always read their own permissions. Other member names are supplied by the snapshot.
create policy self_read on public.user_accounts for select to authenticated using(id=(select auth.uid()));
create trigger immutable_user_admin_requests before update or delete on public.user_admin_requests for each row execute function private.immutable();

create function private.next_reference(oid uuid,prefix text) returns text language plpgsql set search_path='' as $$
declare n bigint;begin
 insert into private.document_counters(owner_id,sequence) values(oid,1) on conflict(owner_id) do update set sequence=private.document_counters.sequence+1 returning sequence into n;
 return prefix||' '||lpad(n::text,greatest(6,length(n::text)),'0');end;$$;

create function private.cash_total(oid uuid,d date,scope uuid default null) returns bigint language sql security invoker set search_path='' as $$
 select coalesce((select sum(opening_cash) from public.cash_accounts a where a.owner_id=oid and a.start_on<=d and (scope is null or a.id=scope)),0)
 +coalesce((select sum(case when t.kind='payment' then t.amount when t.kind='reversal' then -t.amount else 0 end)
 from public.financial_transactions t join public.cash_accounts a on a.id=coalesce(t.cash_user,t.created_by,t.owner_id)
 where t.owner_id=oid and t.method='cash' and t.kind in ('payment','reversal') and (t.occurred_at at time zone 'Asia/Riyadh')::date between a.start_on and d and (scope is null or a.id=scope)),0)
 +coalesce((select sum(m.cash_delta) from public.cash_movements m join public.cash_accounts a on a.id=m.cash_user
 where m.owner_id=oid and (m.occurred_at at time zone 'Asia/Riyadh')::date between a.start_on and d and (scope is null or m.cash_user=scope)),0);
$$;
create function private.savings_total(oid uuid,d date) returns bigint language sql security invoker set search_path='' as $$
 select coalesce((select opening_savings from public.savings_accounts where owner_id=oid and start_on<=d),0)
 +coalesce((select sum(m.savings_delta) from public.cash_movements m join public.savings_accounts a on a.owner_id=m.owner_id
 where m.owner_id=oid and (m.occurred_at at time zone 'Asia/Riyadh')::date between a.start_on and d),0);
$$;
revoke all on function private.next_reference(uuid,text),private.cash_total(uuid,date,uuid),private.savings_total(uuid,date) from public,anon,authenticated;

create or replace function private.commit_operation(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 uid uuid:=auth.uid();oid uuid:=private.business_id();opid uuid:=(p->>'id')::uuid;k text:=p->>'kind';v jsonb:=p->'payload';
 m public.merchants;t public.financial_transactions;cm public.cash_movements;original public.cash_movements;b jsonb;old public.sync_operations;
 amt bigint;d bigint;ref text;mid uuid;res jsonb:='{}';stamp timestamptz;doc jsonb;line jsonb;total bigint:=0;line_total bigint;history jsonb;
 cash_d bigint:=0;save_d bigint:=0;exp bigint:=0;pur bigint:=0;cash_uid uuid;dest text;kind text;check_date date;scope uuid;
begin
 if oid is null then raise exception 'ACCOUNT_DISABLED';end if;
 if not private.permission('view_records') then raise exception 'PERMISSION_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended(opid::text,0));
 select * into old from public.sync_operations where id=opid;
 if found then if old.owner_id<>oid or coalesce(old.created_by,old.owner_id)<>uid or old.request<>p then raise exception 'IDEMPOTENCY_MISMATCH';end if;return old.result;end if;
 if k='business' then
  if not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
 elsif k in ('cash_account','savings_account','cash_entry','cash_check') then
  if not private.permission('manage_cash') then raise exception 'PERMISSION_DENIED';end if;
 else
  if not private.permission('record_transactions') then raise exception 'PERMISSION_DENIED';end if;
 end if;
 if k in ('merchant','edit_merchant') then
  if length(trim(v->>'name')) not between 1 and 150 or coalesce(v->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' or coalesce(v->>'language','') not in ('en','ar') then raise exception 'INVALID_MERCHANT';end if;
  if coalesce(v->>'prefix','') !~ '^[A-Z0-9]{1,12}$' then raise exception 'INVALID_PREFIX';end if;
  if nullif(v->>'due_on','') is not null then perform (v->>'due_on')::date;end if;
  mid:=(v->>'id')::uuid;
  if exists(select 1 from public.merchants where prefix=v->>'prefix' and id<>mid) then raise exception 'PREFIX_IN_USE';end if;
  if k='merchant' then
   amt:=(v->>'opening')::bigint;if amt is null or abs(amt)>999999999999 then raise exception 'INVALID_AMOUNT';end if;
   insert into public.merchants(id,owner_id,profile,prefix,balance,opening) values(mid,oid,v-'balance'-'sequence'-'version',v->>'prefix',amt,amt) returning * into m;
   insert into public.financial_transactions(id,merchant_id,owner_id,created_by,kind,amount,delta,previous,balance,method,note,occurred_at,reference) values(opid,mid,oid,uid,'opening',0,amt,0,amt,'adjustment','Opening balance',now(),m.prefix||' OPEN');
  else
   select * into strict m from public.merchants where id=mid and owner_id=oid for update;
   if (p->>'expected')::bigint is distinct from m.version then raise exception 'BALANCE_CONFLICT';end if;
   update public.merchants set profile=v-'balance'-'opening'-'sequence'-'version',prefix=v->>'prefix',version=version+1 where id=mid returning * into m;
  end if;res:=private.merchant_json(m);
 elsif k='entry' then
  mid:=(v->>'merchant_id')::uuid;select * into strict m from public.merchants where id=mid and owner_id=oid for update;
  if (p->>'expected')::bigint is distinct from m.balance then raise exception 'BALANCE_CONFLICT';end if;
  stamp:=(v->>'occurred_at')::timestamptz;if stamp is null or stamp>now()+interval '5 minutes' then raise exception 'INVALID_DATE';end if;
  amt:=(v->>'amount')::bigint;kind:=v->>'kind';doc:=v->'document';cash_uid:=uid;
  if kind='payment' then
   if amt is null or amt<=0 or amt>999999999999 or coalesce(v->>'method','') not in ('cash','bank','card','other') then raise exception 'INVALID_AMOUNT';end if;d:=-amt;
  elsif kind='adjustment' then
   amt:=0;d:=(v->>'delta')::bigint;if d is null or d=0 or abs(d)>999999999999 then raise exception 'INVALID_AMOUNT';end if;
   v:=v||jsonb_build_object('method','adjustment');
  elsif kind in ('invoice','return') then
   if doc is null or length(trim(doc->>'reference')) not between 1 and 100 or jsonb_typeof(doc->'lines')<>'array' or jsonb_array_length(doc->'lines') not between 1 and 500 then raise exception 'INVALID_DOCUMENT';end if;
   if (doc->>'date')::date is distinct from (stamp at time zone 'Asia/Riyadh')::date then raise exception 'INVALID_DATE';end if;
   for line in select value from jsonb_array_elements(doc->'lines') loop
    if length(trim(coalesce(line->>'description',''))) not between 1 and 300 or coalesce((line->>'quantity')::bigint,0) not between 1 and 999999999 or coalesce((line->>'unit_price')::bigint,-1) not between 0 and 999999999999 then raise exception 'INVALID_ITEMS';end if;
    line_total:=floor(((line->>'quantity')::numeric*(line->>'unit_price')::numeric+500)/1000)::bigint;
    if line_total is distinct from (line->>'total')::bigint then raise exception 'INVALID_ITEMS';end if;total:=total+line_total;
   end loop;
   if total not between 1 and 999999999999 or amt is distinct from total then raise exception 'INVALID_AMOUNT';end if;
   if kind='invoice' then
    if exists(select 1 from public.financial_transactions where owner_id=oid and kind='invoice' and ((merchant_id=mid and lower(trim(document->>'reference'))=lower(trim(doc->>'reference'))) or (doc->>'file_hash' is not null and document->>'file_hash'=doc->>'file_hash'))) then raise exception 'DUPLICATE_INVOICE';end if;
    if nullif(doc->>'original_path','') is not null and ((doc->>'original_path')<>oid::text||'/'||opid::text||'/'||(doc->>'file_hash')||'.pdf' or not exists(select 1 from storage.objects where bucket_id='invoices' and name=(doc->>'original_path'))) then raise exception 'ORIGINAL_PDF_MISSING';end if;
    d:=amt;
   else
    d:=-amt;
    if exists(select 1 from public.financial_transactions where owner_id=oid and merchant_id=mid and kind='return' and lower(trim(document->>'reference'))=lower(trim(doc->>'reference'))) then raise exception 'DUPLICATE_RETURN';end if;
    if nullif(doc->>'original_invoice','') is not null then
     select * into strict t from public.financial_transactions where id=(doc->>'original_invoice')::uuid and merchant_id=mid and owner_id=oid and kind='invoice';
     if exists(select 1 from public.financial_transactions where reverses=t.id) or amt+coalesce((select sum(-r.delta) from public.financial_transactions r where r.merchant_id=mid and ((r.kind='return' and r.document->>'original_invoice'=t.id::text) or (r.kind='reversal' and r.document->>'original_invoice'=t.id::text))),0)>t.amount then raise exception 'RETURN_EXCEEDS_INVOICE';end if;
    end if;
   end if;v:=v||jsonb_build_object('method',kind);
  elsif kind='reversal' then
   select * into strict t from public.financial_transactions where id=(v->>'reverses')::uuid and merchant_id=mid and owner_id=oid and kind in ('payment','adjustment','invoice','return');
   if exists(select 1 from public.financial_transactions where reverses=t.id) then raise exception 'ALREADY_REVERSED';end if;
   if t.kind='invoice' and exists(select 1 from public.financial_transactions r where r.kind='return' and r.document->>'original_invoice'=t.id::text and not exists(select 1 from public.financial_transactions x where x.reverses=r.id)) then raise exception 'REVERSE_RETURNS_FIRST';end if;
   d:=-t.delta;amt:=t.amount;doc:=t.document;cash_uid:=coalesce(t.cash_user,t.created_by,t.owner_id);v:=v||jsonb_build_object('method',t.method);
  else raise exception 'INVALID_ENTRY';end if;
  if m.balance+d<0 and coalesce((v->>'allow_credit')::boolean,false)=false then raise exception 'OVERPAYMENT';end if;
  ref:=m.prefix||' '||lpad((m.sequence+1)::text,greatest(3,length((m.sequence+1)::text)),'0');
  insert into public.financial_transactions(id,merchant_id,owner_id,created_by,cash_user,kind,amount,delta,previous,balance,method,note,occurred_at,reference,reverses,document)
   values(opid,mid,oid,uid,case when v->>'method'='cash' then cash_uid else null end,kind,amt,d,m.balance,m.balance+d,coalesce(v->>'method','cash'),left(coalesce(v->>'note',''),1000),stamp,ref,(v->>'reverses')::uuid,doc) returning * into t;
  select body into b from public.business_profiles where owner_id=oid;if b is null then raise exception 'SETUP_REQUIRED';end if;
  if kind='payment' then
   select jsonb_build_object('from',((stamp at time zone 'Asia/Riyadh')::date-15)::text,'to',(stamp at time zone 'Asia/Riyadh')::date::text,
    'opening',coalesce((select sum(h.delta) from public.financial_transactions h where h.merchant_id=mid and (h.occurred_at at time zone 'Asia/Riyadh')::date<(stamp at time zone 'Asia/Riyadh')::date-15),0),
    'entries',coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at,h.created_at,h.id) from public.financial_transactions h where h.merchant_id=mid and (h.occurred_at at time zone 'Asia/Riyadh')::date between (stamp at time zone 'Asia/Riyadh')::date-15 and (stamp at time zone 'Asia/Riyadh')::date),'[]')) into history;
  end if;
  insert into public.receipts(id,transaction_id,merchant_id,owner_id,reference,snapshot) values(opid,opid,mid,oid,ref,jsonb_build_object('business',b,'merchant',private.merchant_json(m),'entry',to_jsonb(t),'history',history));
  update public.merchants set balance=t.balance,sequence=sequence+1,version=version+1,last_payment=case when t.kind='payment' then greatest(last_payment,stamp) else last_payment end where id=mid;
  res:=to_jsonb(t);
 elsif k='business' then
  if length(trim(v->>'name')) not between 1 and 150 or octet_length(coalesce(v->>'logo',''))>1000000 then raise exception 'INVALID_PROFILE';end if;
  insert into public.business_profiles(owner_id,body) values(oid,v) on conflict(owner_id) do update set body=excluded.body,version=public.business_profiles.version+1;res:=v;
 elsif k='share' then
  if not exists(select 1 from public.receipts where id=(v->>'id')::uuid and owner_id=oid) then raise exception 'RECEIPT_NOT_FOUND';end if;
  insert into public.receipt_shares(id,receipt_id,owner_id,status,created_by) values(opid,(v->>'id')::uuid,oid,v->>'status',uid);res:=v;
 elsif k='cash_account' then
  cash_uid:=(v->>'id')::uuid;check_date:=(v->>'start_on')::date;amt:=(v->>'opening_cash')::bigint;
  if cash_uid<>uid and not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
  if not exists(select 1 from public.user_accounts where id=cash_uid and owner_id=oid and active and role<>'viewer') or amt not between 0 and 999999999999 or check_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'INVALID_CASH_SETUP';end if;
  insert into public.cash_accounts(id,owner_id,start_on,opening_cash,created_by) values(cash_uid,oid,check_date,amt,uid);res:=v;
 elsif k='savings_account' then
  if not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
  check_date:=(v->>'start_on')::date;amt:=(v->>'opening_savings')::bigint;
  if amt not between 0 and 999999999999 or check_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'INVALID_CASH_SETUP';end if;
  insert into public.savings_accounts(owner_id,start_on,opening_savings,created_by) values(oid,check_date,amt,uid);res:=v;
 elsif k='cash_entry' then
  stamp:=(v->>'occurred_at')::timestamptz;amt:=(v->>'amount')::bigint;kind:=v->>'kind';dest:=coalesce(v->>'destination','cash');cash_uid:=uid;
  if stamp is null or stamp>now()+interval '5 minutes' then raise exception 'INVALID_DATE';end if;
  if amt is null or amt not between 1 and 999999999999 then raise exception 'INVALID_AMOUNT';end if;
  -- Serialize savings and cash corrections for this business.
  perform pg_advisory_xact_lock(hashtextextended('cash:'||oid::text,0));
  if kind='expense' then cash_d:=-amt;exp:=amt;
  elsif kind='purchase' then cash_d:=-amt;pur:=amt;
  elsif kind='other_in' then cash_d:=amt;
  elsif kind='other_out' then cash_d:=-amt;
  elsif kind='savings_deposit' then cash_d:=-amt;save_d:=amt;
  elsif kind='savings_withdrawal' then
   save_d:=-amt;if dest='cash' then cash_d:=amt;elsif dest='expense' then exp:=amt;elsif dest='purchase' then pur:=amt;elsif dest<>'other' then raise exception 'INVALID_DESTINATION';end if;
  elsif kind='transfer_out' then
   cash_d:=-amt;mid:=(v->>'transfer_user')::uuid;
   if mid=uid or not exists(select 1 from public.cash_accounts a join public.user_accounts u on u.id=a.id where a.id=mid and a.owner_id=oid and u.active and u.role<>'viewer' and a.start_on<=(stamp at time zone 'Asia/Riyadh')::date) then raise exception 'INVALID_DESTINATION';end if;
  elsif kind='reversal' then
   select * into strict original from public.cash_movements where id=(v->>'reverses')::uuid and owner_id=oid and kind not in ('reversal','transfer_in','transfer_out');
   if original.created_by<>uid and not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
   if exists(select 1 from public.cash_movements where reverses=original.id) then raise exception 'ALREADY_REVERSED';end if;
   cash_uid:=original.cash_user;amt:=original.amount;cash_d:=-original.cash_delta;save_d:=-original.savings_delta;exp:=-original.expense;pur:=-original.purchase;dest:=original.destination;
  else raise exception 'INVALID_OPERATION';end if;
  if length(trim(coalesce(v->>'note','')))=0 then raise exception 'NOTE_REQUIRED';end if;
  check_date:=(stamp at time zone 'Asia/Riyadh')::date;
  if cash_d<>0 and not exists(select 1 from public.cash_accounts where id=cash_uid and owner_id=oid and start_on<=check_date) then raise exception 'CASH_SETUP_REQUIRED';end if;
  if save_d<>0 then
   if not exists(select 1 from public.savings_accounts where owner_id=oid and start_on<=check_date) then raise exception 'SAVINGS_SETUP_REQUIRED';end if;
   if private.savings_total(oid,(now() at time zone 'Asia/Riyadh')::date)+save_d<0 or private.savings_total(oid,check_date)+save_d<0 then raise exception 'INSUFFICIENT_SAVINGS';end if;
   if exists(select 1 from (select sum(amount_delta) over(order by entry_day) running from (
     select entry_day,sum(amount_delta) amount_delta from (
       select start_on entry_day,opening_savings amount_delta from public.savings_accounts where owner_id=oid
       union all select (c.occurred_at at time zone 'Asia/Riyadh')::date,c.savings_delta from public.cash_movements c join public.savings_accounts a on a.owner_id=c.owner_id where c.owner_id=oid and (c.occurred_at at time zone 'Asia/Riyadh')::date>=a.start_on
       union all select check_date,save_d
     ) entries group by entry_day
   ) daily) balances where running<0) then raise exception 'INSUFFICIENT_SAVINGS';end if;
  end if;
  if cash_d<0 and (private.cash_total(oid,check_date,cash_uid)+cash_d<0 or private.cash_total(oid,(now() at time zone 'Asia/Riyadh')::date,cash_uid)+cash_d<0) then raise exception 'INSUFFICIENT_CASH';end if;
  ref:=private.next_reference(oid,'CASH');
  insert into public.cash_movements(id,owner_id,created_by,cash_user,kind,amount,cash_delta,savings_delta,expense,purchase,destination,reference,note,occurred_at,reverses,transfer_user)
   values(opid,oid,uid,cash_uid,kind,amt,cash_d,save_d,exp,pur,dest,ref,left(v->>'note',1000),stamp,(v->>'reverses')::uuid,(v->>'transfer_user')::uuid) returning * into cm;
  if kind='transfer_out' then
   insert into public.cash_movements(id,owner_id,created_by,cash_user,kind,amount,cash_delta,savings_delta,destination,reference,note,occurred_at,transfer_user)
    values(gen_random_uuid(),oid,uid,mid,'transfer_in',amt,amt,0,'cash',ref||' IN',left(v->>'note',1000),stamp,uid);
  end if;res:=to_jsonb(cm);
 elsif k='cash_check' then
  check_date:=(v->>'date')::date;scope:=(v->>'scope_user')::uuid;amt:=(v->>'counted')::bigint;
  if (scope is null or scope<>uid) and not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
  if amt is null or amt not between 0 and 999999999999 or check_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'INVALID_AMOUNT';end if;
  if not exists(select 1 from public.cash_accounts where owner_id=oid and start_on<=check_date and (scope is null or id=scope))
   or exists(select 1 from public.financial_transactions t where t.owner_id=oid and t.method='cash' and t.kind in ('payment','reversal') and (scope is null or coalesce(t.cash_user,t.created_by,t.owner_id)=scope) and (t.occurred_at at time zone 'Asia/Riyadh')::date=check_date and not exists(select 1 from public.cash_accounts a where a.id=coalesce(t.cash_user,t.created_by,t.owner_id) and a.start_on<=check_date)) then raise exception 'CASH_SETUP_REQUIRED';end if;
  d:=private.cash_total(oid,check_date,scope);ref:=private.next_reference(oid,'CHECK');
  insert into public.cash_checks(id,owner_id,created_by,scope_user,date,counted,expected,difference,note,reference) values(opid,oid,uid,scope,check_date,amt,d,amt-d,left(coalesce(v->>'note',''),1000),ref) returning to_jsonb(cash_checks.*) into res;
 else raise exception 'INVALID_OPERATION';end if;
 insert into public.sync_operations(id,owner_id,request,result,created_by) values(opid,oid,p,res,uid);
 insert into public.audit_logs(owner_id,created_by,operation_id,action,body) values(oid,uid,opid,k,jsonb_build_object('entity',coalesce(v->>'id',v->>'merchant_id'),'result',res));
 update public.user_accounts set last_activity=now() where id=uid;
 return res;
end;$$;

create function private.touch_activity() returns void language sql security definer set search_path='' as $$update public.user_accounts set last_activity=now() where id=auth.uid() and active and (last_activity is null or last_activity<now()-interval '5 minutes');$$;
revoke all on function private.touch_activity() from public,anon,authenticated;
grant execute on function private.touch_activity() to authenticated;
create or replace function public.get_snapshot() returns jsonb language plpgsql security invoker set search_path='' as $$
declare oid uuid:=private.business_id();result jsonb;begin
 perform private.touch_activity();
 if oid is null then raise exception 'ACCOUNT_DISABLED';end if;
 if not private.permission('view_records') then raise exception 'PERMISSION_DENIED';end if;
 select jsonb_build_object(
 'owner',auth.uid(),'businessOwner',oid,'member',(select to_jsonb(u) from public.user_accounts u where id=auth.uid()),
 'business',(select body from public.business_profiles where owner_id=oid),
 'merchants',coalesce((select jsonb_agg(private.merchant_json(m) order by m.created_at,m.id) from public.merchants m),'[]'),
 'entries',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('created_by',coalesce(t.created_by,t.owner_id)) order by t.created_at,t.id) from public.financial_transactions t),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('status',coalesce((select status from public.receipt_shares s where s.receipt_id=r.id order by s.created_at desc,s.id desc limit 1),'generated')) order by r.created_at,r.id) from public.receipts r),'[]'),
 'members',private.team_names(),
 'cashAccounts',coalesce((select jsonb_agg(to_jsonb(c)) from public.cash_accounts c),'[]'),
 'savingsAccount',(select to_jsonb(c) from public.savings_accounts c),
 'cashMovements',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.cash_movements c),'[]'),
 'cashChecks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id) from public.cash_checks c),'[]')) into result;
 return result;
end;$$;

-- Names and roles are needed in transaction history; only managers receive emails and permissions.
create function private.team_names() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when private.permission('manage_users') then to_jsonb(u) else jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'active',u.active,'owner_id',u.owner_id,'email','','permissions','{}'::jsonb) end order by u.created_at),'[]'::jsonb)
 from public.user_accounts u where u.owner_id=private.business_id() and private.permission('view_records');
$$;
revoke all on function private.team_names() from public,anon,authenticated;
grant execute on function private.team_names() to authenticated;

create function public.admin_user(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();oid uuid:=private.business_id();target uuid:=(p->>'user_id')::uuid;opid uuid:=(p->>'id')::uuid;existing public.user_accounts;req public.user_admin_requests;result jsonb;begin
 if oid is null or not private.permission('manage_users') then raise exception 'PERMISSION_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('users:'||oid::text,0));
 select * into req from public.user_admin_requests where id=opid;
 if found then if req.created_by<>uid or req.request<>p then raise exception 'IDEMPOTENCY_MISMATCH';end if;return req.result;end if;
 select * into existing from public.user_accounts where id=target;
 if found and existing.owner_id<>oid then raise exception 'PERMISSION_DENIED';end if;
 if (existing.role='owner' or p->>'role'='owner') and not private.permission('manage_owners') then raise exception 'PERMISSION_DENIED';end if;
 if existing.role='owner' and existing.active and (p->>'role'<>'owner' or (p->>'active')::boolean=false) and (select count(*) from public.user_accounts where owner_id=oid and active and role='owner')<=1 then raise exception 'LAST_OWNER';end if;
 if p->>'action' in ('create','update') then
  if p->>'role' not in ('owner','collector','viewer') or length(trim(p->>'name')) not between 1 and 150 or (p->>'permissions') is null or jsonb_typeof(p->'permissions')<>'object' then raise exception 'INVALID_USER';end if;
  if not private.permission('manage_owners') and (coalesce((p->'permissions'->>'manage_owners')::boolean,false) or coalesce((p->'permissions'->>'manage_users')::boolean,false)) then raise exception 'PERMISSION_DENIED';end if;
  insert into public.user_accounts(id,owner_id,name,email,role,active,permissions,must_change_password)
   values(target,oid,trim(p->>'name'),lower(trim(p->>'email')),p->>'role',(p->>'active')::boolean,p->'permissions',coalesce((p->>'must_change_password')::boolean,false))
   on conflict(id) do update set name=excluded.name,role=excluded.role,active=excluded.active,permissions=excluded.permissions;
 elsif p->>'action'='reset_access' then
  if existing.id is null then raise exception 'INVALID_USER';end if;
  update public.user_accounts set must_change_password=true where id=target;
 else raise exception 'INVALID_OPERATION';end if;
 select to_jsonb(u) into result from public.user_accounts u where id=target;
 insert into public.user_admin_requests(id,owner_id,created_by,request,result) values(opid,oid,uid,p,result);
 insert into public.audit_logs(owner_id,created_by,operation_id,action,body) values(oid,uid,opid,'manage_user',jsonb_build_object('action',p->>'action','user_id',target,'role',p->>'role','active',p->>'active'));
 return result;
end;$$;
revoke all on function public.admin_user(jsonb) from public,anon,authenticated;
grant execute on function public.admin_user(jsonb) to authenticated;
create function public.password_changed() returns void language sql security definer set search_path='' as $$update public.user_accounts set must_change_password=false where id=auth.uid() and active;$$;
revoke all on function public.password_changed() from public,anon,authenticated;
grant execute on function public.password_changed() to authenticated;

drop policy owner_receipt_download on storage.objects;
drop policy owner_receipt_insert on storage.objects;
create policy team_receipt_download on storage.objects for select to authenticated using(bucket_id='receipts' and (storage.foldername(name))[1]=(select private.business_id())::text and (select private.permission('view_records')));
create policy team_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='receipts' and (storage.foldername(name))[1]=(select private.business_id())::text and (select private.permission('record_transactions')) and exists(select 1 from public.receipts where owner_id=(select private.business_id()) and id::text=split_part(storage.filename(name),'.',1)));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('invoices','invoices',false,10485760,array['application/pdf']) on conflict(id) do nothing;
create policy invoice_download on storage.objects for select to authenticated using(bucket_id='invoices' and (storage.foldername(name))[1]=(select private.business_id())::text and (select private.permission('view_records')));
create policy invoice_insert on storage.objects for insert to authenticated with check(bucket_id='invoices' and (storage.foldername(name))[1]=(select private.business_id())::text and (select private.permission('record_transactions')));

-- Only current business settings are renamed. Previously issued receipt snapshots stay intact.
update public.business_profiles set body=jsonb_set(body,'{name}','"Mcube Exporters"'::jsonb),version=version+1;
-- Current Mcube logo; historical snapshots remain unchanged.
update public.business_profiles set body=jsonb_set(body,'{logo}',to_jsonb('data:image/png;base64,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'::text));
commit;
