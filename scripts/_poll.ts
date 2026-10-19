import { createAdminClient } from "@/lib/supabase/admin";
async function main() {
  const s = createAdminClient();
  for (let i = 0; i < 90; i++) {
    const { error, count } = await s
      .from("provider_coverage")
      .select("*", { count: "exact", head: true });
    if (!error && count && count > 0) {
      console.log("rows", count);
      return;
    }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.log("timeout");
}
main();
