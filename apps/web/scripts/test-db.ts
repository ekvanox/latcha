import PocketBase from "pocketbase";
import path from "path";
import dotenv from "dotenv";

const envPath = path.join(process.cwd(), "../../.env");
console.log("Loading .env from:", envPath);
dotenv.config({ path: envPath });

const pocketBaseUrl =
  process.env.NEXT_PUBLIC_POCKETBASE_URL ||
  process.env.POCKETBASE_URL ||
  "https://latcha-db.heimdal.dev";
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

console.log("URL:", pocketBaseUrl);
console.log(
  "Admin email:",
  adminEmail ? `${adminEmail.substring(0, 3)}***` : "(missing)",
);

if (!adminEmail || !adminPassword) {
  console.error(
    "Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD in .env",
  );
  process.exit(1);
}

const resolvedAdminEmail = adminEmail;
const resolvedAdminPassword = adminPassword;

const pb = new PocketBase(pocketBaseUrl);

async function check() {
  console.log("Checking row count in PocketBase captchas collection...");
  try {
    await pb.admins.authWithPassword(
      resolvedAdminEmail,
      resolvedAdminPassword,
    );
    const page = await pb.collection("captchas").getList(1, 1, {
      fields: "id",
    });
    console.log(`There are ${page.totalItems} rows in 'captchas'.`);
  } catch (e: unknown) {
    console.error(
      "Exception:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

check().then(() => {
  console.log("Check method finished");
  process.exit(0);
});
