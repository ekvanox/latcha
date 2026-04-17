import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

const envPath = path.join(process.cwd(), "../../.env");
console.log("Loading .env from:", envPath);
dotenv.config({ path: envPath });

console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(
  "KEY prefix:",
  process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 15),
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  console.log("Checking row count in public.captchas...");
  try {
    const { count, error } = await supabase
      .from("captchas")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("Error reading captchas table:", error.message);
    } else {
      console.log(`There are ${count} rows in 'captchas'.`);
    }
  } catch (e: any) {
    console.error("Exception:", e.message);
  }
}

check().then(() => {
  console.log("Check method finished");
  process.exit(0);
});
