#!/bin/bash
# Bilal runs this once: paste the fine-grained GitHub token (site-harakat-books only, Issues read/write).
# It becomes the Pages secret GITHUB_TOKEN, then the site redeploys so «إبلاغ عن خطأ» appears.
set -euo pipefail
read -rsp "Paste the GitHub token, then press Enter: " TOK; echo
code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOK" https://api.github.com/repos/samycc777/site-harakat-books)
[ "$code" = 200 ] || { echo "That token can't see samycc777/site-harakat-books (HTTP $code). Make it again."; exit 1; }
set -a; . ~/dev/archive-shaykh-bilal-salimi/.env.local >/dev/null 2>&1; set +a
cd "$(mktemp -d)"
printf %s "$TOK" | npx -y wrangler@4 pages secret put GITHUB_TOKEN --project-name kutub-mashkulah >/dev/null
gh workflow run deploy.yml -R samycc777/site-harakat-books
echo "Done: the token is saved and the site is redeploying (about 2 minutes)."
