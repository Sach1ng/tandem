# Knowledge index

**Start here for PM work.** Read this file first, then open only the paths that match the task.
Do not invent strategy, metrics, or product facts — cite the linked files and dates you used.

---

## Quick routing

| If you need… | Open first |
|---|---|
| **Product context** (what we're building, scope, hypothesis) | [Active KB → Products](#active-knowledge-base-hardiks-pm-os) → `brief.md` for that product |
| **Roadmap / priorities** | Product `roadmap.md` or `STATUS.md` |
| **Metrics / targets** | Product `metrics.md` |
| **Status / exec update** | Product `updates.md` + `memory/` + skill `exec-communicator` or `stakeholder-update` |
| **PRD or spec** | `external/pm-operating-os/skills/prd-writer/SKILL.md` |
| **One-pager / alignment doc** | `external/pm-operating-os/skills/one-pager/SKILL.md` |
| **Launch** | `launch-readiness` → `launch-post` skills |
| **Decision log** | `decision-logger` skill → `memory/` |
| **Experiment design / writeup** | `experiment-designer` → `experiment-writeup` |
| **Strategy fit check** | `strategy-connector` or `what-if` + knowledge strategy files |
| **Meeting → actions** | `meeting-to-actions` skill |
| **Deep research / benchmarks** | [Research skills](#research-pipeline-cursor) |
| **Tooling (Slack, Jira, Figma, etc.)** | [MCP setup](#external--tooling-links) |

---

## Tandem workspace (this repo)

| Resource | Path | Purpose |
|---|---|---|
| Workspace charter | [`AGENTS.md`](../AGENTS.md) | Pip persona, memory rules, PM routing |
| Architecture | [`docs/architecture.md`](../docs/architecture.md) | Surfaces, engine, brain layers |
| Product overview | [`README.md`](../README.md) | Tandem / Pip positioning, quickstart |
| Launch site | [`apps/website/index.html`](../apps/website/index.html) | Public messaging |
| Session memory | [`memory/log.md`](../memory/log.md) | Dated decisions and outcomes |
| User profile | [`memory/profile.md`](../memory/profile.md) | Durable preferences (create if missing) |
| Cross-surface activity | [`memory/activity.md`](../memory/activity.md) | Recent work (auto-maintained) |
| Tasks board | [`tasks.example.md`](../tasks.example.md) | Pip task capture (or your `tasks.md`) |

---

## Active knowledge base (Hardik's PM OS)

Configured in Pip as **`knowledgeBase`**: `/Users/hardiktiwar/Desktop/PM OS`  
(Also mountable via `TANDEM_WORKSPACE` / `tandem init`.)

**Product dossier pattern:** `knowledge/products/<product>/` — see
[`knowledge/products/README.md`](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/README.md).

### Products

| Product | Brief | Roadmap | Metrics | Status / updates |
|---|---|---|---|---|
| **Shopify Autoresearch** | [brief.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/brief.md) | [roadmap.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/roadmap.md) | [metrics.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/metrics.md) | [STATUS.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/STATUS.md) · [updates.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/updates.md) |
| **Otira** | [brief.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/otira/brief.md) | [roadmap.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/otira/roadmap.md) | [metrics.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/otira/metrics.md) | [updates.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/otira/updates.md) |

**Shopify Autoresearch — deep refs**

| Doc | Link |
|---|---|
| Autoresearch loop | [AUTORESEARCH_LOOP.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/AUTORESEARCH_LOOP.md) |
| Safe autonomy spec | [SHOPIFY_SAFE_AUTONOMY_SPEC.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/SHOPIFY_SAFE_AUTONOMY_SPEC.md) |
| Experiment template | [experiments/_template.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/experiments/_template.md) |
| Release template | [releases/release-template.md](file:///Users/hardiktiwar/Desktop/PM%20OS/knowledge/products/shopify-autoresearch/releases/release-template.md) |

**PM OS memory (active install)**

| Resource | Path |
|---|---|
| Learning log | `/Users/hardiktiwar/Desktop/PM OS/memory/learning-log/` |
| Strategy reviews | `/Users/hardiktiwar/Desktop/PM OS/memory/strategy-reviews/` |
| PM OS config | `/Users/hardiktiwar/Desktop/PM OS/config/pm-os-config.yaml` |

---

## PM OS submodule (bundled with Tandem)

Path: [`external/pm-operating-os/`](../external/pm-operating-os/)

| Resource | Link |
|---|---|
| PM OS overview | [`README.md`](../external/pm-operating-os/README.md) |
| Chief of staff charter | [`AGENTS.md`](../external/pm-operating-os/AGENTS.md) |
| Workflow map | [`docs/agents.md`](../external/pm-operating-os/docs/agents.md) |
| MCP setup | [`MCP_SETUP.md`](../external/pm-operating-os/MCP_SETUP.md) |
| Onboarding | [`ONBOARDING.md`](../external/pm-operating-os/ONBOARDING.md) |
| Knowledge template | [`knowledge/_template/`](../external/pm-operating-os/knowledge/_template/) |
| Example companies (Spotify, Netflix, Shopify, Uber) | [`knowledge/examples/`](../external/pm-operating-os/knowledge/examples/README.md) |

### PM skills (canonical)

Path: [`external/pm-operating-os/skills/`](../external/pm-operating-os/skills/)

| Phase | Skills |
|---|---|
| **Plan** | [`strategy-connector`](../external/pm-operating-os/skills/strategy-connector/SKILL.md) · [`working-backwards`](../external/pm-operating-os/skills/working-backwards/SKILL.md) · [`brainstorming`](../external/pm-operating-os/skills/brainstorming/SKILL.md) · [`what-if`](../external/pm-operating-os/skills/what-if/SKILL.md) |
| **Build** | [`prd-writer`](../external/pm-operating-os/skills/prd-writer/SKILL.md) · [`one-pager`](../external/pm-operating-os/skills/one-pager/SKILL.md) · [`experiment-designer`](../external/pm-operating-os/skills/experiment-designer/SKILL.md) |
| **Ship** | [`launch-readiness`](../external/pm-operating-os/skills/launch-readiness/SKILL.md) · [`launch-post`](../external/pm-operating-os/skills/launch-post/SKILL.md) |
| **Communicate** | [`exec-communicator`](../external/pm-operating-os/skills/exec-communicator/SKILL.md) · [`stakeholder-update`](../external/pm-operating-os/skills/stakeholder-update/SKILL.md) · [`writing-clearly`](../external/pm-operating-os/skills/writing-clearly/SKILL.md) · [`pptx-creator`](../external/pm-operating-os/skills/pptx-creator/SKILL.md) |
| **Learn** | [`experiment-writeup`](../external/pm-operating-os/skills/experiment-writeup/SKILL.md) · [`decision-logger`](../external/pm-operating-os/skills/decision-logger/SKILL.md) · [`knowledge-updater`](../external/pm-operating-os/skills/knowledge-updater/SKILL.md) · [`continual-learning`](../external/pm-operating-os/skills/continual-learning/SKILL.md) |
| **Operate** | [`meeting-to-actions`](../external/pm-operating-os/skills/meeting-to-actions/SKILL.md) |

**PRD templates:** [`skills/prd-writer/references/`](../external/pm-operating-os/skills/prd-writer/references/)

---

## Research pipeline (Cursor)

For benchmark, technology selection, or academic-style research — use in order:

| Step | Skill |
|---|---|
| 1. Outline | `~/.cursor/skills/research/SKILL.md` |
| 2. Deep dive | `~/.cursor/skills/research-deep/SKILL.md` |
| 3. Report | `~/.cursor/skills/research-report/SKILL.md` |

Optional supplements: `research-add-items`, `research-add-fields`.

---

## External & tooling links

| Resource | URL |
|---|---|
| PM Operating System (upstream) | https://github.com/hardiktiwari/PM-operating-OS |
| Tandem (upstream) | https://github.com/Sach1ng/tandem |
| Slack app / bot token | https://api.slack.com/apps |
| GitHub PAT (MCP) | https://github.com/settings/tokens |
| Figma PAT (MCP) | https://www.figma.com/settings |
| Atlassian MCP | https://mcp.atlassian.com/v1/mcp |
| Playwright MCP | https://github.com/microsoft/playwright-mcp |
| SEC EDGAR (public company research) | https://www.sec.gov/edgar/search/ |

**Example knowledge sources** (PM OS `knowledge/examples/`): Spotify, Netflix, Shopify, Uber — built from public 10-K, earnings, investor day materials. See [`knowledge/examples/README.md`](../external/pm-operating-os/knowledge/examples/README.md).

---

## Maintenance

- **New product:** copy `PM OS/knowledge/products/_template/` → rename; add a row to [Products](#products) above.
- **Strategy shift:** update product `brief.md` / `roadmap.md`; log one line in `memory/log.md`; consider `knowledge-updater` skill.
- **This index:** keep links current when products or paths change.
