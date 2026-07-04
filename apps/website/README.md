# Tandem launch website

Static, single-file launch site for Tandem. No build step, no dependencies.

## Preview locally

```bash
npx serve apps/website
# or
python3 -m http.server 8080 --directory apps/website
```

## Deploy

It's one `index.html` — host it anywhere:

- **GitHub Pages:** point Pages at this folder (or copy `index.html` to a `gh-pages` branch).
- **Vercel / Netlify:** set the project root to `apps/website`, no build command needed.
