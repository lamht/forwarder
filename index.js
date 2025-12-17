import { spawn } from "child_process";

const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const URL_FORWARD = process.env.URL_FORWARD;
const TABLE = process.env.TABLE || "cloudflare";

if (!FIREBASE_DB_URL || !URL_FORWARD) {
  console.error("[ENV] missing");
  process.exit(1);
}

function log(msg, data = {}) {
  console.log(JSON.stringify({
    service: "forwarder",
    time: new Date().toISOString(),
    msg,
    ...data
  }));
}

// ===== save to firebase =====
async function savePublicUrl(url) {
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

    if (res.ok) {
      log("Firebase updated", { url });
    } else {
      log("Firebase write failed", { status: res.status });
    }
  } catch (e) {
    log("Firebase error", { error: e.message });
  }
}

// ===== run cloudflared quick tunnel =====
function runTunnel() {
  log("Starting cloudflared", { forward: URL_FORWARD });

  const proc = spawn("cloudflared", [
    "tunnel",
    "--url",
    URL_FORWARD
  ]);

  proc.stdout.on("data", async (data) => {
    const text = data.toString();
    process.stdout.write(text);
    log("cloudflared output", { text });
    // find https://xxxxx.trycloudflare.com
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const publicUrl = match[0];
      log("Public URL detected", { publicUrl });
      await savePublicUrl(publicUrl);
    }
  });

  proc.stderr.on("data", (data) => {
    process.stderr.write(data.toString());
  });

  proc.on("exit", (code) => {
    log("cloudflared exited", { code });
    // auto restart after 5s
    setTimeout(runTunnel, 5000);
  });
}

// ===== keep process alive =====
runTunnel();
