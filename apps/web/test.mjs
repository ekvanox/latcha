import { createClient } from "@supabase/supabase-js";
import fs from "fs";

console.log("Starting debug script...");
try {
  const envContent = fs.readFileSync("../../.env", "utf8");
  console.log("Read env file successfully.");
  let supabaseUrl = "";
  let supabaseKey = "";

  for (const line of envContent.split("\n")) {
    if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      supabaseUrl = line.split("=")[1].trim();
    }
    if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
      supabaseKey = line.split("SUPABASE_SERVICE_ROLE_KEY=")[1].trim();
    }
  }

  console.log("URL:", supabaseUrl);
  console.log("KEY prefix:", supabaseKey.substring(0, 15));

  const supabase = createClient(
    supabaseUrl,
    supabaseKey,
  );
  console.log("Client created. Fetching...");

  const { count, error } = await supabase
    .from("captchas")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error reading captchas table:", error.message);
  } else {
    console.log(`There are ${count} rows in 'captchas'.`);
  }
} catch (err) {
  console.error(err);
}
console.log("Done");
process.exit(0);
