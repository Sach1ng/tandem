# My Tasks

Pip reads this file live. Edit it by hand, in Pip, or let `capture`/`groom` update it.
Point Pip at your real file by setting `tasksFile` in `apps/pip/config.json`.

## Active (priority today)
- [ ] Ship the Tandem launch post #project/tandem #p0
  - Due: 2026-07-02
  - Next action: record the 60s Slack + Pip demo
- [ ] Reply to design feedback on the widget #project/tandem #p1
  - Source: thread with @design

## Scheduled
- [ ] Add a browser-extension demo GIF #project/tandem #p2
  - Due: 2026-07-05

## Waiting
- [ ] Cursor API key for the cloud runtime experiment #project/tandem #p2
  - Blocked: waiting on access

## Needs triage
- [ ] Look into self-scheduling tasks like Claude Tag's ambient mode #from/self #p2
- [ ] please find out if open code has na #from/lens
  - Source: https://opencode.ai/workspace/wrk_01KW91APGJYTY5P0G0TBVZEDVN/billing
  - Page: opencode
  - Context: Default tiwari.hardik36@gmail.com Zen Go Usage API Keys Members Billing Settings Billing Manage payment methods. Contact us if you have any questions. $0.00 Current Balance Enable Billing Redeem Coupon Redeem a coupon code to claim credits or perks. Redeem ©2026 Anomaly Brand Privacy Terms English
  - Next action: please find out if open code has na. free models on github
  - Assigned: 2026-06-29 via Lens
  - Outcome: Searching for whether OpenCode offers free models on GitHub. Trying a read-only lookup since web tools were blocked: **Short answer:** OpenCode is free and open source on GitHub, but it does **not** give you unlimited free cloud models by default. Free usage usually means **local models** (e.g. Ollama) or **your own API keys**; hosted cloud access goes through **OpenCode Zen**, which is billing-based. --- ### What’s on GitHub - OpenCode is an open-source coding agent (Anomaly / formerly SST): [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) - The **CLI/tool is free**; models are a separate cost unless you run them locally. ### Free model options (typical setup) | Option | Cost | Notes | |--------|------|--------| | **Ollama / local models** | Free | Run models on your machine; OpenCode supports this | | **Your own API keys** | Depends on provider | Anthropic, OpenAI, Google, etc. | | **OpenCode Zen** (your billing page) | Paid / credits | You’re on **Zen**, **$0.00** balance, **Enable Billing** not turned on — no active paid credits | | **GitHub Models** | Limited free tier on GitHub | Unclear if OpenCode has a built-in “GitHub Models” provider without checking their docs/README | ### Your page context - Plan: **Zen** - Balance: **$0.00** - Billing: not enabled yet - Coupon redemption is available That points to **no hosted cloud usage until you add billing or redeem a coupon** — not a built-in unlimited free cloud tier on the billing page itself. ### What I couldn’t verify (live web blocked) I couldn’t fetch OpenCode’s current docs/README to confirm: - Exact list of free-tier cloud models on Zen - Whether **GitHub Models** is a first-class provider today **Practical next step:** In OpenCode, check **Settings → Models / Providers** (or the GitHub README “Providers” section) for Ollama vs Zen vs API keys. For zero cost, **Ollama** is the usual path. --- *Assumption: “na” in your task = “any”. Sources: your billing page excerpt (2026-06-29), gen…
- [ ] run a deep research on what this company does #from/lens
  - Source: https://www.agenticworkers.com/
  - Page: Agentic Workers
  - Context: · · · · ] · · · · 1 · · / · 1 · · · · · · · · · · · · · · · · · · · · · · · · · ] · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · [ · · · · / · · · · · · · · · / · · · · · · · # · · · · · · ? · · · * = · / · 0 · [ · · · · · · · · · · \ · · · · · ·
  - Next action: run a deep research on what this company does
  - Assigned: 2026-07-01 via Lens
  - Outcome: Page excerpt is mostly garbled — I'll pull the site and search for reliable info on Agentic Workers. Checking whether the workspace captured any other context for this page. **Could not complete deep research** — the captured page text is garbled (likely ASCII art or a JS-heavy layout Lens failed to extract), and live web lookup was blocked. No other references exist in the Tandem workspace. --- ### What is verified | Source | Fact | |--------|------| | Page title | **Agentic Workers** | | URL | [agenticworkers.com](https://www.agenticworkers.com/) | | Workspace (`tasks.example.md`, 2026-07-01) | Task assigned from this page; no company details stored | ### What the page excerpt suggests (not confirmed) The capture looks like decorative ASCII (`·`, `/`, `[`, `]`, `#`, etc.), not readable copy — so product, pricing, team, and positioning were **not** extracted. ### What’s missing for a real deep dive - Company description, product, and target customer - Founders / team and funding - How “agentic workers” are defined on the site (agents, marketplace, services, etc.) - Third-party sources (LinkedIn, Crunchbase, press, GitHub) ### How to finish this task 1. **Re-run in Agent mode** with web access enabled so the site and external sources can be fetched. 2. **Paste** visible page copy or a screenshot — Lens can parse that directly. 3. **Manual checks:** site footer (legal entity), `/about`, LinkedIn company page, and a web search for `"Agentic Workers" site:agenticworkers.com`. --- *Assumption: “deep research” means product, business model, team, and market positioning. Sources: page context (2026-07-01), `tasks.example.md`; no PM OS knowledge on this company.*
- [ ] Do a deep research on clueso #from/lens
  - Source: https://www.clueso.io/
  - Page: Clueso - Create incredible product videos, documentation, and more – in minutes, with AI.
  - Context: Product videos in minutes with AI Transform raw screen recordings into stunning videos & documentation. Start Free Trial Book a Demo Rough Recording With Clueso Unmute to hear the difference Backed by Rated 4.9 on G2.com Clueso has empowered our product team to create high-quality videos and training content 20x faster. Sean O’Donnell Director of Product Management Clueso's AI helps us quickly deliver clear, targeted training content. It has been a game-changer for supporting our frontline and …
  - Next action: Do a deep research on clueso
  - Assigned: 2026-07-01 via Lens
  - Outcome: Gathering Clueso details from the page context and external sources. **Clueso — research brief** (from [clueso.io](https://www.clueso.io/) page capture, 2026-07-01) --- ### What it is AI platform that turns **raw screen recordings** into **polished product videos + documentation** in minutes. Positioned for teams that need demo/training content without heavy video production. **Tagline:** “Product videos in minutes with AI” --- ### Core workflow 1. Record a rough screen capture 2. AI automates major edits (script, audio, polish) 3. Human fine-tunes — “everything is customizable” **Flagship AI features (from site):** - **Perfect Video Scripts** — removes filler, rewrites for clarity - **Automated video edits** — before/after demo (“Rough Recording” → “With Clueso”) - **Audio enhancement** — side-by-side audio comparison on homepage --- ### Who it’s for (from customer titles) | Segment | Roles cited | |--------|-------------| | Product | PM, Product Training & Enablement | | L&D / Learning | Director L&D, Associate Director Learning | | Customer-facing | CS, Customer Education, Scaled CX | | Production | Video Producer | **Use cases:** product demos, customer onboarding/training, internal enablement, support/education videos, workflow documentation. --- ### Social proof (page only) - **G2:** 4.9 rating - **“Backed by”** — backers not named in capture - **Named customers (testimonials):** Phenom, Duda, Darwinbox, plus others (titles only in excerpt) **Customer outcome claims (their words, not independently verified):** | Claim | Source | |-------|--------| | 20× faster video/training production | Sean O’Donnell, Phenom (Dir. PM) | | 8 training courses in one quarter | Cyrus Dorosti, Duda (VP CS) | | 100+ employees, 20+ depts in 1 year | Chaitanya Deepak, Darwinbox | | 2 days → 2 hours per video | Janice Weintraub, Customer Education | | 30+ videos/month, ~15 min each | Krish Ramineni (Co-founder & CEO — likely customer org, not Clueso) | --- ### GTM signals - **Start …

## Archive
- [x] Draft the architecture diagram #project/tandem
