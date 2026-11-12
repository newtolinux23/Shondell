// DEMO ONLY. A pretend salon with made-up clients, kept in the browser's memory.
// Nothing here talks to a server; every change disappears when the page reloads.
(() => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const BOOK = 'demo', U = { id: 'demo-user', email: 'demo@example.com' };
  const iso = d => d.toISOString().slice(0, 10);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const workDay = d => { if ([0, 1].includes(d.getDay())) d = addDays(d, 2 + Math.floor(rnd() * 3)); return d; }; // salon closed Sun & Mon
  let idn = 0; const id = p => p + (++idn);

  const MENU = [['Root touch-up', 85], ['All-over color', 110], ['Highlights', 165], ['Balayage', 210], ['Gloss / glaze', 45], ['Toner', 35], ['Cut', 55], ['Men’s cut', 30], ['Curl shaping', 75], ['Treatment', 40], ['Style', 45], ['Color correction', 250]];
  const PRICE = Object.fromEntries(MENU);
  const PRODUCTS = [['Olaplex No.3', 32], ['Curl cream', 28], ['Purple shampoo', 24], ['Heat protectant', 26], ['Leave-in conditioner', 22]];
  const SUPPLIES = [{ name: 'Redken Shades EQ', size: 2, unit: 'oz', price: 11.5 }, { name: 'Wella Koleston', size: 2, unit: 'oz', price: 9.75 }, { name: 'Blondor lightener', size: 28, unit: 'oz', price: 54 }, { name: 'Developer 20 vol', size: 32, unit: 'oz', price: 12 }];
  SUPPLIES.forEach(s => s.hist = [{ date: iso(addDays(today, -200)), price: Math.round(s.price * 0.92 * 100) / 100 }]);

  const FIRST = ['Ava', 'Maya', 'Chloe', 'Brianna', 'Keisha', 'Lauren', 'Rosa', 'Tiffany', 'Hannah', 'Gloria', 'Nicole', 'Paige', 'Denise', 'Carmen', 'Erin', 'Jada', 'Monica', 'Whitney', 'Sofia', 'Rachel', 'Tamara', 'Lily', 'Vanessa', 'Grace', 'Marcus', 'Daniel', 'Olivia', 'Bethany', 'Alicia', 'Renee', 'Priya', 'Stacy', 'Angela', 'Kayla', 'Robin', 'Nina', 'Holly', 'Jasmine', 'Trevor', 'Megan'];
  const LAST = ['Carter', 'Nguyen', 'Brooks', 'Ramirez', 'Hayes', 'Bennett', 'Foster', 'Price', 'Ellis', 'Morgan', 'Reyes', 'Coleman', 'Jenkins', 'Patel', 'Hughes', 'Long', 'Simmons', 'Russell', 'Ortiz', 'Ward'];
  // what each client usually gets: [services, weeks between visits]
  const KINDS = [[['Root touch-up'], 5], [['Root touch-up', 'Cut'], 6], [['Highlights', 'Toner'], 9], [['Balayage', 'Gloss / glaze'], 12], [['Cut'], 6], [['Men’s cut'], 4], [['Curl shaping', 'Treatment'], 8], [['All-over color', 'Cut'], 7], [['Gloss / glaze', 'Cut'], 8]];
  const PAYS = ['Card', 'Card', 'Card', 'Cash', 'Venmo', 'Venmo', 'Zelle', 'Cash App', 'Apple Pay'];
  const HAIR = ['Fine, lots of it', 'Coarse, curly 3B', 'Medium, wavy', 'Thick, grey at temples', 'Fine, previously lightened', 'Natural level 5, warm'];

  const T = { book_members: [{ book_id: BOOK, user_id: U.id }], book_books: [{ id: BOOK, name: 'Demo salon', invite_code: 'DEMO' }],
    book_clients: [], book_visits: [], book_expenses: [], book_appointments: [], book_email_log: [], book_reports: [], book_alerts: [],
    book_settings: [{ book_id: BOOK, data: { menu: MENU.map(([name, price]) => ({ name, price })), products: PRODUCTS.map(([name, price]) => ({ name, price })), supplies: SUPPLIES,
      salesTaxRate: 8.25, filingStatus: 'single', otherIncome: 0, venmoHandle: '', mail: { salon: 'Jordan Rivers', phone: '(555) 555-0188', replyTo: '', reminders: true } } }] };

  const color = s => /touch|color|highlight|balayage|gloss|toner|correction/i.test(s);
  const formulaFor = svcs => {
    const f = [];
    if (svcs.some(s => /touch|All-over/.test(s))) f.push({ zone: 'Roots', brand: 'Wella Koleston', shade: pick(['6/0', '5/3', '7/1', '4/0']), developer: '20 vol', ratio: '1:1', time: 35, amt: pick([40, 50, 60]), note: '' });
    if (svcs.some(s => /Highlights|Balayage/.test(s))) f.push({ zone: 'Foils', brand: 'Blondor lightener', shade: 'Multi-blonde', developer: '20 vol', ratio: '1:2', time: 40, amt: pick([30, 40]), note: 'Watch the crown' });
    if (svcs.some(s => /Gloss|Toner/.test(s))) f.push({ zone: 'All over', brand: 'Redken Shades EQ', shade: pick(['09V', '08GI', '07NB', '09P']), developer: 'Processing solution', ratio: '1:1', time: 20, amt: pick([40, 60]), note: '' });
    return f;
  };
  const visitsByClient = {};
  const addVisit = (c, date, svcs) => {
    const items = svcs.map(n => ({ name: n, price: PRICE[n] + (rnd() < 0.3 ? 10 : 0), qty: 1, type: 'service' }));
    if (rnd() < 0.22) { const p = pick(PRODUCTS); items.push({ name: p[0], price: p[1], qty: 1, type: 'product' }); }
    const svc = items.filter(i => i.type === 'service').reduce((t, i) => t + i.price, 0), prod = items.filter(i => i.type === 'product').reduce((t, i) => t + i.price, 0);
    const formula = svcs.some(color) ? formulaFor(svcs).map(f => { const s = SUPPLIES.find(x => x.name === f.brand); return s ? { ...f, cost: Math.round(f.amt / 28.35 / s.size * s.price * 100) / 100 } : f; }) : [];
    const v = { clientId: c.id, clientName: c.data.name, date: iso(date), source: 'register', services: svcs, items, price: svc, productSales: prod,
      salesTax: prod ? Math.round(prod * 0.0825 * 100) / 100 : 0, discount: 0, tip: Math.round(svc * pick([0.15, 0.18, 0.2, 0.2, 0.25, 0]) ), payment: pick(PAYS),
      formula, notes: '', photos: [], createdAt: date.toISOString(), updatedAt: date.toISOString() };
    const pc = formula.reduce((t, f) => t + (f.cost || 0), 0); if (pc) v.productCost = Math.round(pc * 100) / 100;
    T.book_visits.push({ id: id('v'), book_id: BOOK, date: v.date, client_id: c.id, data: v });
    const st = new Date(date); st.setHours(pick([9, 10, 11, 13, 14, 15, 16]), pick([0, 30]), 0, 0);
    T.book_appointments.push({ id: id('ap'), book_id: BOOK, client_id: c.id, starts_at: st.toISOString(), ends_at: new Date(st.getTime() + (svcs.some(color) ? 2 : 1) * 36e5).toISOString(),
      status: 'done', source: 'app', notify: false, created_at: st.toISOString(), data: { clientName: c.data.name, services: svcs, price: svc, checkin: rnd() < 0.85 ? 'on_time' : 'late' } });
  };

  FIRST.forEach((fn, i) => {
    const name = fn + ' ' + LAST[i % LAST.length], kind = KINDS[i % KINDS.length];
    const hasPhone = i % 7 !== 3, hasEmail = i % 3 !== 1;
    const c = { id: id('c'), book_id: BOOK, data: { name, phone: hasPhone ? `(555) 555-01${String(i).padStart(2, '0')}` : '', email: hasEmail ? fn.toLowerCase() + '@example.com' : '',
      birthday: '', allergies: i % 9 === 0 ? 'PPD patch test – mild reaction' : '', hair: pick(HAIR), notes: i % 5 === 0 ? 'Likes a cappuccino. Chatty!' : '', createdAt: addDays(today, -420).toISOString() } };
    if (i % 6 === 2) c.data.nextNote = 'Go a shade warmer next time';
    T.book_clients.push(c);
    // history: regulars come every ~kind weeks; some have drifted away (reach-out list)
    const gap = kind[1] * 7, drift = i % 5 === 4 ? gap * (1.5 + rnd() * 2) : rnd() * gap * 0.9;
    let d = addDays(today, -Math.round(drift));
    const stop = addDays(today, -400);
    while (d > stop) { const day = workDay(new Date(d)); if (day < today) addVisit(c, day, kind[0]); d = addDays(d, -Math.round(gap * (0.85 + rnd() * 0.3))); }
    visitsByClient[c.id] = kind; c.lapsed = i % 5 === 4;
  });

  // today and the coming weeks
  const clients = T.book_clients.filter(c => !c.lapsed); T.book_clients.forEach(c => delete c.lapsed);
  const book = (c, day, h, m, svcs, extra = {}) => { const st = new Date(day); st.setHours(h, m, 0, 0);
    T.book_appointments.push({ id: id('ap'), book_id: BOOK, client_id: c ? c.id : null, starts_at: st.toISOString(), ends_at: new Date(st.getTime() + (svcs.some(color) ? 2 : 1) * 36e5).toISOString(),
      status: 'booked', source: 'app', notify: true, created_at: addDays(today, -10).toISOString(), confirm_sent_at: addDays(today, -10).toISOString(), reminder_sent_at: null,
      data: { clientName: c ? c.data.name : extra.name, services: svcs, price: svcs.reduce((t, n) => t + (PRICE[n] || 0), 0), email: c && c.data.email, phone: c && c.data.phone }, ...extra.row }); };
  const now = new Date();
  [[9, 30], [11, 0], [13, 30], [15, 30]].forEach(([h, m], k) => { const c = clients[k * 3 + 1]; book(c, today, h, m, visitsByClient[c.id][0]); });
  for (let n = 1; n <= 28; n++) { const day = addDays(today, n); if ([0, 1].includes(day.getDay())) continue;
    const count = 2 + Math.floor(rnd() * (n < 10 ? 4 : 2)); const hours = [9, 10, 12, 13, 14, 15, 16];
    for (let k = 0; k < count; k++) { const c = clients[(n * 5 + k * 7) % clients.length]; book(c, day, hours[(k * 2) % hours.length], k % 2 ? 30 : 0, visitsByClient[c.id][0]); } }
  // a private personal block and two website requests
  const pd = workDay(addDays(today, 2)); const ps = new Date(pd); ps.setHours(12, 0, 0, 0);
  T.book_appointments.push({ id: id('ap'), book_id: BOOK, client_id: null, starts_at: ps.toISOString(), ends_at: new Date(ps.getTime() + 36e5).toISOString(), status: 'booked', source: 'app', notify: false, created_at: ps.toISOString(), data: { clientName: 'Dentist', personal: true } });
  [['Brooke Adams', ['Balayage'], 'Afternoon', 'New client', 'Saw your balayage on Instagram!'], ['Leah Kim', ['Cut', 'Gloss / glaze'], 'Morning', 'Returning client', '']].forEach(([name, svcs, when, type, note], k) => {
    const d = workDay(addDays(today, 4 + k * 3)); d.setHours(k ? 10 : 14, 0, 0, 0);
    T.book_appointments.push({ id: id('rq'), book_id: BOOK, client_id: null, starts_at: d.toISOString(), ends_at: new Date(d.getTime() + 72e5).toISOString(), status: 'requested', source: 'website', notify: true, created_at: now.toISOString(),
      data: { clientName: name, email: name.split(' ')[0].toLowerCase() + '@example.com', phone: '(555) 555-019' + k, services: svcs, notes: note, request: { firstChoice: iso(d), secondChoice: '', preferredTime: when, clientType: type, contactPreference: 'Text', referredBy: '' } } });
  });

  // business expenses for the past year
  for (let mth = 0; mth < 12; mth++) { const d = new Date(today.getFullYear(), today.getMonth() - mth, 1);
    const ex = (day, category, amount, vendor) => { const dt = iso(new Date(d.getFullYear(), d.getMonth(), day)); if (dt > iso(today)) return;
      T.book_expenses.push({ id: id('x'), book_id: BOOK, date: dt, data: { date: dt, category, amount, miles: null, vendor, note: '', payment: 'Card', bizPct: 100, updatedAt: now.toISOString() } }); };
    ex(1, 'rent', 650, 'Salon suites'); ex(8, 'supplies', 180 + Math.round(rnd() * 120), 'Beauty supply'); ex(15, 'phone', 85, 'Phone bill'); ex(20, 'fees', 25 + Math.round(rnd() * 20), 'Card fees');
    if (mth % 3 === 0) ex(12, 'resale', 160, 'Product order'); if (mth === 4) ex(18, 'education', 249, 'Color class'); }
  T.book_expenses.forEach(e => { if (e.data.category === 'phone') e.data.bizPct = 60; });

  const lastMon = addDays(today, -((today.getDay() + 6) % 7) - 7);
  T.book_reports.push({ id: 'rp1', book_id: BOOK, period: 'week', period_start: iso(lastMon), created_at: now.toISOString(),
    title: 'Your week: ' + lastMon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + addDays(lastMon, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    body: "## Last week\n- **14 clients** over 4 days\n- Busiest: **Thursday** with 5\n## This week\n- 12 booked so far, Saturday morning is open\n## Tips\n- A few regulars are past their usual time. Check **Time to reach out** on Today.\n- Highlights clients book 9 weeks out; offer the next one at checkout." });

  T.book_intake = [{ id: 'ik1', book_id: BOOK, client_id: null, status: 'new', created_at: new Date(Date.now() - 12 * 6e4).toISOString(),
    data: { firstName: 'Brooke', lastName: 'Adams', phone: '(555) 555-0190', email: 'brooke@example.com', birthday: '04-22', contact: 'Text', textOk: true, texture: 'Wavy',
      history: ['Box dye', 'Bleach / lightener'], lastColor: 'Box dye in July, highlights last year', allergies: 'Sensitive scalp', products: 'Drugstore shampoo, flat iron',
      goals: 'Soft lived-in balayage, less orange', dislikes: 'Nothing too ashy', often: 'Every 2–3 months', heard: 'Instagram', photos: 'Hair only, no face', agree: true, signed: 'Brooke Adams', inSalon: true } }];
  window.__T = T;
  function q(table) {
    let filters = [], ord = null, rng = null, single = false, maybe = false, op = 'select', payload = null;
    const b = {
      select() { return b; }, eq(k, v) { filters.push(r => r[k] === v); return b; }, gte(k, v) { filters.push(r => r[k] >= v); return b; }, lte(k, v) { filters.push(r => r[k] <= v); return b; },
      in(k, v) { filters.push(r => v.includes(r[k])); return b; }, is(k, v) { filters.push(r => r[k] === v); return b; }, neq(k, v) { filters.push(r => r[k] !== v); return b; },
      order(k, o) { ord = [k, o && o.ascending === false]; return b; }, range(a, z) { rng = [a, z]; return b; }, limit(n) { rng = [0, n - 1]; return b; },
      single() { single = true; return b; }, maybeSingle() { maybe = true; return b; },
      upsert(p) { op = 'upsert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; }, delete() { op = 'delete'; return b; }, insert(p) { op = 'insert'; payload = p; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); }
    };
    function run() {
      T[table] = T[table] || [];
      const keyOf = r => table === 'book_settings' ? r.book_id : r.id;
      if (op === 'upsert' || op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload]; const out = [];
        list.forEach(p => { if (!p.id && table !== 'book_settings') p = { id: id('n'), ...p }; const i = T[table].findIndex(r => keyOf(r) === keyOf(p));
          if (i >= 0) { const n = { ...T[table][i], ...p }; T[table][i] = n; out.push(n); }
          else { const n = { notify: true, status: 'booked', confirm_sent_at: null, reminder_sent_at: null, created_at: new Date().toISOString(), ...p }; T[table].push(n); out.push(n); } });
        return { data: single ? JSON.parse(JSON.stringify(out[0])) : out, error: null };
      }
      let r = T[table].filter(x => filters.every(f => f(x)));
      if (op === 'delete') { T[table] = T[table].filter(x => !r.includes(x)); return { error: null }; }
      if (op === 'update') { r.forEach(x => Object.assign(x, payload)); return { data: r, error: null }; }
      if (ord) r = [...r].sort((a, c) => String(a[ord[0]]).localeCompare(String(c[ord[0]])) * (ord[1] ? -1 : 1));
      if (rng) r = r.slice(rng[0], rng[1] + 1);
      r = JSON.parse(JSON.stringify(r));
      if (single || maybe) return { data: r[0] || null, error: null };
      return { data: r, error: null };
    }
    return b;
  }
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: U } } }), onAuthStateChange() {}, signOut: async () => {}, updateUser: async () => ({}) },
    from: q, rpc: async () => ({ data: null, error: null }),
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {},
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrls: async () => ({ data: [] }), remove: async () => ({}) }) },
    functions: { invoke: async (name, { body } = {}) => {
      if (name === 'book-ai') return body && body.ping ? { data: { ready: false } } : { data: null, error: { message: 'The assistant is turned off in the demo.' } };
      if (body && body.action === 'ping') return { data: { ready: true } };
      return { data: { ok: true, sent: true, demo: true, to: 'demo inbox' } }; // pretend the email went out
    } }
  }) };
})();
