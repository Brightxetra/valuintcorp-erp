-- Lock down high-impact SECURITY DEFINER RPCs so they can only be executed
-- through the server API with a service-role key. The wrappers preserve the
-- existing ERP posting logic while forwarding the real signed-in user to
-- auth.uid() for role checks, created_by fields, and activity logs.

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to service_role;

create or replace function app_private.apply_request_actor(actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = app_private, public
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
  );
  existing_claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'actorUserId is required for service-role ERP RPC calls.';
  end if;

  if jwt_role is distinct from 'service_role' then
    raise exception 'service_role is required for service-role ERP RPC calls.';
  end if;

  perform set_config('request.jwt.claim.sub', actor_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_set(existing_claims, '{sub}', to_jsonb(actor_user_id::text), true)::text,
    true
  );
end;
$$;

revoke execute on function app_private.apply_request_actor(uuid) from public, anon, authenticated;
grant execute on function app_private.apply_request_actor(uuid) to service_role;

alter function public.apply_industry_template(jsonb) rename to apply_industry_template_internal;
alter function public.post_daily_summary(jsonb) rename to post_daily_summary_internal;
alter function public.post_fixed_asset(jsonb) rename to post_fixed_asset_internal;
alter function public.post_fixed_asset_depreciation_run(jsonb) rename to post_fixed_asset_depreciation_run_internal;
alter function public.post_fixed_asset_disposal(jsonb) rename to post_fixed_asset_disposal_internal;
alter function public.post_payment(jsonb) rename to post_payment_internal;
alter function public.post_purchase_bill(jsonb) rename to post_purchase_bill_internal;
alter function public.post_sales_invoice(jsonb) rename to post_sales_invoice_internal;
alter function public.post_stock_adjustment(jsonb) rename to post_stock_adjustment_internal;
alter function public.post_stock_transfer(jsonb) rename to post_stock_transfer_internal;
alter function public.reverse_fixed_asset_document(jsonb) rename to reverse_fixed_asset_document_internal;
alter function public.rollback_daily_summary(jsonb) rename to rollback_daily_summary_internal;
alter function public.run_payroll(jsonb) rename to run_payroll_internal;
alter function public.set_report_period_lock(jsonb) rename to set_report_period_lock_internal;
alter function public.summarize_raw_import_batch(jsonb) rename to summarize_raw_import_batch_internal;
alter function public.update_fixed_asset(jsonb) rename to update_fixed_asset_internal;
alter function public.upload_raw_transactions(jsonb) rename to upload_raw_transactions_internal;
alter function public.validate_raw_import_batch(jsonb) rename to validate_raw_import_batch_internal;
alter function public.void_document(jsonb) rename to void_document_internal;

create or replace function public.apply_industry_template(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.apply_industry_template_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_daily_summary(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_daily_summary_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_fixed_asset(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_fixed_asset_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_fixed_asset_depreciation_run(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_fixed_asset_depreciation_run_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_fixed_asset_disposal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_fixed_asset_disposal_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_payment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_payment_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_purchase_bill(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_purchase_bill_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_sales_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_sales_invoice_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_stock_adjustment(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_stock_adjustment_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.post_stock_transfer(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.post_stock_transfer_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.reverse_fixed_asset_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.reverse_fixed_asset_document_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.rollback_daily_summary(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.rollback_daily_summary_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.run_payroll(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.run_payroll_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.set_report_period_lock(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.set_report_period_lock_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.summarize_raw_import_batch(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.summarize_raw_import_batch_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.update_fixed_asset(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.update_fixed_asset_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.upload_raw_transactions(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.upload_raw_transactions_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.validate_raw_import_batch(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.validate_raw_import_batch_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.void_document(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(nullif(payload->>'actorUserId', '')::uuid);
  return public.void_document_internal(payload - 'actorUserId');
end;
$$;

create or replace function public.create_business_with_owner_for_actor(
  legal_name text,
  display_name text,
  industry text,
  owner_name text,
  tax_id text default null,
  actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  perform app_private.apply_request_actor(actor_user_id);
  return public.create_business_with_owner(legal_name, display_name, industry, owner_name, tax_id);
end;
$$;

revoke execute on function public.apply_industry_template(jsonb) from public, anon, authenticated;
revoke execute on function public.create_business_with_owner(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_business_with_owner_for_actor(text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.post_daily_summary(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset_depreciation_run(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset_disposal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_payment(jsonb) from public, anon, authenticated;
revoke execute on function public.post_purchase_bill(jsonb) from public, anon, authenticated;
revoke execute on function public.post_sales_invoice(jsonb) from public, anon, authenticated;
revoke execute on function public.post_stock_adjustment(jsonb) from public, anon, authenticated;
revoke execute on function public.post_stock_transfer(jsonb) from public, anon, authenticated;
revoke execute on function public.reverse_fixed_asset_document(jsonb) from public, anon, authenticated;
revoke execute on function public.rollback_daily_summary(jsonb) from public, anon, authenticated;
revoke execute on function public.run_payroll(jsonb) from public, anon, authenticated;
revoke execute on function public.set_report_period_lock(jsonb) from public, anon, authenticated;
revoke execute on function public.summarize_raw_import_batch(jsonb) from public, anon, authenticated;
revoke execute on function public.update_fixed_asset(jsonb) from public, anon, authenticated;
revoke execute on function public.upload_raw_transactions(jsonb) from public, anon, authenticated;
revoke execute on function public.validate_raw_import_batch(jsonb) from public, anon, authenticated;
revoke execute on function public.void_document(jsonb) from public, anon, authenticated;

grant execute on function public.apply_industry_template(jsonb) to service_role;
grant execute on function public.create_business_with_owner(text, text, text, text, text) to service_role;
grant execute on function public.create_business_with_owner_for_actor(text, text, text, text, text, uuid) to service_role;
grant execute on function public.post_daily_summary(jsonb) to service_role;
grant execute on function public.post_fixed_asset(jsonb) to service_role;
grant execute on function public.post_fixed_asset_depreciation_run(jsonb) to service_role;
grant execute on function public.post_fixed_asset_disposal(jsonb) to service_role;
grant execute on function public.post_payment(jsonb) to service_role;
grant execute on function public.post_purchase_bill(jsonb) to service_role;
grant execute on function public.post_sales_invoice(jsonb) to service_role;
grant execute on function public.post_stock_adjustment(jsonb) to service_role;
grant execute on function public.post_stock_transfer(jsonb) to service_role;
grant execute on function public.reverse_fixed_asset_document(jsonb) to service_role;
grant execute on function public.rollback_daily_summary(jsonb) to service_role;
grant execute on function public.run_payroll(jsonb) to service_role;
grant execute on function public.set_report_period_lock(jsonb) to service_role;
grant execute on function public.summarize_raw_import_batch(jsonb) to service_role;
grant execute on function public.update_fixed_asset(jsonb) to service_role;
grant execute on function public.upload_raw_transactions(jsonb) to service_role;
grant execute on function public.validate_raw_import_batch(jsonb) to service_role;
grant execute on function public.void_document(jsonb) to service_role;

revoke execute on function public.apply_industry_template_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_daily_summary_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset_depreciation_run_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_fixed_asset_disposal_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_payment_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_purchase_bill_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_sales_invoice_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_stock_adjustment_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.post_stock_transfer_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.reverse_fixed_asset_document_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.rollback_daily_summary_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.run_payroll_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.set_report_period_lock_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.summarize_raw_import_batch_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.update_fixed_asset_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.upload_raw_transactions_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.validate_raw_import_batch_internal(jsonb) from public, anon, authenticated;
revoke execute on function public.void_document_internal(jsonb) from public, anon, authenticated;

grant execute on function public.apply_industry_template_internal(jsonb) to service_role;
grant execute on function public.post_daily_summary_internal(jsonb) to service_role;
grant execute on function public.post_fixed_asset_internal(jsonb) to service_role;
grant execute on function public.post_fixed_asset_depreciation_run_internal(jsonb) to service_role;
grant execute on function public.post_fixed_asset_disposal_internal(jsonb) to service_role;
grant execute on function public.post_payment_internal(jsonb) to service_role;
grant execute on function public.post_purchase_bill_internal(jsonb) to service_role;
grant execute on function public.post_sales_invoice_internal(jsonb) to service_role;
grant execute on function public.post_stock_adjustment_internal(jsonb) to service_role;
grant execute on function public.post_stock_transfer_internal(jsonb) to service_role;
grant execute on function public.reverse_fixed_asset_document_internal(jsonb) to service_role;
grant execute on function public.rollback_daily_summary_internal(jsonb) to service_role;
grant execute on function public.run_payroll_internal(jsonb) to service_role;
grant execute on function public.set_report_period_lock_internal(jsonb) to service_role;
grant execute on function public.summarize_raw_import_batch_internal(jsonb) to service_role;
grant execute on function public.update_fixed_asset_internal(jsonb) to service_role;
grant execute on function public.upload_raw_transactions_internal(jsonb) to service_role;
grant execute on function public.validate_raw_import_batch_internal(jsonb) to service_role;
grant execute on function public.void_document_internal(jsonb) to service_role;
