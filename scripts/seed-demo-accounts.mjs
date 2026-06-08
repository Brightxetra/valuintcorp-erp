import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(fileName) {
  const filePath = join(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_ACCOUNT_PASSWORD || "password-demo";
const templateId = process.env.DEMO_ACCOUNT_TEMPLATE_ID || "food_beverage";

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const defaultAccounts = [
  { email: "demo.owner@valuintcorp.test", role: "owner", displayName: "Demo Owner Sandbox" },
  { email: "demo.finance@valuintcorp.test", role: "finance_admin", displayName: "Demo Finance Sandbox" },
  { email: "demo.staff@valuintcorp.test", role: "staff", displayName: "Demo Staff Sandbox" },
];

const accounts = process.env.DEMO_ACCOUNT_EMAILS
  ? process.env.DEMO_ACCOUNT_EMAILS.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
      .map((email) => ({ email, role: "owner", displayName: `Demo ${email}` }))
  : defaultAccounts;

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function findUserByEmail(email) {
  let page = 1;

  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
    page += 1;
  }

  return null;
}

async function ensureAuthUser(account) {
  const existing = await findUserByEmail(account.email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { name: account.displayName, demo: true },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { name: account.displayName, demo: true },
  });

  if (error) throw error;
  return data.user;
}

async function upsertDemoAccount(account, user) {
  const row = {
    auth_user_id: user.id,
    email: account.email,
    role: account.role,
    template_id: templateId,
    display_name: account.displayName,
    enabled: true,
    reset_policy: "daily",
    seed_version: 1,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("demo_user_accounts")
    .select("id")
    .eq("email", account.email)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase.from("demo_user_accounts").update(row).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("demo_user_accounts").insert(row);
  if (error) throw error;
}

for (const account of accounts) {
  const normalized = { ...account, email: account.email.toLowerCase() };
  const user = await ensureAuthUser(normalized);
  await upsertDemoAccount(normalized, user);
  console.log(`Seeded demo account ${normalized.email} as ${normalized.role}.`);
}

console.log(`Demo account password: ${password}`);
