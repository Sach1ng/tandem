# Tandem launch website

Static site for Tandem — no build step, no dependencies. Deployed to **GitHub Pages**.

**Live:** https://sach1ng.github.io/tandem/  
**Roadmap demo:** https://sach1ng.github.io/tandem/roadmap.html

## Preview locally

```bash
npm run roadmap:open
# or
python3 -m http.server 8080 --directory apps/website
# → http://127.0.0.1:8080/roadmap.html
```

## Deploy

Push to `main`. The workflow at `.github/workflows/deploy-pages.yml` publishes `apps/website/` automatically.

**First-time setup (once per repo):** GitHub → Settings → Pages → Build and deployment → Source: **GitHub Actions**.

Put all shareable HTML here (`index.html`, `roadmap.html`, etc.) — not the repo root.
