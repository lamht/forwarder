import { spawn } from "child_process";

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const URL_FORWARD = process.env.URL_FORWARD;
const TABLE = process.env.TABLE || "cloudflare";

if (!FIREBASE_DB_URL) {
  console.error("[ENV] FIREBASE_DB_URL missing");
  process.exit(1);
}

if (!URL_FORWARD) {
  console.error("[ENV] URL_FORWARD missing");
  process.exit(1);
}

console.log("[OK] ENV loaded");

// ===== save to firebase (no auth) =====
async function savePublicUrl(url) {
  if (!url) return;

  try {
    const res = await fetch(
      `${FIREBASE_DB_URL}/${TABLE}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          updatedAt: Date.now()
        })
      }
    );

    if (!res.ok) {
      console.error("[FIREBASE] write failed:", res.status);
    } else {
      console.log("[FIREBASE] URL saved");
    }
  } catch (err) {
    console.error("[FIREBASE] error:", err.message);
  }
}
