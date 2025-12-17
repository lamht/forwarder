import { spawn } from "child_process";

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

// ===== Firebase save =====
async function savePublicUrl(url) {
  try {
    const res = await fetch(
      `${FIREBASE_DB_URL}/${TABLE}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, updatedAt: Date.now() })
      }
    );

    if (res.ok) {
      log("Firebase updated", { url });
    } else {
      log("Firebase write failed", { status: res.status });
    }
  } catch (err) {
    log("Firebase error", { error: err.message });
  }
}

// ===== Cloudflared Tunnel =====
let lastUrl = null;
let saving = false;
let buffer = "";

function runTunnel() {
  log("Starting cloudflared tunnel", { forward: URL_FORWARD });

  const proc = spawn("cloudflared", ["tunnel", "--url", URL_FORWARD], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  proc.stdout.on("data", (data) => {
    const chunk = data.toString();
    buffer += chunk;

    log("cloudflared chunk", { chunk });

    // split buffer by newline
    const lines = buffer.split("\n");
    buffer = lines.pop(); // incomplete line

    for (const line of lines) {
      handleLine(line.trim());
    }
  });

  proc.stderr.on("data", (data) => {
    process.stderr.write(data.toString());
  });

  proc.on("exit", (code) => {
    log("cloudflared exited", { code });
    // restart after 5s
    setTimeout(runTunnel, 5000);
  });

  // Graceful shutdown
  process.on("SIGINT", () => shutdown(proc));
  process.on("SIGTERM", () => shutdown(proc));
}

// ===== Handle each line =====
async function handleLine(line) {
  const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
  if (!match) {
    log("No URL in line", { line });
    return;
  }

  const publicUrl = match[0];

  if (publicUrl === lastUrl || saving) {
    log("Skip duplicate URL or saving in progress", { publicUrl });
    return;
  }

  lastUrl = publicUrl;
  saving = true;

  log("Public URL detected", { publicUrl });

  try {
    await savePublicUrl(publicUrl);
  } finally {
    saving = false;
  }
}

// ===== Graceful shutdown =====
function shutdown(proc) {
  log("Forwarder shutting down");
  if (proc && !proc.killed) {
    proc.kill("SIGTERM");
  }
  process.exit(0);
}

// ===== Start =====
runTunnel();
