import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // Node < 18

// ===== ENV =====
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL;
const URL_FORWARD = process.env.URL_FORWARD;
const TABLE = process.env.TABLE || "cloudflare";

if (!FIREBASE_DB_URL || !URL_FORWARD) {
  console.error("[ENV] Missing FIREBASE_DB_URL or URL_FORWARD");
  process.exit(1);
}

// ===== Logger =====
function log(msg, data = {}) {
  console.log(JSON.stringify({
    service: "forwarder",
    time: new Date().toISOString(),
    msg,
    ...data
  }));
}

// ===== Save public URL =====
let lastUrl = null;
let saving = false;

async function savePublicUrl(url) {
  if (!url || url === lastUrl || saving) return;

  saving = true;
  lastUrl = url;

  try {
    const res = await fetch(`${FIREBASE_DB_URL}/${TABLE}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, updatedAt: Date.now() })
    });

    if (res.ok) log("Firebase updated", { url });
    else log("Firebase write failed", { status: res.status });
  } catch (err) {
    log("Firebase error", { error: err.message });
  } finally {
    saving = false;
  }
}

// ===== Run cloudflared tunnel =====
const logFile = path.resolve("./cloudflared.log");
const outStream = fs.createWriteStream(logFile, { flags: "a" });

log("Starting cloudflared tunnel", { forward: URL_FORWARD, logFile });

const proc = spawn("cloudflared", ["tunnel", "--url", URL_FORWARD], {
  stdio: ["ignore", "pipe", "pipe"]
});

proc.stdout.pipe(outStream);
proc.stderr.pipe(outStream);

proc.on("exit", (code) => {
  log("cloudflared exited", { code });
  // auto restart sau 5s
  setTimeout(() => {
    process.exit(1); // Docker sẽ restart container
  }, 5000);
});

// graceful shutdown
process.on("SIGINT", () => shutdown(proc));
process.on("SIGTERM", () => shutdown(proc));

function shutdown(proc) {
  log("Forwarder shutting down");
  if (proc && !proc.killed) proc.kill("SIGTERM");
  process.exit(0);
}

// ===== Check log định kỳ =====
async function checkLog() {
  if (!fs.existsSync(logFile)) return;

  const content = fs.readFileSync(logFile, "utf-8");
  const match = content.match(/https:\/\/[^\s]+\.trycloudflare\.com/);

  if (match) {
    const publicUrl = match[0];
    log("Public URL found in log", { publicUrl });
    await savePublicUrl(publicUrl);
  } else {
    log("No public URL found in log");
  }
}

// run check mỗi 1 phút
setInterval(checkLog, 60 * 1000);

// run check ngay lần đầu
checkLog();
