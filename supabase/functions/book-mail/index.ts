// Della's Client Book: appointment emails.
//  - notify:    confirmation / change / cancellation, sent when Della saves an appointment (signed-in members only)
//  - reminders: run every 15 minutes by pg_cron; emails clients ~24 hours before their appointment
//  - request:   public booking request from the website form -> 'requested' appointment + emails
//  - intake:    public new-client form -> book_intake row for Della to review
//  - alerts:    every 15 minutes (pg_cron): emails Della + Rob about NEW double bookings, big overlaps, duplicates, clashes with personal time
//  - test, ping: for the settings screen
// Secrets: RESEND_API_KEY (email service), MAIL_FROM (verified sender). The cron job's secret lives in Vault (book_cron_secret).
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED = ["https://shondellslaughter.com", "https://www.shondellslaughter.com", "https://newtolinux23.github.io"];
const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("MAIL_FROM") ?? "Shondell Slaughter <appointments@shondellslaughter.com>";

export const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  confirm: {
    subject: "You're booked, {first}! {day} at {time}",
    body: "Hi {first},\n\nYou're all set for {service} on {when}.\n\n{address}\n\nNeed to change anything? Just reply to this email or text me at {phone}.\n\nSee you soon,\n{salon}",
  },
  change: {
    subject: "Your appointment moved to {day} at {time}",
    body: "Hi {first},\n\nYour appointment has been updated. Your new time is {when} for {service}.\n\n{address}\n\nIf this doesn't work for you, reply to this email or text me at {phone}.\n\n{salon}",
  },
  cancel: {
    subject: "Your appointment on {day} is cancelled",
    body: "Hi {first},\n\nYour appointment on {when} has been cancelled.\n\nWhenever you're ready to rebook, just reply to this email or text me at {phone}.\n\n{salon}",
  },
  received: {
    subject: "Got your request, {first}!",
    body: "Hi {first},\n\nThank you for reaching out! I received your request for {service}.\n\nI'll check my book and get back to you shortly to confirm your exact day and time.\n\nTalk soon,\n{salon}",
  },
  decline: {
    subject: "About your appointment request",
    body: "Hi {first},\n\nThank you so much for your request. Unfortunately I don't have an opening that fits the dates you picked.\n\nPlease reply to this email or text me at {phone} with a few other days that work for you, and I'll do my best to fit you in.\n\n{salon}",
  },
  reminder: {
    subject: "Reminder: see you tomorrow at {time}",
    body: "Hi {first},\n\nJust a reminder of your {service} appointment {when}.\n\n{address}\n\nIf something came up, please let me know as soon as you can at {phone}.\n\nSee you soon,\n{salon}",
  },
};

function cors(origin: string | null) {
  const o = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Appt = { id: string; book_id: string; client_id: string | null; starts_at: string; ends_at: string; status: string; notify: boolean; data: any; confirm_sent_at: string | null; created_at: string };

async function mailSettings(bookId: string) {
  const { data } = await admin.from("book_settings").select("data").eq("book_id", bookId).maybeSingle();
  const m = (data?.data?.mail ?? {}) as any;
  return {
    tz: m.tz || "America/Chicago",
    salon: m.salon || "Shondell Slaughter",
    address: m.address || "",
    phone: m.phone || "",
    replyTo: m.replyTo || "",
    reminders: m.reminders !== false,
    templates: { ...DEFAULT_TEMPLATES, ...(m.templates || {}) } as Record<string, { subject: string; body: string }>,
  };
}

async function recipient(a: Appt) {
  let name = a.data?.clientName || "", email = a.data?.email || "";
  if (a.client_id && (!email || !name)) {
    const { data } = await admin.from("book_clients").select("data").eq("id", a.client_id).maybeSingle();
    name = name || data?.data?.name || ""; email = email || data?.data?.email || "";
  }
  return { name: String(name).trim(), email: String(email).trim() };
}

function fill(t: string, a: Appt, who: { name: string }, s: Awaited<ReturnType<typeof mailSettings>>) {
  const d = new Date(a.starts_at);
  const day = d.toLocaleDateString("en-US", { timeZone: s.tz, weekday: "long", month: "long", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: s.tz, hour: "numeric", minute: "2-digit" });
  const services = Array.isArray(a.data?.services) && a.data.services.length ? a.data.services.join(" + ") : "your appointment";
  const v: Record<string, string> = {
    first: who.name.split(/\s+/)[0] || "there", name: who.name || "there", day, date: day, time, when: `${day} at ${time}`,
    service: services, salon: s.salon, address: s.address, phone: s.phone,
  };
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\n{3,}/g, "\n\n").trim();
}

function html(body: string, salon: string) {
  const paras = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f7f2e8;padding:24px 12px;font-family:Georgia,'Times New Roman',serif;color:#1d1a16">
<div style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e6dccb;border-radius:16px;padding:28px 24px">
<div style="font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#9a7536;margin-bottom:18px">${esc(salon)}</div>
<div style="font-size:16px;line-height:1.6">${paras}</div></div></body></html>`;
}

async function send(to: string, subject: string, body: string, s: { salon: string; replyTo: string }) {
  if (!RESEND) return { ok: false, error: "Email service not set up yet" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, text: body, html: html(body, s.salon), ...(s.replyTo ? { reply_to: s.replyTo } : {}) }),
  });
  if (r.ok) return { ok: true };
  const e = await r.json().catch(() => ({}));
  return { ok: false, error: (e as any)?.message || `Email service error ${r.status}` };
}

async function deliver(a: Appt, kind: string) {
  const s = await mailSettings(a.book_id);
  const who = await recipient(a);
  if (!who.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(who.email)) return { ok: false, error: "No email address for this client", skipped: true };
  const t = s.templates[kind] || DEFAULT_TEMPLATES[kind];
  const res = await send(who.email, fill(t.subject, a, who, s), fill(t.body, a, who, s), s);
  await admin.from("book_email_log").insert({ book_id: a.book_id, appointment_id: a.id, kind, to_email: who.email, ok: res.ok, error: res.ok ? null : res.error });
  return { ...res, to: who.email };
}

async function runReminders() {
  const now = Date.now();
  const { data: due, error } = await admin.from("book_appointments")
    .select("*").eq("status", "booked").eq("notify", true).is("reminder_sent_at", null)
    .gt("starts_at", new Date(now + 2 * 3600e3).toISOString())
    .lte("starts_at", new Date(now + 24 * 3600e3 + 10 * 60e3).toISOString())
    .limit(100);
  if (error) return { error: error.message };
  let sent = 0, skipped = 0, failed = 0;
  const settingsCache = new Map<string, boolean>();
  for (const a of (due || []) as Appt[]) {
    if (!settingsCache.has(a.book_id)) settingsCache.set(a.book_id, (await mailSettings(a.book_id)).reminders);
    // claim it first so two runs never double-send
    const { data: claimed } = await admin.from("book_appointments").update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", a.id).is("reminder_sent_at", null).select("id");
    if (!claimed || !claimed.length) continue;
    // reminders switched off, or the client was just confirmed for a same-day / next-day booking
    const recentConfirm = a.confirm_sent_at && new Date(a.confirm_sent_at).getTime() > new Date(a.starts_at).getTime() - 20 * 3600e3;
    if (!settingsCache.get(a.book_id) || recentConfirm) { skipped++; continue; }
    const r = await deliver(a, "reminder");
    if (r.ok) sent++;
    else if ((r as any).skipped) skipped++;
    else {
      failed++;
      const { count } = await admin.from("book_email_log").select("id", { count: "exact", head: true }).eq("appointment_id", a.id).eq("kind", "reminder").eq("ok", false);
      if ((count ?? 0) < 3) await admin.from("book_appointments").update({ reminder_sent_at: null }).eq("id", a.id); // retry next run
    }
  }
  return { checked: due?.length ?? 0, sent, skipped, failed };
}

const SLOT: Record<string, string> = { "Morning": "09:00", "Mid-Day": "12:00", "Late Afternoon": "15:00" };
const clip = (v: unknown, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

// Chicago wall-clock time -> UTC instant
function chicago(day: string, hm: string) {
  const guess = new Date(`${day}T${hm}:00Z`);
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return new Date(guess.getTime() + (guess.getTime() - local.getTime()));
}

async function handleRequest(b: any, req: Request) {
  if (b.website) return { ok: true }; // honeypot
  const f = {
    firstName: clip(b.firstName, 60), lastName: clip(b.lastName, 60), email: clip(b.email, 120).toLowerCase(),
    phone: clip(b.phone, 30), service: clip(b.service, 80), clientType: clip(b.clientType, 30),
    firstChoiceDate: clip(b.firstChoiceDate, 10), alternativeChoiceDate: clip(b.alternativeChoiceDate, 10),
    preferredTime: clip(b.preferredTime, 20), contactPreference: clip(b.contactPreference, 10),
    notes: clip(b.notes, 1500), referredBy: clip(b.referredBy, 120),
  };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const max = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
  const okDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= max;
  if (!f.firstName || !f.lastName || !f.service) return { ok: false, error: "Missing name or service" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email)) return { ok: false, error: "Email doesn't look right" };
  if (f.phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Phone number doesn't look right" };
  if (!okDay(f.firstChoiceDate)) return { ok: false, error: "Pick a date from today on" };
  if (f.alternativeChoiceDate && !okDay(f.alternativeChoiceDate)) f.alternativeChoiceDate = "";

  const { data: books } = await admin.from("book_books").select("id").order("created_at").limit(1);
  const bookId = books?.[0]?.id; if (!bookId) return { ok: false, error: "Booking is closed" };

  // simple abuse limits: 3 per email per day, 40 per hour overall
  const dayAgo = new Date(Date.now() - 864e5).toISOString(), hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { count: mine } = await admin.from("book_appointments").select("id", { count: "exact", head: true })
    .eq("book_id", bookId).eq("source", "website").gte("created_at", dayAgo).eq("data->>email", f.email);
  if ((mine ?? 0) >= 3) return { ok: false, error: "We already have your request. Della will reach out soon." };
  const { count: all } = await admin.from("book_appointments").select("id", { count: "exact", head: true })
    .eq("book_id", bookId).eq("source", "website").gte("created_at", hourAgo);
  if ((all ?? 0) >= 40) return { ok: false, error: "Too many requests right now. Please try again later." };

  // link to an existing client card when the email or phone matches
  const digits = f.phone.replace(/\D/g, "").slice(-10);
  const { data: clients } = await admin.from("book_clients").select("id,data").eq("book_id", bookId).limit(5000);
  const match = (clients || []).find((c: any) => (c.data?.email || "").toLowerCase() === f.email || (digits && String(c.data?.phone || "").replace(/\D/g, "").slice(-10) === digits));

  const start = chicago(f.firstChoiceDate, SLOT[f.preferredTime] || "10:00");
  const name = `${f.firstName} ${f.lastName}`;
  const { data: appt, error } = await admin.from("book_appointments").insert({
    book_id: bookId, client_id: match?.id ?? null, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 2 * 3600e3).toISOString(),
    status: "requested", source: "website", notify: true,
    data: { clientName: name, email: f.email, phone: f.phone, services: [f.service], notes: f.notes,
      request: { secondChoice: f.alternativeChoiceDate, preferredTime: f.preferredTime, clientType: f.clientType, contactPreference: f.contactPreference, referredBy: f.referredBy, firstChoice: f.firstChoiceDate } },
  }).select("*").single();
  if (error || !appt) return { ok: false, error: "Couldn't save the request" };

  // thank-you to the client, heads-up to Della (both best effort)
  const r = await deliver(appt as Appt, "received").catch(() => ({ ok: false }));
  const s = await mailSettings(bookId);
  const notifyTo = s.replyTo || Deno.env.get("STUDIO_EMAIL") || "";
  if (notifyTo && RESEND) {
    const when = (d: string) => d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
    const lines = [`New booking request from ${name}`, "", `Service: ${f.service} (${f.clientType || "client"})`,
      `Dates: ${when(f.firstChoiceDate)}${f.alternativeChoiceDate ? " or " + when(f.alternativeChoiceDate) : ""}, ${f.preferredTime || "any time"}`,
      `Phone: ${f.phone}`, `Email: ${f.email}`, `Confirm by: ${f.contactPreference || "-"}`,
      ...(f.referredBy ? [`Referred by: ${f.referredBy}`] : []), ...(f.notes ? ["", `Hair story: ${f.notes}`] : []),
      "", "Open your Client Book to accept, move or decline it:", "https://shondellslaughter.com/book/"];
    const res = await send(notifyTo, `New request: ${name}, ${f.service}`, lines.join("\n"), { salon: s.salon, replyTo: f.email });
    await admin.from("book_email_log").insert({ book_id: bookId, appointment_id: appt.id, kind: "new_request", to_email: notifyTo, ok: res.ok, error: res.ok ? null : res.error });
  }
  return { ok: true, emailed: !!(r as any).ok };
}

// public: new-client form filled in the chair or on the client's own phone -> book_intake (Della reviews it in the app)
const PICK = (v: unknown, ok: string[]) => { const x = clip(v, 40); return ok.includes(x) ? x : ""; };
async function handleIntake(b: any) {
  if (b.website) return { ok: true }; // honeypot
  const multi = (v: unknown, ok: string[]) => (Array.isArray(v) ? v : []).map((x) => clip(x, 40)).filter((x) => ok.includes(x)).slice(0, 10);
  const f = {
    firstName: clip(b.firstName, 60), lastName: clip(b.lastName, 60), phone: clip(b.phone, 30), email: clip(b.email, 120).toLowerCase(),
    birthday: /^\d{2}-\d{2}$/.test(clip(b.birthday, 5)) ? clip(b.birthday, 5) : "",
    contact: PICK(b.contact, ["Text", "Call", "Email"]), textOk: !!b.textOk,
    texture: PICK(b.texture, ["Straight", "Wavy", "Curly", "Coily", "Not sure"]),
    history: multi(b.history, ["Never colored", "Salon color", "Box dye", "Henna", "Bleach / lightener", "Relaxer", "Perm", "Keratin / smoothing", "Not sure"]),
    lastColor: clip(b.lastColor, 120), allergies: clip(b.allergies, 400), products: clip(b.products, 300),
    goals: clip(b.goals, 800), dislikes: clip(b.dislikes, 400),
    often: PICK(b.often, ["Every 4–6 weeks", "Every 6–8 weeks", "Every 2–3 months", "A few times a year", "Just today"]),
    heard: clip(b.heard, 120), photos: PICK(b.photos, ["Yes", "Hair only, no face", "No"]),
    agree: !!b.agree, signed: clip(b.signed, 80), inSalon: !!b.inSalon,
  };
  if (!f.firstName || !f.lastName) return { ok: false, error: "Please add your first and last name" };
  if (f.phone.replace(/\D/g, "").length < 10) return { ok: false, error: "Phone number doesn't look right" };
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email)) return { ok: false, error: "Email doesn't look right" };
  if (!f.agree || !f.signed) return { ok: false, error: "Please check the box and type your name at the bottom" };
  const { data: books } = await admin.from("book_books").select("id").order("created_at").limit(1);
  const bookId = books?.[0]?.id; if (!bookId) return { ok: false, error: "The form is closed right now" };
  const digits = f.phone.replace(/\D/g, "").slice(-10);
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const { count: mine } = await admin.from("book_intake").select("id", { count: "exact", head: true }).eq("book_id", bookId).gte("created_at", hourAgo).eq("data->>digits", digits);
  if ((mine ?? 0) >= 3) return { ok: true }; // already have it
  const { count: all } = await admin.from("book_intake").select("id", { count: "exact", head: true }).eq("book_id", bookId).gte("created_at", hourAgo);
  if ((all ?? 0) >= 30) return { ok: false, error: "Too many forms right now. Please try again later." };
  const { data: clients } = await admin.from("book_clients").select("id,data").eq("book_id", bookId).limit(5000);
  const match = (clients || []).find((c: any) => (f.email && (c.data?.email || "").toLowerCase() === f.email) || String(c.data?.phone || "").replace(/\D/g, "").slice(-10) === digits);
  const { error } = await admin.from("book_intake").insert({ book_id: bookId, client_id: match?.id ?? null, data: { ...f, digits } });
  if (error) return { ok: false, error: "Couldn't save the form. Please try again." };
  return { ok: true };
}

const URGENT = ["double booking", "overlap", "possible duplicate", "conflict with personal time"];
async function runAlerts() {
  const { data: issues, error } = await admin.rpc("book_check_issues");
  if (error) return { error: error.message };
  const urgent = (issues || []).filter((i: any) => URGENT.includes(i.kind));
  if (!urgent.length) return { checked: issues?.length ?? 0, sent: 0 };
  const keys = urgent.map((i: any) => "mail:" + i.key);
  const { data: done } = await admin.from("book_alerts").select("key").in("key", keys);
  const seen = new Set((done || []).map((d: any) => d.key));
  const fresh = urgent.filter((i: any) => !seen.has("mail:" + i.key));
  if (!fresh.length) return { checked: issues.length, sent: 0 };
  const { data: books } = await admin.from("book_books").select("id").order("created_at").limit(1);
  const { data: st } = await admin.from("book_settings").select("data").eq("book_id", books?.[0]?.id).maybeSingle();
  const to: string[] = (st?.data?.mail?.alertsTo || [st?.data?.mail?.replyTo]).filter(Boolean);
  if (!to.length || !RESEND) return { checked: issues.length, sent: 0, waiting: fresh.length, note: !RESEND ? "Email service not set up yet" : "No alert address" };
  const label: Record<string, string> = { "double booking": "Double booking", "overlap": "Overlap", "possible duplicate": "Possible duplicate", "conflict with personal time": "During personal time" };
  const lines = fresh.map((i: any) => `- ${label[i.kind] || i.kind}: ${i.detail}`);
  const body = ["Heads up! The Client Book found something on the calendar:", "", ...lines, "", "Open the Calendar to fix it:", "https://shondellslaughter.com/book/"].join("\n");
  const subject = fresh.length === 1 ? `Calendar alert: ${label[fresh[0].kind] || fresh[0].kind}` : `Calendar alert: ${fresh.length} things to check`;
  let sent = 0;
  for (const addr of to) { const r = await send(addr, subject, body, { salon: "Client Book", replyTo: "" }); if (r.ok) sent++; }
  if (sent) await admin.from("book_alerts").insert(fresh.map((i: any) => ({ key: "mail:" + i.key, kind: i.kind, detail: i.detail })));
  return { checked: issues.length, sent, items: fresh.length };
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, h);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400, h); }

  // scheduled reminders (pg_cron)
  if (body.action === "reminders") {
    const { data: secret } = await admin.rpc("book_cron_secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Not allowed" }, 401, h);
    return json(await runReminders(), 200, h);
  }
  if (body.action === "alerts") {
    const { data: secret } = await admin.rpc("book_cron_secret");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Not allowed" }, 401, h);
    return json(await runAlerts(), 200, h);
  }

  // public: booking request from the website
  if (body.action === "request") return json(await handleRequest(body, req), 200, h);
  if (body.action === "intake") return json(await handleIntake(body), 200, h);

  // everything else: a signed-in member of the book
  const sb = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Sign in first", code: "not_granted" }, 401, h);
  const { data: mem } = await sb.from("book_members").select("book_id").eq("user_id", user.id).limit(1);
  if (!mem || !mem.length) return json({ error: "Not a member of a book", code: "not_granted" }, 403, h);
  const bookId = mem[0].book_id as string;

  if (body.action === "ping") return json({ ready: !!RESEND, from: FROM }, 200, h);

  if (body.action === "test") {
    const to = String(body.to || user.email || "").trim();
    const s = await mailSettings(bookId);
    const kind = DEFAULT_TEMPLATES[body.kind] ? body.kind : "confirm";
    const fake = { id: "", book_id: bookId, client_id: null, starts_at: new Date(Date.now() + 26 * 3600e3).toISOString(), ends_at: "", status: "booked", notify: true, data: { services: ["Silk press"] }, confirm_sent_at: null, created_at: "" } as Appt;
    const t = s.templates[kind];
    const r = await send(to, "[Test] " + fill(t.subject, fake, { name: "Tasha Example" }, s), fill(t.body, fake, { name: "Tasha Example" }, s), s);
    return json({ ...r, to }, 200, h);
  }

  if (body.action === "notify") {
    const kind = ["confirm", "change", "cancel", "decline"].includes(body.kind) ? body.kind : "confirm";
    // read through RLS so members can only email about their own book's appointments
    const { data: a } = await sb.from("book_appointments").select("*").eq("id", body.id).maybeSingle();
    if (!a) return json({ error: "Appointment not found" }, 404, h);
    if (!a.notify) return json({ ok: false, skipped: true, error: "Emails are off for this appointment" }, 200, h);
    const r = await deliver(a as Appt, kind);
    if (r.ok && (kind === "confirm" || kind === "change")) await admin.from("book_appointments").update({ confirm_sent_at: new Date().toISOString() }).eq("id", a.id);
    return json(r, 200, h);
  }

  return json({ error: "Unknown action" }, 400, h);
});
