-- Apply after the sender function and its protected Firebase credential are ready.
-- Store the dedicated PAYMENT_DISPATCH_SECRET in Vault under mcube-payment-dispatch-secret.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create or replace function private.dispatch_payment_notifications() returns void language plpgsql security definer set search_path='' as $$declare sender_key text;begin
 if not exists(select 1 from private.notification_outbox where delivered_at is null and next_attempt_at<=now() and (processing_at is null or processing_at<now()-interval '3 minutes')) then return;end if;
 select decrypted_secret into sender_key from vault.decrypted_secrets where name='mcube-payment-dispatch-secret' limit 1;
 if sender_key is null then return;end if;
 perform net.http_post(url:='https://zyrsakqocyjvfgauwdiz.supabase.co/functions/v1/payment-notifications',headers:=jsonb_build_object('Authorization','Bearer '||sender_key,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=5000);
end;$$;
revoke all on function private.dispatch_payment_notifications() from public,anon,authenticated;
select cron.schedule('mcube-owner-payment-notifications','* * * * *','select private.dispatch_payment_notifications();');
