// Della's Client Book: one-way import from her Google Calendar (private iCal link) into book_appointments.
// Runs from pg_cron every 15 minutes (x-cron-secret), or on demand by a signed-in member.
// Link: GCAL_ICS_URL secret, or Vault secret book_gcal_ics_url (Google Calendar → Settings → Integrate calendar → Secret address in iCal format).
import { createClient } from "jsr:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TZ = "America/Chicago";
const ALLOWED = ["https://shondellslaughter.com", "https://www.shondellslaughter.com"];

const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ALLOWED.includes(o) ? o : ALLOWED[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
});
const json = (b: unknown, s: number, h: Record<string, string>) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });

// wall-clock time in a time zone -> UTC instant
function zoned(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(guess)).reduce((a: any, p) => (a[p.type] = p.value, a), {});
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (asLocal - guess));
}
function parseDate(v: string, params: Record<string, string>) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { date: zoned(+y, +mo, +d, 0, 0, 0, TZ), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  let tz = params.TZID || TZ; try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { tz = TZ; }
  return { date: zoned(+y, +mo, +d, +h, +mi, +s, tz), allDay: false };
}
const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();

type Ev = { uid: string; summary: string; description: string; location: string; start: Date; end: Date; allDay: boolean; status: string; rrule: string; recurrenceId: string };
function parseICS(text: string): Ev[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: Ev[] = []; let cur: any = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur?.uid && cur.start) out.push(cur as Ev); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...ps] = line.slice(0, i).split(";"); const val = line.slice(i + 1);
    const params: Record<string, string> = {}; ps.forEach((p) => { const [k, v] = p.split("="); params[k.toUpperCase()] = (v || "").replace(/"/g, ""); });
    switch (name.toUpperCase()) {
      case "UID": cur.uid = val; break;
      case "SUMMARY": cur.summary = unescape(val); break;
      case "DESCRIPTION": cur.description = unescape(val); break;
      case "LOCATION": cur.location = unescape(val); break;
      case "STATUS": cur.status = val.toUpperCase(); break;
      case "RRULE": cur.rrule = val; break;
      case "RECURRENCE-ID": cur.recurrenceId = val; break;
      case "DTSTART": { const p = parseDate(val, params); if (p) { cur.start = p.date; cur.allDay = p.allDay; } break; }
      case "DTEND": { const p = parseDate(val, params); if (p) cur.end = p.date; break; }
    }
  }
  out.forEach((e) => { if (!e.end || e.end <= e.start) e.end = new Date(e.start.getTime() + 3600e3); e.summary ||= "(no title)"; e.description ||= ""; e.location ||= ""; e.status ||= "CONFIRMED"; });
  return out;
}

// "Shelby$20", "Lesa$120cash", "Kathy partial$100" -> name + price (+ how she was paid)
function splitTitle(t: string) {
  const m = t.match(/^(.*?)\s*\$\s*(\d+(?:\.\d+)?)\s*(cash ?app|cash|venmo|zelle|card)?/i);
  if (!m) return { clientName: t.trim() };
  return { clientName: m[1].trim() || t.trim(), price: Number(m[2]), ...(m[3] ? { paidBy: m[3].replace(/\b\w/g, (c) => c.toUpperCase()) } : {}) };
}

async function sync() {
  const url = Deno.env.get("GCAL_ICS_URL") || (await admin.rpc("book_gcal_url")).data;
  if (!url) return { ok: false, error: "Calendar link is not set (GCAL_ICS_URL or Vault book_gcal_ics_url)" };
  const r = await fetch(url, { headers: { "User-Agent": "client-book-sync" } });
  if (!r.ok) return { ok: false, error: `Google Calendar answered ${r.status}` };
  const text = await r.text();
  if (!text.includes("BEGIN:VCALENDAR")) return { ok: false, error: "That link did not return a calendar" };
  const events = parseICS(text);

  const { data: books } = await admin.from("book_books").select("id").order("created_at").limit(1);
  const bookId = books?.[0]?.id; if (!bookId) return { ok: false, error: "No book" };

  const since = Date.now() - 400 * 864e5, until = Date.now() + 400 * 864e5;
  const keep = events.filter((e) => !e.allDay && e.start.getTime() >= since && e.start.getTime() <= until);
  const { data: existing } = await admin.from("book_appointments").select("id,external_id,starts_at,ends_at,status,data").eq("book_id", bookId).eq("source", "google").limit(10000);
  const byExt = new Map((existing || []).map((a: any) => [a.external_id, a]));
  const now = Date.now(); let added = 0, updated = 0, cancelled = 0;
  const seen = new Set<string>(); const inserts: any[] = [];

  for (const e of keep) {
    const ext = e.recurrenceId ? `${e.uid}#${e.recurrenceId}` : e.uid;
    seen.add(ext);
    const status = e.status === "CANCELLED" ? "cancelled" : e.end.getTime() < now ? "done" : "booked";
    const gcal = { summary: e.summary, description: e.description.slice(0, 2000), location: e.location, repeats: !!e.rrule };
    const prev: any = byExt.get(ext);
    if (!prev) {
      inserts.push({ book_id: bookId, external_id: ext, source: "google", notify: false, status, starts_at: e.start.toISOString(), ends_at: e.end.toISOString(),
        data: { ...splitTitle(e.summary), services: [], notes: e.description.slice(0, 2000), gcal } });
    } else {
      const changed = prev.starts_at !== e.start.toISOString() || prev.ends_at !== e.end.toISOString() || prev.data?.gcal?.summary !== e.summary || prev.data?.gcal?.description !== gcal.description || (prev.status !== status && !["no_show"].includes(prev.status));
      if (changed && new Date(prev.starts_at).getTime() > now - 864e5) { // don't rewrite old history Della may have edited
        await admin.from("book_appointments").update({ starts_at: e.start.toISOString(), ends_at: e.end.toISOString(), status: prev.status === "no_show" ? prev.status : status,
          data: { ...prev.data, gcal, ...(prev.data?.gcal?.summary !== e.summary ? splitTitle(e.summary) : {}) } }).eq("id", prev.id);
        updated++;
      }
    }
  }
  for (let i = 0; i < inserts.length; i += 500) { const { error } = await admin.from("book_appointments").insert(inserts.slice(i, i + 500)); if (error) return { ok: false, error: error.message }; added += inserts.slice(i, i + 500).length; }
  // upcoming events that disappeared from Google = cancelled there
  for (const a of (existing || []) as any[]) {
    if (!seen.has(a.external_id) && a.status === "booked" && new Date(a.starts_at).getTime() > now) {
      await admin.from("book_appointments").update({ status: "cancelled" }).eq("id", a.id); cancelled++;
    }
  }
  return { ok: true, inFeed: events.length, inWindow: keep.length, added, updated, cancelled, at: new Date().toISOString() };
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, h);
  const { data: secret } = await admin.rpc("book_cron_secret");
  let allowed = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!allowed) {
    const sb = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await sb.auth.getUser();
    if (user) { const { data: mem } = await sb.from("book_members").select("book_id").eq("user_id", user.id).limit(1); allowed = !!mem?.length; }
  }
  if (!allowed) return json({ error: "Not allowed" }, 401, h);
  try { return json(await sync(), 200, h); } catch (e) { return json({ ok: false, error: String((e as Error).message || e) }, 200, h); }
});
