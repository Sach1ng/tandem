# Pip launch website

Static site for Pip — no build step, no dependencies. Deployed to **GitHub Pages**.

**Live:** https://hardiktiwari.github.io/tandem-site/  
**Roadmap demo:** https://hardiktiwari.github.io/tandem-site/roadmap.html

## Preview locally

```bash
npm run roadmap:open
# or
python3 -m http.server 8080 --directory apps/website
# → http://127.0.0.1:8080/roadmap.html
```

## Deploy

Edit files here, then publish to **`hardiktiwari/tandem-site`** (push to `main` on that repo).

Do **not** use `Sach1ng/tandem` GitHub Pages (`sach1ng.github.io/tandem`) as the live deploy target.

Put all shareable HTML here (`index.html`, `roadmap.html`, etc.) — not the repo root.
