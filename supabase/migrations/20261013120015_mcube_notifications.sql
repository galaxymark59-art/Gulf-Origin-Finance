-- Generic owner alerts. Financial data remains in the protected ledger.
begin;
create table public.push_devices(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),token text not null,platform text not null check(platform='android'),active boolean not null default true,last_seen timestamptz not null default now(),unique(owner_id,token));
create table public.notification_events(id uuid primary key default gen_random_uuid(),transaction_id uuid not null unique references public.financial_transactions(id),recipient_id uuid not null references auth.users(id),created_by uuid not null references auth.users(id),title text not null default 'Mcube Exporters',body text not null default 'A payment was recorded. Open the app to view it.',created_at timestamptz not null default now(),seen_at timestamptz);
create index notification_recipient_date on public.notification_events(recipient_id,created_at desc);
create table private.notification_outbox(event_id uuid primary key references public.notification_events(id),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),processing_at timestamptz,delivered_at timestamptz,last_error text);
create table private.notification_deliveries(event_id uuid not null references public.notification_events(id),device_id uuid not null references public.push_devices(id),delivered_at timestamptz not null default now(),primary key(event_id,device_id));
alter table public.push_devices enable row level security;
alter table public.notification_events enable row level security;
alter table private.notification_outbox enable row level security;
alter table private.notification_deliveries enable row level security;
revoke all on public.push_devices,public.notification_events,private.notification_outbox,private.notification_deliveries from public,anon,authenticated;
grant select on public.push_devices,public.notification_events to authenticated;
grant all on public.push_devices,public.notification_events to service_role;
create policy own_devices on public.push_devices for select to authenticated using(owner_id=(select auth.uid()) and (select private.permission('view_records')));
create policy own_notifications on public.notification_events for select to authenticated using(recipient_id=(select auth.uid()) and (select private.permission('view_records')));
create function public.register_push_device(p_token text,p_platform text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or auth.uid()<>private.business_id() or not private.permission('manage_owners') then raise exception 'PERMISSION_DENIED';end if;
 if p_platform<>'android' or length(p_token) not between 20 and 4096 then raise exception 'INVALID_DEVICE';end if;
 insert into public.push_devices(owner_id,token,platform) values(auth.uid(),p_token,p_platform) on conflict(owner_id,token) do update set active=true,last_seen=now();end;$$;
create function public.unregister_push_device(p_token text) returns void language sql security definer set search_path='' as $$update public.push_devices set active=false where owner_id=auth.uid() and token=p_token;$$;
create function public.mark_notifications_read() returns void language sql security definer set search_path='' as $$update public.notification_events set seen_at=now() where recipient_id=auth.uid() and seen_at is null;$$;
revoke all on function public.register_push_device(text,text),public.unregister_push_device(text),public.mark_notifications_read() from public,anon,authenticated;
grant execute on function public.register_push_device(text,text),public.unregister_push_device(text),public.mark_notifications_read() to authenticated;
-- The configured dispatcher replaces this no-op after the protected scheduler is set up.
create function private.dispatch_payment_notifications() returns void language plpgsql security definer set search_path='' as $$begin return;end;$$;
revoke all on function private.dispatch_payment_notifications() from public,anon,authenticated;
create function private.enqueue_payment_notification() returns trigger language plpgsql security definer set search_path='' as $$declare recipient uuid;event_id uuid;begin
 if new.kind<>'payment' then return new;end if;
 select u.id into recipient from public.user_accounts u where u.id=new.owner_id and u.active and u.role='owner';
 if recipient is null then return new;end if;
 insert into public.notification_events(transaction_id,recipient_id,created_by) values(new.id,recipient,coalesce(new.created_by,new.owner_id)) returning id into event_id;
 if exists(select 1 from public.push_devices where owner_id=recipient and active) then
  insert into private.notification_outbox(event_id) values(event_id);
  begin perform private.dispatch_payment_notifications();exception when others then null;end;
 end if;return new;end;$$;
revoke all on function private.enqueue_payment_notification() from public,anon,authenticated;
create trigger payment_owner_notification after insert on public.financial_transactions for each row execute function private.enqueue_payment_notification();
create function public.claim_payment_notifications() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 with chosen as(select o.event_id from private.notification_outbox o join public.notification_events e on e.id=o.event_id join public.user_accounts u on u.id=e.recipient_id where o.delivered_at is null and o.next_attempt_at<=now() and (o.processing_at is null or o.processing_at<now()-interval '3 minutes') and u.active and u.role='owner' order by e.created_at for update of o skip locked limit 5), claimed as(update private.notification_outbox o set processing_at=now(),attempts=attempts+1 from chosen c where o.event_id=c.event_id returning o.event_id)
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('devices',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'token',d.token)) from public.push_devices d where d.owner_id=e.recipient_id and d.active and not exists(select 1 from private.notification_deliveries sent where sent.event_id=e.id and sent.device_id=d.id)),'[]'::jsonb))),'[]'::jsonb) into result from public.notification_events e join claimed c on c.event_id=e.id;return result;end;$$;
create function public.record_push_delivery(p_event uuid,p_device uuid,p_invalid boolean default false) returns void language plpgsql security definer set search_path='' as $$begin
 insert into private.notification_deliveries(event_id,device_id) values(p_event,p_device) on conflict do nothing;
 if p_invalid then update public.push_devices set active=false where id=p_device;end if;end;$$;
create function public.finish_payment_notification(p_event uuid,p_success boolean,p_error text default null) returns void language sql security definer set search_path='' as $$update private.notification_outbox set processing_at=null,delivered_at=case when p_success then now() else null end,last_error=case when p_success then null else left(p_error,200) end,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)) where event_id=p_event;$$;
revoke all on function public.claim_payment_notifications(),public.record_push_delivery(uuid,uuid,boolean),public.finish_payment_notification(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_payment_notifications(),public.record_push_delivery(uuid,uuid,boolean),public.finish_payment_notification(uuid,boolean,text) to service_role;
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.notification_events;end if;end;$$;
commit;
