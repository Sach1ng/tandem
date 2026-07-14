x`# My Tasks

Pip Clippy reads this file live. Edit it by hand, in Clippy, or let `capture`/`groom` update it.
Point Clippy at your real file by setting `tasksFile` in `apps/clippy/config.json`.

## Active (priority today)
- [ ] Ship the Pip launch post #project/tandem #p0
  - Due: 2026-07-02
  - Next action: record the 60s Slack + Clippy demo
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

## Archive
- [x] Draft the architecture diagram #project/tandem
