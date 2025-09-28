/**
 * StreamElements Realtime via Socket.IO
 * - Auto ping/pong (no 30s disconnect loop)
 * - Safe reconnection
 * - Minimal surface: connectSE({ jwt, onEvent? })
 */

import { io as seIO } from "socket.io-client";

/**
 * @param {{jwt: string, onEvent?: (evt:any)=>void}} opts
 */
export function connectSE(opts = {}) {
  const jwt = (opts.jwt || "").trim();
  if (!jwt) {
    console.warn("[se] missing SE_JWT; skipping SE realtime");
    return;
  }

  const socket = seIO("https://realtime.streamelements.com", {
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 5000,
  });

  socket.on("connect", () => {
    console.log("[se] ws open");
    socket.emit("authenticate", { method: "jwt", token: jwt });
  });

  socket.on("authenticated", () => {
    console.log("[se] authenticated");
  });

  // Optional: see incoming SE events (tip/cheer/follow/etc.)
  socket.on("event", (data) => {
    try {
      // You can route this into your overlay if desired:
      // e.g., opts.onEvent?.(data)
      console.log("[se] event:", data?.type || "unknown");
      if (opts.onEvent) opts.onEvent(data);
    } catch (e) {}
  });

  socket.on("disconnect", (reason) => {
    console.log("[se] ws closed, reason=%s", reason || "");
  });

  socket.on("connect_error", (err) => {
    console.warn("[se] ws error", err?.message || err);
  });

  return socket;
}
