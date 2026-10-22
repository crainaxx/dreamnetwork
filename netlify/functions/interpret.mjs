// Interprets one dream through Freud and Jung with Claude and returns it as JSON.
// The API key lives only here, in the ANTHROPIC_API_KEY environment variable on Netlify.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.DREAM_MODEL || "claude-opus-5-5";

const reading = { type: "object", additionalProperties: false, required: ["label", "freud", "jung"],
  properties: { label: { type: "string" }, freud: { type: "string" }, jung: { type: "string" } } };
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title", "freud", "jung", "sum", "themes", "symbols", "people"],
  properties: {
    title: { type: "string" },
    freud: { type: "array", items: { type: "string" } },
    jung: { type: "array", items: { type: "string" } },
    sum: { type: "string" },
    themes: { type: "array", items: reading },
    symbols: { type: "array", items: reading },
    people: { type: "array", items: { type: "string" } }
  }
};

const SYSTEM = {
  tr: `Bir rüya defterinde rüyaları Freud ve Jung'a göre yorumlayan sıcak ve sade bir yorumcusun. Türkçe yaz, defterin sahibine "sen" diye hitap et. Teşhis koyma, kesin hüküm verme; yorumları olasılık olarak sun. Rüyada kendine zarar verme ya da ciddi sıkıntı işareti varsa, özette nazikçe bir yakınla ya da uzmanla konuşmayı öner.`,
  en: `You are a warm, plain-spoken interpreter in a dream journal, reading dreams through Freud and Jung. Write in English and address the journal's owner as "you". Do not diagnose or speak in certainties; offer readings as possibilities. If the dream suggests self-harm or serious distress, gently suggest talking to someone close or a professional in the summary.`
};

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => str(x, len)).filter(Boolean).slice(0, n);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const lang = b.lang === "en" ? "en" : "tr";
  const text = str(b.text, 6000);
  if (text.length < 10) return json({ error: "too_short" }, 400);
  const date = str(b.date, 40), day = str(b.day, 400), mood = str(b.mood, 40);
  const known = list(b.labels, 80, 40), people = list(b.people, 40, 40);

  const prompt = lang === "tr"
    ? `Önceki rüyalarda geçen tema ve semboller: ${known.join(", ") || "yok"}
Önceki rüyalarda geçen kişiler: ${people.join(", ") || "yok"}

Yeni rüya${date ? ` (${date})` : ""}:
"""${text}"""
${day ? `Günün önemli olayı: ${day}\n` : ""}${mood ? `Uyandığında ruh hali: ${mood}\n` : ""}
Şunları üret:
- title: 3-7 kelimelik başlık
- freud ve jung: her biri 3-5 madde, "Sembol: anlamı" biçiminde
- sum: "Freud'a göre ... Jung'a göre ..." biçiminde iki cümle
- themes: 1-3 geniş tema (ör. Yolculuk, Kayıp, Su), 1-2 kelime, her biri için kısa Freud ve Jung anlamı
- symbols: 3-5 somut sembol, 1-3 kelime, kısa Freud ve Jung anlamı (anlamı yoksa "—")
- people: rüyada geçen kişiler
Aynı fikir önceki listelerde geçiyorsa oradaki adı birebir kullan; rüyaları birbirine bu bağlar.`
    : `Themes and symbols from earlier dreams: ${known.join(", ") || "none"}
People from earlier dreams: ${people.join(", ") || "none"}

New dream${date ? ` (${date})` : ""}:
"""${text}"""
${day ? `Notable event that day: ${day}\n` : ""}${mood ? `Mood on waking: ${mood}\n` : ""}
Produce:
- title: a 3-7 word title
- freud and jung: 3-5 points each, written as "Symbol: meaning"
- sum: two sentences, "For Freud ... For Jung ..."
- themes: 1-3 broad themes (e.g. Journey, Loss, Water), 1-2 words, each with a short Freud and Jung meaning
- symbols: 3-5 concrete symbols, 1-3 words, short Freud and Jung meaning ("—" if none)
- people: people who appear in the dream
If the same idea appears in the earlier lists, reuse that exact name; that is what links the dreams together.`;

  try {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 6000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM[lang],
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: prompt }]
    });
    if (r.stop_reason === "refusal") return json({ error: "refused" }, 422);
    const out = r.content.find(c => c.type === "text");
    if (!out) return json({ error: "invalid_json" }, 502);
    const d = JSON.parse(out.text);
    const readings = (v, n) => (Array.isArray(v) ? v : []).filter(x => x && typeof x.label === "string")
      .slice(0, n).map(x => ({ label: str(x.label, 40), freud: str(x.freud, 240) || "—", jung: str(x.jung, 240) || "—" }));
    return json({
      title: str(d.title, 120), freud: list(d.freud, 6, 400), jung: list(d.jung, 6, 400), sum: str(d.sum, 600),
      themes: readings(d.themes, 3), symbols: readings(d.symbols, 6), people: list(d.people, 8, 40)
    });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
    if (e instanceof SyntaxError) return json({ error: "invalid_json" }, 502);
    return json({ error: "server" }, 500);
  }
};

export const config = {
  path: "/api/interpret",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
