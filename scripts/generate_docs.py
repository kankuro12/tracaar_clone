# -*- coding: utf-8 -*-
import os
import base64
import json

def get_base64_image(rel_path):
    full_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', rel_path))
    if not os.path.exists(full_path):
        print(f'Warning: {rel_path} not found at {full_path}')
        return ''
    ext = rel_path.split('.')[-1].lower()
    if ext == 'jpg': ext = 'jpeg'
    with open(full_path, 'rb') as img_file:
        encoded = base64.b64encode(img_file.read()).decode('utf-8')
    return f'data:image/{ext};base64,{encoded}'

print('Encoding screenshot assets to Base64...')
img_dashboard_1 = get_base64_image('dashboard-1.png')
img_dashboard_trail = get_base64_image('shots/dashboard-trail.png')
img_super_dashboard = get_base64_image('shots/super-dashboard.png')
img_user_dashboard = get_base64_image('shots/user-dashboard.png')
img_super_customers = get_base64_image('shots/super-customers.png')
print('Base64 encoding complete.')
