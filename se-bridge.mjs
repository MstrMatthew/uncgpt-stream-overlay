import dotenv from "dotenv";
dotenv.config({ override: true });

import { io as seIO } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const SE_JWT = (process.env.SE_JWT || "").trim();
if (!SE_JWT) {
  console.error("[se] SE_JWT missing. Set SE_JWT in .env"); process.exit(1);
}

function postAsk({ user, question, amountCents, source }) {
  const body = { user, question, amountCents, source };
  return fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r=>r.json()).catch(()=>null);
}

function centsFromTipUSD(amount) {
  const n = Number(amount || 0);
  return Math.round(n * 100);
}

function centsFromBits(bits) {
  const mul = Number(process.env.BITS_TO_CENTS || "1");
  return Math.round(Number(bits||0) * mul);
}

const socket = seIO("https://realtime.streamelements.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 5000
});

socket.on("connect", () => {
  console.log("[se] connect");
  socket.emit("authenticate", { method: "jwt", token: SE_JWT });
});

socket.on("authenticated", () => {
  console.log("[se] authenticated");
});

socket.on("disconnect", (reason) => {
  console.log("[se] disconnect reason=%s", String(reason||""));
});

socket.on("connect_error", (err) => {
  console.log("[se] error %s", err?.message || err);
});

socket.on("event", async (evt) => {
  try {
    if (!evt || !evt.type) return;

    if (evt.type === "tip") {
      const user = evt.data?.username || "Tipper";
      const message = (evt.data?.message || "").trim();
      const cents = centsFromTipUSD(evt.data?.amount);
      if (!message) return;
      console.log("[se] tip %s %s¢ %s", user, cents, message);
      await postAsk({ user, question: `asks: ${message}`, amountCents: cents, source: "tips" });
    }

    if (evt.type === "cheer") {
      const user = evt.data?.displayName || evt.data?.username || "Cheerer";
      const message = (evt.data?.message || "").trim();
      const cents = centsFromBits(evt.data?.amount);
      if (!message) return;
      console.log("[se] bits %s %s¢ %s", user, cents, message);
      await postAsk({ user, question: `asks: ${message}`, amountCents: cents, source: "bits" });
    }
  } catch {}
});

if (process.env.SE_TEST === "1") {
  setTimeout(()=>{
    console.log("[se] test inject");
    postAsk({ user:"SE Tester", question:"asks: test from se-bridge", amountCents:300, source:"tips" });
  }, 1000);
}
