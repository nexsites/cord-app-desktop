import { Client } from "discord-rpc";

import { config } from "./config";

// internal state
let rpc: Client;

// Cord: Discord Rich Presence needs a Discord Developer application id, which
// is per-brand — using upstream's "872068124005007420" would surface Stoat's
// app name inside Discord ("Playing Stoat"), which is worse than nothing.
// Set CORD_DISCORD_CLIENT_ID to a real Discord application id at build time
// to enable this feature. Until then, RPC is a no-op regardless of config.
const CORD_DISCORD_CLIENT_ID = process.env.CORD_DISCORD_CLIENT_ID || "";

export async function initDiscordRpc() {
  if (!config.discordRpc) return;
  if (!CORD_DISCORD_CLIENT_ID) return;

  // clean up existing client if one exists
  rpc?.removeAllListeners();

  try {
    rpc = new Client({ transport: "ipc" });

    rpc.on("ready", () =>
      rpc.setActivity({
        state: "cord-app.com",
        details: "Chatting on Cord",
        largeImageKey: "qr",
        largeImageText: "Join Cord!",
        buttons: [
          {
            label: "Join Cord",
            url: "https://cord-app.com/",
          },
        ],
      }),
    );

    rpc.on("disconnected", reconnect);

    rpc.login({ clientId: CORD_DISCORD_CLIENT_ID });
  } catch (err) {
    reconnect();
  }
}

const reconnect = () => setTimeout(() => initDiscordRpc(), 1e4);

export async function destroyDiscordRpc() {
  rpc?.destroy();
}
