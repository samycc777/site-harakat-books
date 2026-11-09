#!/usr/bin/env python3
"""Tell Bing, Yandex and the other IndexNow engines about changed pages (Google doesn't use IndexNow:
it reads public/sitemap.xml). Usage: indexnow.py all | indexnow.py changed <old commit> (deploy.yml)."""
import json, subprocess, sys, urllib.request, re, os

SITE, KEY = 'https://kutub-mashkulah.pages.dev', '83fe532df8714c486724cf4da39cf02b'  # key file: public/83fe532df8714c486724cf4da39cf02b.txt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if sys.argv[1] == 'all':
    urls = re.findall(r'<loc>(.*?)</loc>', open(os.path.join(ROOT, 'public/sitemap.xml')).read())
else:
    r = subprocess.run(['git', 'diff', '--name-only', sys.argv[2], 'HEAD', '--', 'public/index.html', 'public/*/index.html'],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode: sys.exit(f'git diff failed: {r.stderr.strip()}')  # old commit not fetched: caller falls back
    files = r.stdout.split()
    urls = [SITE + '/' + f[len('public/'):-len('index.html')] for f in files if os.path.exists(os.path.join(ROOT, f))]
if not urls:
    sys.exit(print('nothing changed'))
req = urllib.request.Request('https://api.indexnow.org/indexnow', method='POST',
                             data=json.dumps({'host': 'kutub-mashkulah.pages.dev', 'key': KEY,
                                              'keyLocation': f'{SITE}/{KEY}.txt', 'urlList': urls}).encode(),
                             headers={'content-type': 'application/json; charset=utf-8'})
with urllib.request.urlopen(req, timeout=30) as r:
    print(r.status, len(urls), 'URLs sent')
