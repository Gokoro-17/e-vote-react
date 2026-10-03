import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const base = "https://mdtymdvybaurguflwktt.supabase.co";
const specifications = [
  {
    name: "verification-documents",
    public: false,
    fileSizeLimit: 7340032,
    allowedMimeTypes: ["application/octet-stream"],
  },
  {
    name: "campaign-images",
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  },
];
try {
  if (process.env.SUPABASE_URL !== base || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Configuration incomplete");
  const client = createClient(base, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: existing, error } = await client.storage.listBuckets();
  if (error) throw error;
  for (const specification of specifications) {
    const prior = existing.find((bucket) => bucket.id === specification.name);
    if (prior) {
      if (
        prior.public !== specification.public ||
        prior.file_size_limit !== specification.fileSizeLimit ||
        JSON.stringify([...(prior.allowed_mime_types || [])].sort()) !==
          JSON.stringify([...specification.allowedMimeTypes].sort())
      )
        throw new Error("Existing bucket differs");
      console.log("Verified storage configuration: " + specification.name);
      continue;
    }
    const { name, ...options } = specification;
    const { error } = await client.storage.createBucket(name, options);
    if (error) throw error;
    console.log("Created empty storage bucket: " + name);
  }
  console.log(
    "No documents, images, users, elections or ballots were created.",
  );
} catch {
  console.error(
    "Storage configuration could not be completed. Check the private server key, project access and existing bucket settings. Credentials were not printed.",
  );
  process.exitCode = 1;
}
