import PocketBase from "pocketbase";

const DEFAULT_POCKETBASE_URL = "https://latcha-db.heimdal.dev";

export function getPocketBaseUrl(): string {
  return process.env.NEXT_PUBLIC_POCKETBASE_URL ?? DEFAULT_POCKETBASE_URL;
}

export function createPocketBaseClient(): PocketBase {
  return new PocketBase(getPocketBaseUrl());
}

export function hasPocketBaseAdminConfig(): boolean {
  return Boolean(
    process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD,
  );
}

export async function createPocketBaseAdminClient(): Promise<PocketBase> {
  const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
  const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error(
      "PocketBase admin env vars are missing. Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD.",
    );
  }

  const pb = createPocketBaseClient();
  await pb.admins.authWithPassword(adminEmail, adminPassword);
  return pb;
}
