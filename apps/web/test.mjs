import PocketBase from "pocketbase";
import fs from "fs";

console.log("Starting debug script...");
try {
  const envContent = fs.readFileSync("../../.env", "utf8");
  console.log("Read env file successfully.");
  let pocketbaseUrl = "";
  let adminEmail = "";
  let adminPassword = "";

  for (const line of envContent.split("\n")) {
    if (line.startsWith("NEXT_PUBLIC_POCKETBASE_URL=")) {
      pocketbaseUrl = line.split("=")[1].trim();
    }
    if (line.startsWith("POCKETBASE_ADMIN_EMAIL=")) {
      adminEmail = line.split("POCKETBASE_ADMIN_EMAIL=")[1].trim();
    }
    if (line.startsWith("POCKETBASE_ADMIN_PASSWORD=")) {
      adminPassword = line.split("POCKETBASE_ADMIN_PASSWORD=")[1].trim();
    }
  }

  if (!pocketbaseUrl) pocketbaseUrl = "https://latcha-db.heimdal.dev";

  console.log("URL:", pocketbaseUrl);
  console.log("Admin prefix:", adminEmail.substring(0, 3));

  const pb = new PocketBase(pocketbaseUrl);
  console.log("Client created. Fetching...");

  await pb.admins.authWithPassword(adminEmail, adminPassword);
  const list = await pb.collection("captchas").getList(1, 1, {
    fields: "id",
  });

  console.log(`There are ${list.totalItems} rows in 'captchas'.`);
} catch (err) {
  console.error(err);
}
console.log("Done");
process.exit(0);
