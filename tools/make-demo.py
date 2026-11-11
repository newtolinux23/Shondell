#!/usr/bin/env python3
"""Build demo/index.html from book/index.html: same app, pretend salon, no real data.
Run again after changing the real app:  python3 tools/make-demo.py"""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
s = (root / 'book/index.html').read_text()
swaps = [
    ('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4"></script>', '<script src="demo-data.js"></script>'),
    ("if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});", "/* demo: no offline install */"),
    ("<title>Della's Client Book</title>", '<title>Client Book · Demo</title>\n<meta name="robots" content="noindex">'),
    ('Della · Curls &amp; Colors', 'Jordan · Demo Salon'),
    ('Della · Curls & Colors', 'Jordan · Demo Salon'),
    ("'Curls & Colors'", "'Demo Salon'"),
    ('Shondell Slaughter', 'Jordan Rivers'), ('Shondell’s', 'Jordan’s'), ('Shondell', 'Jordan'),
    ('https://shondellslaughter.com/', 'https://example.com/'), ('shondellslaughter.com', 'yoursalon.com'),
    ('(817) 480-6160', '(555) 555-0188'), ('(817)', '(555)'),
    ('DELLA-XXXXXXXX', 'DEMO'), ('@Della-Curls', '@your-venmo'), ('$DellaCurls', '$yourcashtag'),
    ('Della', 'Jordan'),
]
for a, b in swaps:
    s = s.replace(a, b)
s = re.sub(r'<link rel="manifest"[^>]*>', '', s)
s = re.sub(r"const SB_URL = '[^']*';", "const SB_URL = 'demo';", s)
s = re.sub(r"const SB_KEY = '[^']*';", "const SB_KEY = 'demo';", s)
banner = ('<div id="demo-bar" style="position:sticky;top:0;z-index:60;background:#1f1a14;color:#f6efe4;font:600 13px/1.35 system-ui,sans-serif;'
          'padding:8px 14px;text-align:center">Demo · made-up salon and clients · play freely, nothing is saved or sent '
          '<button onclick="location.reload()" style="margin-left:6px;background:none;border:1px solid #f6efe4;color:inherit;border-radius:99px;padding:2px 10px;font:inherit">Reset</button></div>')
s = s.replace('<body>', '<body>\n' + banner, 1)
left = [w for w in ('Della', 'Shondell', 'shondellslaughter', 'yxpjitdqqodfyqxvwglv', '817') if w in s]
if 'supabase-js' in s or left[:1] == ['Della']:
    sys.exit('demo build stopped: real-salon text left: ' + ', '.join(left))
(root / 'demo/index.html').write_text(s)
print('wrote demo/index.html; leftovers (ok if only the unused project URL):', left)
