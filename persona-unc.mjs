/**
 * UNC persona — unfiltered OG energy. Heavy slang, blunt, 1–2 sentences, ~32–40 words max.
 * Always opens with Nephew/Niece (guess female names; default Nephew). No canned lines, no lists,
 * no clarifying questions. Mild profanity OK. Shut down egregious topics in-character.
 */

export function uncSystemPrompt({ streamer="Matthew", aliases="Matthew|MstrMatthew|Matt", maxWords=32 } = {}) {
  return `
You are UNC — an older, street-raised mentor with swagger. Think seasoned OG: blunt, playful, confident. Not a guidance counselor.
Audience: viewers in ${streamer}'s chat (aliases: ${aliases}). Assume a viewer asked, not ${streamer}.

Hard rules:
- Start EVERY reply with "Nephew," or "Niece," (guess from name; if unsure: "Nephew,").
- Keep it tight: ~${maxWords} words TOTAL, **one or two** short sentences. No lists. No step-by-step. No “Do this:”.
- Heavy slang welcome; mild profanity is fine. No slurs or hateful speech.
- Never ask clarifying questions. If the ask is nonsense, toss a quick line and move on.
- If it’s a generic “build/loadout/meta/class” with no game named, don’t give builds — give a quick playful deflect and switch topics. **Improvise phrasing**; don’t reuse lines.
- Avoid coach-speak words like “try, remember, experiment, playlist, deep breath, focus routine, habit stack” unless mocking them.
- End naturally; short sign-offs are fine, but don’t sound robotic.

Formatting: plain sentences only, zero bullets. If you start drifting into tips or lectures, cut yourself off.
`.trim();
}

/** Guess salutation from name. Defaults to "Nephew". */
export function salutationForName(name) {
  try {
    const n = String(name||'').toLowerCase();
    if (/\b(ms|mrs|miss)\b|lady|queen|princess/.test(n)) return 'Niece';
    const female = new Set([
      'jessica','emily','sarah','ashley','amanda','jennifer','lisa','amy','melissa','nicole','rachel',
      'emma','olivia','ava','sophia','isabella','mia','amelia','harper','ella','chloe','lily','grace',
      'victoria','zoe','natalie','hannah','audrey','allison','samantha','alexis','lauren','kayla',
      'megan','brianna','taylor','madison','abigail','scarlett','aria','violet','nora','evelyn'
    ]);
    const base = n.replace(/[^a-z]/g,'');
    if (female.has(base)) return 'Niece';
  } catch {}
  return 'Nephew';
}

/** Egregious topics to shut down (still in character). */
export function isEgregious(q) {
  try {
    const t = String(q||'').toLowerCase();
    return /\b(murder|rape|assault|abuse|terror|bomb|child|csam|traffick|suicide|kill myself)\b/.test(t);
  } catch { return true; }
}

/** Word cap. */
export function limitWords(s, n=32) {
  const parts = String(s||'').trim().split(/\s+/);
  if (parts.length <= n) return parts.join(' ');
  return parts.slice(0, n).join(' ').replace(/[;,:-]+$/,'') + '.';
}

/** Keep 1–2 sentences max. */
export function clampSentences(s, max=2) {
  const raw = String(s||'').replace(/\s+/g,' ').trim();
  const chunks = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = chunks.slice(0, max).join(' ');
  return kept || raw;
}

/** Light slang seasoning without caricature. */
export function slangify(s) {
  return String(s||'')
    .replace(/\btrying to\b/gi, "tryna")
    .replace(/\bgoing to\b/gi, "gon'")
    .replace(/\babout to\b/gi, "bout to")
    .replace(/\bwant to\b/gi, "wanna")
    .replace(/\bbecause\b/gi, "cuz")
    .replace(/\bgetting\b/gi, "gettin'")
    .replace(/\bworking\b/gi, "workin'")
    .replace(/\bdoing\b/gi, "doin'")
    .replace(/\bplaying\b/gi, "playin'")
    .replace(/\bwith\b/gi, "wit")
    .replace(/\b(kind of|sort of|really|very|honestly|basically|just)\b/gi, '')
    .replace(/\s{2,}/g,' ')
    .trim();
}

/**
 * Final style pass:
 *  - remove lists/newlines
 *  - ensure Nephew/Niece prefix
 *  - 1–2 sentence clamp
 *  - cap words (~32 by default)
 *  - light slangify
 *  - egregious topics -> brief boundary line
 *  - NO canned deflect lines; we rely on system prompt for improv
 */
export function styleUncResponse({ content, name, question, maxWords=32 }) {
  const q = String(question||'');
  const sal = salutationForName(name);

  if (isEgregious(q)) {
    return `${sal}, we don’t touch that. Change the topic and keep it movin'.`;
  }

  let out = String(content||'')
    .replace(/\n+/g,' ')
    .replace(/\s*[-•]\s+/g,' ')       // strip bullets
    .replace(/\bDo this:\b.*$/i,'')   // kill any “Do this”
    .trim();

  if (!/^(?:N|n)(?:ephew|iece),\s/.test(out)) {
    out = `${sal}, ${out}`;
  }

  out = clampSentences(out, 2);
  out = limitWords(out, maxWords || 32);
  out = slangify(out);

  // Nix coach-speak tails if they slipped in
  out = out.replace(/\b(try|remember|experiment|playlist|habit stack|routine)\b/gi, '')
           .replace(/\s{2,}/g,' ')
           .trim();

  return out;
}
