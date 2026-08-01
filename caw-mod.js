/**
 * CAW MOD - a StarMash (SWAM) extension.
 *
 * 1. Plays the classic red-tailed hawk screech whenever anyone says "caw" in chat
 *    (case-insensitive; "CAW", "caw", "caaawww" all count).
 * 2. Plays the Unreal Tournament announcer on YOUR kill streaks:
 *        2 kills, each within 4s of the previous  -> Double Kill
 *        3rd within 4s of the Double              -> Multi Kill
 *        4th within 4s of the Multi               -> Mega Kill
 *        5th within 4s of the Mega                -> Ultra Kill
 *        6th within 4s of the Ultra               -> M-M-M-Monster Kill
 *    (7+ keeps replaying Monster Kill. Dying resets the chain.)
 *
 * SOUNDS: defaults point at the github.com/vj49dv5w2y-netizen/cawmash repo via
 * jsDelivr (caw.mp3 + the five UT announcer files at the repo root). Any of them can
 * still be overridden per-sound in Mod Settings, or repointed wholesale by editing
 * CDN below / setting "Sound base URL" (expects hawk/double/multi/mega/ultra/
 * monster.mp3 under that base).
 *
 * INSTALL: add this file's URL in the StarMash extensions panel:
 *     https://cdn.jsdelivr.net/gh/vj49dv5w2y-netizen/cawmash@main/caw-mod.js
 * (@main because the repo has no release tags; jsDelivr caches branch files ~12h -
 * after pushing changes, refresh the cache at
 *     https://purge.jsdelivr.net/gh/vj49dv5w2y-netizen/cawmash@main/caw-mod.js )
 */
!function () {
  "use strict";

  const CHAIN_WINDOW_MS = 4000;                // per-kill chaining window (UT rules)
  const STREAK_FILES = {                       // streak length -> filename under baseUrl
    2: "double.mp3",
    3: "multi.mp3",
    4: "mega.mp3",
    5: "ultra.mp3",
    6: "monster.mp3",
  };
  const STREAK_NAMES = { 2: "DOUBLE KILL", 3: "MULTI KILL", 4: "MEGA KILL",
                         5: "ULTRA KILL", 6: "M-M-M-MONSTER KILL" };
  const CAW_RE = /\bc+a+w+\b/i;

  // Where the sounds live (via jsDelivr). Full per-sound URLs win
  // over baseUrl, so these defaults work with the repo's own filenames.
  const CDN = "https://cdn.jsdelivr.net/gh/vj49dv5w2y-netizen/cawmash@main/";
  const settings = {
    baseUrl: "",
    hawkUrl: CDN + "caw.mp3",
    doubleUrl: CDN + "doublekill.mp3",
    multiUrl: CDN + "multikill.mp3",
    megaUrl: CDN + "megakill.mp3",
    ultraUrl: CDN + "ultrakill.mp3",
    monsterUrl: CDN + "monsterkill.mp3",
    volume: 80,
    streakLoudness: 60,     // UT announcer loudness as a PERCENT of master volume
    hawkCooldownSecs: 2,
    cawEnabled: true,
    streakEnabled: true,
  };

  function soundUrl(overrideKey, filename) {
    if (settings[overrideKey]) return settings[overrideKey];
    if (settings.baseUrl) {
      return settings.baseUrl.replace(/\/?$/, "/") + filename;
    }
    return null;
  }

  function play(overrideKey, filename, label, gain = 1.0) {
    const url = soundUrl(overrideKey, filename);
    if (!url) {
      console.warn(`[caw mod] ${label}: no sound configured - set "Sound base URL" ` +
                   `or the per-sound URL in Mod Settings (expected ${filename})`);
      return;
    }
    const a = new Audio(url);                  // fresh element per play so sounds can overlap
    a.volume = Math.min(1, Math.max(0, (settings.volume / 100) * gain));
    a.play().catch((e) => console.warn(`[caw mod] could not play ${label}:`, e.message));
  }

  // ------------------------------------------------------------------ CAW in chat
  let lastHawk = -Infinity;   // not 0: the cooldown must not swallow a CAW right after page load
  SWAM.on("chatLineAdded", (player, text, type) => {
    if (!settings.cawEnabled || typeof text !== "string" || !CAW_RE.test(text)) return;
    const now = performance.now();
    if (now - lastHawk < settings.hawkCooldownSecs * 1000) return;   // flood guard
    lastHawk = now;
    play("hawkUrl", "hawk.mp3", "hawk screech");
  });

  // ------------------------------------------------------------------ kill streaks
  // The engine calls Players.kill(msg) on every PLAYER_KILL packet, msg =
  // {id: victim, killer, posX, posY} - wrap it once (technique starmash-things
  // uses) and read the ids before handing through.
  let streak = 0;
  let lastKillAt = -1e12;

  function onKillPacket(msg) {
    if (!settings.streakEnabled) return;
    const me = Players.getMe();
    if (!me) return;
    if (msg.id === me.id) {                    // we died: the chain is over
      streak = 0;
      return;
    }
    if (msg.killer !== me.id) return;          // somebody else's kill
    const now = performance.now();
    streak = (now - lastKillAt <= CHAIN_WINDOW_MS) ? streak + 1 : 1;
    lastKillAt = now;
    if (streak >= 2) {
      const tier = Math.min(streak, 6);
      console.log(`[caw mod] ${STREAK_NAMES[tier]} (${streak} kills)`);
      play(STREAK_FILES[tier].replace(".mp3", "Url"), STREAK_FILES[tier], STREAK_NAMES[tier],
           settings.streakLoudness / 100);
    }
  }

  SWAM.on("gameRunning", () => {
    if (Players.kill && !Players.kill.__cawWrapped) {   // guard: gameRunning refires per game
      const originalPlayersKill = Players.kill;
      Players.kill = function (msg) {
        try { onKillPacket(msg); } catch (e) { console.warn("[caw mod]", e); }
        return originalPlayersKill(msg);
      };
      Players.kill.__cawWrapped = true;
    }
    streak = 0;                                // fresh game, fresh chain
    lastKillAt = -1e12;
  });

  // ------------------------------------------------------------------ settings UI
  function createSettingsProvider() {
    const onApply = (values) => Object.assign(settings, values);
    const sp = new SettingsProvider(settings, onApply);
    const sounds = sp.addSection("Sounds");
    sounds.addString("baseUrl", "Sound base URL (folder with hawk/double/multi/mega/ultra/monster .mp3)");
    sounds.addSliderField("volume", "Volume", { min: 0, max: 100, step: 5 });
    const caw = sp.addSection("CAW");
    caw.addBoolean("cawEnabled", "Hawk screech when anyone says CAW");
    caw.addSliderField("hawkCooldownSecs", "Hawk cooldown (seconds, anti-spam)", { min: 0, max: 15, step: 1 });
    caw.addString("hawkUrl", "Hawk sound URL override (optional)");
    const streaks = sp.addSection("Kill streaks");
    streaks.addBoolean("streakEnabled", "UT announcer on kill streaks");
    streaks.addSliderField("streakLoudness", "Announcer loudness (% of master volume)",
                           { min: 0, max: 100, step: 5 });
    streaks.addString("doubleUrl", "Double Kill URL override (optional)");
    streaks.addString("multiUrl", "Multi Kill URL override (optional)");
    streaks.addString("megaUrl", "Mega Kill URL override (optional)");
    streaks.addString("ultraUrl", "Ultra Kill URL override (optional)");
    streaks.addString("monsterUrl", "Monster Kill URL override (optional)");
    return sp;
  }

  SWAM.registerExtension({
    name: "caw mod",
    id: "cawmod",
    description: "Hawk screech on CAW in chat + Unreal Tournament kill-streak announcer",
    author: "bird",
    version: "1.0.0",
    settingsProvider: createSettingsProvider(),
  });
}();
