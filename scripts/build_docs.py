# -*- coding: utf-8 -*-
import os
import base64
import sys

from parts_styles import CSS_STYLES, JS_SCRIPTS
from parts_nav_hero import NAV_AND_HERO, LIGHTBOX_HTML
from parts_sec1_sec3 import SECTIONS_1_TO_3
from parts_sec12_sec13 import SECTIONS_12_AND_13
from parts_sec4_rest import SECTION_REST_API
from parts_sec5_sec7 import SECTIONS_5_TO_7
from parts_sec8_sec11 import build_sections_8_to_11

def get_base64(path):
    p = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', path))
    if not os.path.exists(p):
        print(f'Warning: {path} not found at {p}')
        return ''
    ext = path.split('.')[-1].lower()
    if ext == 'jpg': ext = 'jpeg'
    with open(p, 'rb') as f:
        return f'data:image/{ext};base64,' + base64.b64encode(f.read()).decode('utf-8')

print('Encoding assets to Base64...')
b64_dash1 = get_base64('dashboard-1.png')
b64_trail = get_base64('shots/dashboard-trail.png')
b64_super_dash = get_base64('shots/super-dashboard.png')
b64_user_dash = get_base64('shots/user-dashboard.png')
b64_super_cust = get_base64('shots/super-customers.png')
print('Assets successfully encoded.')

print('Assembling HTML document...')
sec8_11 = build_sections_8_to_11(b64_dash1, b64_trail, b64_super_dash, b64_user_dash, b64_super_cust)

full_html = f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live GPS Fleet Tracking — Enterprise ERP Integration & API Reference</title>
  <meta name="description" content="Comprehensive enterprise integration guide and technical API specification for connecting ERP systems (Odoo, SAP, Dynamics, ERPNext) to the Live GPS Fleet Tracking platform.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
{CSS_STYLES}
  </style>
</head>
<body>

{NAV_AND_HERO}

{SECTIONS_1_TO_3}

{SECTIONS_12_AND_13}

{SECTION_REST_API}

{SECTIONS_5_TO_7}

{sec8_11}

{LIGHTBOX_HTML}

<script>
{JS_SCRIPTS}
</script>

</body>
</html>
"""

root_dest = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'ERP_INTEGRATION_DOCUMENTATION.html'))
public_dest = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'public', 'docs.html'))

with open(root_dest, 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f'Wrote master documentation to: {root_dest} ({len(full_html)} bytes)')

with open(public_dest, 'w', encoding='utf-8') as f:
    f.write(full_html)
print(f'Wrote copy to web public folder: {public_dest}')

print('Documentation build completed successfully!')
