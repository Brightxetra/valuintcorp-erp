begin;

alter table public.employees
  add column monthly_tax_withholding integer not null default 0
    check (monthly_tax_withholding between 0 and 100000000);

-- HR supplies the reviewed monthly withholding amount. The posting command
-- uses the employee record and stores it in the payroll and its journal.
create or replace function app_private.calculate_employee_payroll(
  target_employee_id uuid,
  target_business_id uuid
)
returns jsonb
language plpgsql
set search_path = pg_catalog
as $$
declare
  employee_record record;
  policy_record record;
  component jsonb;
  component_amount numeric;
  base_salary numeric;
  gross_pay numeric;
  component_deductions numeric := 0;
  bpjs_gross numeric;
  health_base numeric;
  jht_base numeric;
  jpn_base numeric;
  health_employee numeric := 0;
  health_employer numeric := 0;
  jht_employee numeric := 0;
  jht_employer numeric := 0;
  jpn_employee numeric := 0;
  jpn_employer numeric := 0;
  jkk_employer numeric := 0;
  jkm_employer numeric := 0;
  total_employee_bpjs numeric;
  total_employer_bpjs numeric;
  deductions numeric;
  net_pay numeric;
  components jsonb := '[]'::jsonb;
  component_type text;
  component_calculation text;
  participation text;
begin
  select employee.status, employee.contract_type, employee.base_salary,
    employee.compensation_components, employee.bpjs_participation, employee.monthly_tax_withholding
  into employee_record
  from public.employees as employee
  where employee.id = target_employee_id
    and employee.business_id = target_business_id
  for update;

  if not found or employee_record.status = 'inactive' then
    raise exception 'Employee is not active.' using errcode = '22023';
  end if;
  if employee_record.contract_type = 'daily' then
    raise exception 'Ubah kontrak harian lama ke gaji bulanan sebelum memproses payroll.' using errcode = '22023';
  end if;

  base_salary := greatest(coalesce(employee_record.base_salary, 0), 0);
  gross_pay := base_salary;
  components := jsonb_build_array(jsonb_build_object(
    'name', 'Gaji pokok',
    'amount', base_salary,
    'type', 'earning',
    'calculation', 'fixed'
  ));

  for component in
    select value from jsonb_array_elements(coalesce(employee_record.compensation_components, '[]'::jsonb))
  loop
    component_type := component->>'type';
    component_calculation := coalesce(component->>'calculation', 'fixed');

    if component_type is null or component_type not in ('earning', 'deduction') then
      raise exception 'Employee compensation component has an invalid type.' using errcode = '22023';
    end if;

    if component_calculation not in ('fixed', 'percentage') then
      raise exception 'Employee compensation component has an invalid calculation.' using errcode = '22023';
    end if;

    if coalesce(nullif(btrim(component->>'name'), ''), '') = '' then
      raise exception 'Employee compensation component requires a name.' using errcode = '22023';
    end if;

    if nullif(component->>'amount', '') is null
      or (component->>'amount')::numeric < 0
      or (component->>'amount')::numeric > 100000000
      or (component_calculation = 'percentage' and (component->>'amount')::numeric > 100)
    then
      raise exception 'Employee compensation component has an invalid amount.' using errcode = '22023';
    end if;

    component_amount := case
      when component_calculation = 'percentage'
        then round(base_salary * (component->>'amount')::numeric / 100)
      else round((component->>'amount')::numeric, 2)
    end;

    if component_type = 'earning' then
      gross_pay := gross_pay + component_amount;
    else
      component_deductions := component_deductions + component_amount;
    end if;

    components := components || jsonb_build_array(jsonb_build_object(
      'id', component->>'id',
      'name', component->>'name',
      'amount', component_amount,
      'type', component_type,
      'calculation', component_calculation
    ));
  end loop;

  select
    coalesce(policy.gross_salary_multiplier, 1.1) as gross_salary_multiplier,
    coalesce(policy.health_employee_rate, 0.01) as health_employee_rate,
    coalesce(policy.health_employer_rate, 0.04) as health_employer_rate,
    coalesce(policy.health_salary_cap, 12000000) as health_salary_cap,
    coalesce(policy.jht_employee_rate, 0.037) as jht_employee_rate,
    coalesce(policy.jht_employer_rate, 0.037) as jht_employer_rate,
    coalesce(policy.jht_salary_cap, 1466800) as jht_salary_cap,
    coalesce(policy.jpn_employee_rate, 0.02) as jpn_employee_rate,
    coalesce(policy.jpn_employer_rate, 0.02) as jpn_employer_rate,
    coalesce(policy.jpn_salary_cap, 1466800) as jpn_salary_cap,
    coalesce(policy.jkk_employer_rate, 0.0054) as jkk_employer_rate,
    coalesce(policy.jkm_employer_rate, 0.003) as jkm_employer_rate
  into policy_record
  from public.businesses
  left join public.bpjs_policies policy on policy.business_id = businesses.id
  where businesses.id = target_business_id;

  participation := coalesce(employee_record.bpjs_participation, 'both');
  bpjs_gross := round(base_salary * policy_record.gross_salary_multiplier);
  health_base := least(bpjs_gross, policy_record.health_salary_cap);
  jht_base := least(bpjs_gross, policy_record.jht_salary_cap);
  jpn_base := least(bpjs_gross, policy_record.jpn_salary_cap);

  if participation in ('health', 'both') then
    health_employee := round(health_base * policy_record.health_employee_rate);
    health_employer := round(health_base * policy_record.health_employer_rate);
  end if;

  if participation in ('employment', 'both') then
    jht_employee := round(jht_base * policy_record.jht_employee_rate);
    jht_employer := round(jht_base * policy_record.jht_employer_rate);
    jpn_employee := round(jpn_base * policy_record.jpn_employee_rate);
    jpn_employer := round(jpn_base * policy_record.jpn_employer_rate);
    jkk_employer := round(bpjs_gross * policy_record.jkk_employer_rate);
    jkm_employer := round(bpjs_gross * policy_record.jkm_employer_rate);
  end if;

  total_employee_bpjs := health_employee + jht_employee + jpn_employee;
  total_employer_bpjs := health_employer + jht_employer + jpn_employer + jkk_employer + jkm_employer;
  deductions := component_deductions + total_employee_bpjs;
  net_pay := gross_pay - deductions - employee_record.monthly_tax_withholding;

  if gross_pay <= 0 then
    raise exception 'Gaji kotor harus lebih dari nol.' using errcode = '22023';
  end if;
  if net_pay < 0 then
    raise exception 'Total payroll deductions cannot exceed gross pay.' using errcode = '22023';
  end if;

  if health_employee > 0 then
    components := components || jsonb_build_array(jsonb_build_object('id', 'bpjs-health', 'name', 'BPJS Kesehatan karyawan', 'amount', health_employee, 'type', 'deduction', 'calculation', 'fixed'));
  end if;
  if jht_employee > 0 then
    components := components || jsonb_build_array(jsonb_build_object('id', 'bpjs-jht', 'name', 'BPJS JHT karyawan', 'amount', jht_employee, 'type', 'deduction', 'calculation', 'fixed'));
  end if;
  if jpn_employee > 0 then
    components := components || jsonb_build_array(jsonb_build_object('id', 'bpjs-jpn', 'name', 'BPJS JP karyawan', 'amount', jpn_employee, 'type', 'deduction', 'calculation', 'fixed'));
  end if;
  if total_employer_bpjs > 0 then
    components := components || jsonb_build_array(jsonb_build_object('name', 'BPJS perusahaan', 'amount', total_employer_bpjs, 'type', 'employer_contribution', 'calculation', 'fixed'));
  end if;

  if employee_record.monthly_tax_withholding > 0 then
    components := components || jsonb_build_array(jsonb_build_object(
      'id', 'payroll-tax', 'name', 'Potongan PPh 21', 'amount', employee_record.monthly_tax_withholding,
      'type', 'deduction', 'calculation', 'fixed'
    ));
  end if;

  return jsonb_build_object(
    'grossPay', gross_pay,
    'deductions', deductions,
    'taxWithheld', employee_record.monthly_tax_withholding,
    'netPay', net_pay,
    'employeeBpjs', total_employee_bpjs,
    'employerBpjs', total_employer_bpjs,
    'components', components
  );
end;
$$;

revoke all on function app_private.calculate_employee_payroll(uuid, uuid) from public, anon, authenticated, service_role;
revoke insert, update, delete on public.payroll_runs from public, anon, authenticated;

create or replace function public.run_payroll_batch_internal(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_business_id uuid := nullif(payload->>'businessId', '')::uuid;
  payroll_date date := nullif(payload->>'date', '')::date;
  employee_ids jsonb := payload->'employeeIds';
  selected_employee_id uuid;
  employee_record record;
  calculation jsonb;
  gross_pay numeric;
  deductions numeric;
  tax_withheld numeric;
  net_pay numeric;
  employer_bpjs numeric;
  employee_bpjs numeric;
  other_deductions numeric;
  journal_lines jsonb;
  journal_id uuid;
  payroll_id uuid;
  posting_role text;
  posted_ids jsonb := '[]'::jsonb;
  requested_count integer;
  unique_count integer;
  posted_count integer := 0;
begin
  if target_business_id is null or payroll_date is null or employee_ids is null then
    raise exception 'Business, date, and at least one employee are required.' using errcode = '22023';
  end if;

  if jsonb_typeof(employee_ids) is distinct from 'array' then
    raise exception 'Employee ids must be an array.' using errcode = '22023';
  end if;

  if to_char(payroll_date, 'YYYY-MM-DD') <> payload->>'date' then
    raise exception 'Payroll date is not a valid calendar date.' using errcode = '22023';
  end if;

  requested_count := jsonb_array_length(employee_ids);
  if requested_count = 0 then
    raise exception 'At least one employee is required.' using errcode = '22023';
  end if;

  if requested_count > 100 then
    raise exception 'A payroll batch cannot exceed 100 employees.' using errcode = '22023';
  end if;

  select count(distinct value) into unique_count
  from jsonb_array_elements_text(employee_ids) as requested(value);
  if unique_count <> requested_count then
    raise exception 'Employee ids must be unique.' using errcode = '22023';
  end if;

  if not app_private.member_has_permission(target_business_id, 'payroll:run') then
    raise exception 'Effective payroll permission is required.' using errcode = '42501';
  end if;
  posting_role := app_private.member_role(target_business_id);
  perform pg_advisory_xact_lock(hashtextextended(target_business_id::text || ':' || to_char(payroll_date, 'YYYY-MM'), 0));

  if public.is_period_locked(target_business_id, payroll_date) then
    raise exception 'Period is locked. Use a correction or reversal entry.';
  end if;

  for selected_employee_id in select value::uuid from jsonb_array_elements_text(employee_ids) order by value loop
    if exists (
      select 1 from public.payroll_runs
      where business_id = target_business_id
        and payroll_runs.employee_id = selected_employee_id
        and period = to_char(payroll_date, 'YYYY-MM')
    ) then
      raise exception 'Payroll for employee % already exists for this period.', selected_employee_id using errcode = '23505';
    end if;
  end loop;

  for employee_record in
    select employees.id
    from public.employees
    where employees.business_id = target_business_id
      and employees.id in (select value::uuid from jsonb_array_elements_text(employee_ids))
    order by employees.id
    for update
  loop
    calculation := app_private.calculate_employee_payroll(employee_record.id, target_business_id);
    gross_pay := (calculation->>'grossPay')::numeric;
    deductions := (calculation->>'deductions')::numeric;
    tax_withheld := (calculation->>'taxWithheld')::numeric;
    net_pay := (calculation->>'netPay')::numeric;
    employer_bpjs := (calculation->>'employerBpjs')::numeric;
    employee_bpjs := (calculation->>'employeeBpjs')::numeric;
    other_deductions := deductions - employee_bpjs;

    journal_lines := jsonb_build_array(
      jsonb_build_object('accountCode', '5200', 'debit', gross_pay, 'credit', 0, 'memo', 'Beban gaji')
    );
    if employer_bpjs > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('accountCode', '5201', 'debit', employer_bpjs, 'credit', 0, 'memo', 'Beban BPJS perusahaan')
      );
    end if;
    if net_pay > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('accountCode', '1000', 'debit', 0, 'credit', net_pay, 'memo', 'Gaji dibayar')
      );
    end if;
    if other_deductions > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('accountCode', '2000', 'debit', 0, 'credit', other_deductions, 'memo', 'Potongan payroll')
      );
    end if;
    if tax_withheld > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('accountCode', '2200', 'debit', 0, 'credit', tax_withheld, 'memo', 'Potongan PPh 21')
      );
    end if;
    if employee_bpjs + employer_bpjs > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('accountCode', '2210', 'debit', 0, 'credit', employee_bpjs + employer_bpjs, 'memo', 'Utang BPJS')
      );
    end if;

    insert into public.chart_of_accounts (business_id, code, name, type, normal_balance, category, is_system, is_active)
    values
      (target_business_id, '2210', 'Utang BPJS', 'liability', 'credit', 'payable', true, true),
      (target_business_id, '5201', 'Beban BPJS', 'expense', 'debit', 'payroll', true, true)
    on conflict (business_id, code) do nothing;

    journal_id := public.create_posted_journal(
      target_business_id,
      payroll_date,
      'Payroll run',
      'payroll',
      null,
      posting_role,
      journal_lines
    );

    insert into public.payroll_runs (
      business_id, period, employee_id, gross_pay, deductions, tax_withheld, net_pay, components, journal_entry_id, settled_on_posting
    ) values (
      target_business_id,
      to_char(payroll_date, 'YYYY-MM'),
      employee_record.id,
      gross_pay,
      deductions,
      tax_withheld,
      net_pay,
      calculation->'components',
      journal_id,
      true
    ) returning id into payroll_id;

    update public.journal_entries set reference_id = payroll_id where id = journal_id;
    posted_ids := posted_ids || to_jsonb(payroll_id);
    posted_count := posted_count + 1;
  end loop;

  if posted_count <> requested_count then
    raise exception 'One or more selected employees are not active in this business.' using errcode = '22023';
  end if;

  insert into public.activity_events (business_id, actor_user_id, actor_name, module, action, description)
  values (
    target_business_id,
    auth.uid(),
    coalesce(auth.uid()::text, 'System'),
    'hr',
    'payroll batch run',
    format('Payroll batch %s karyawan dipost atomik.', posted_count)
  );

  return posted_ids;
end;
$$;


commit;
