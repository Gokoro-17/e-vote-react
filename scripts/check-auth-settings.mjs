import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
try {
  const base = process.env.SUPABASE_URL;
  if (base !== "https://mdtymdvybaurguflwktt.supabase.co")
    throw new Error("Unexpected project target.");
  const authBase = process.env.SUPABASE_AUTH_URL || base;
  const r = await fetch(authBase + "/auth/v1/settings", {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    console.log("Supabase public connection returned HTTP " + r.status);
    process.exitCode = 1;
  } else {
    const s = await r.json();
    console.log(
      JSON.stringify(
        {
          projectReachable: true,
          emailConfirmationRequired: s.mailer_autoconfirm === false,
          emailProviderEnabled: s.external?.email === true,
          googleProviderEnabled: s.external?.google === true,
        },
        null,
        2,
      ),
    );
  }
  if (process.env.SUPABASE_SECRET_KEY) {
    const client = createClient(base, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.storage.listBuckets();
    console.log(
      JSON.stringify({
        serverKeyAccepted: !error,
        existingStorageBuckets: data?.length ?? null,
      }),
    );
  }
} catch {
  console.error(
    "Supabase verification could not reach the selected project. Check network access and the private configuration. Credentials were not printed.",
  );
  process.exitCode = 1;
}
