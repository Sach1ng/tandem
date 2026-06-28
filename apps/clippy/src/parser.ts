export type SectionKey = "active" | "scheduled" | "waiting" | "needs_triage";

export interface Task {
  id: string; // "L" + 1-based line number; mutations rely on it
  line: number;
  done: boolean;
  title: string; // tags stripped
  rawTitle: string;
  section: SectionKey;
  tags: string[];
  priority: "p0" | "p1" | "p2" | null;
  meta: Record<string, string>;
  detail: string[];
}

export interface ParsedTasks {
  tasks: Task[]; // not-done, across all sections, in file order
  bySection: Record<SectionKey, Task[]>; // includes done
  openCount: number; // total not-done
  sectionCounts: Record<SectionKey, number>; // not-done per section
  parsedAt: number;
}

const SECTION_KEYS: SectionKey[] = ["active", "scheduled", "waiting", "needs_triage"];

/** Map a `## Header` (parentheticals stripped) to a bucket key, or null if it ends parsing. */
function sectionKeyFor(header: string): SectionKey | null | "stop" {
  const h = header.replace(/\(.*?\)/g, "").trim().toLowerCase();
  if (/^(archive|done|how to use)/.test(h)) return "stop";
  if (h.includes("active") || h.includes("key focus")) return "active";
  if (h.includes("scheduled")) return "scheduled";
  if (h.includes("waiting")) return "waiting";
  if (h.includes("needs triage") || h.includes("inbox")) return "needs_triage";
  return null; // unrecognized header inside the doc — ignore its tasks
}

const TASK_RE = /^-\s+\[([ xX])\]\s?(.*)$/;
const INDENT_RE = /^\s+-\s+(.*)$/;
const TAG_RE = /#([\w/.-]+)/g;
const PRIORITY_RE = /^p[012]$/;

export function parseTasksMarkdown(content: string): ParsedTasks {
  const lines = content.split("\n");
  const bySection: Record<SectionKey, Task[]> = {
    active: [],
    scheduled: [],
    waiting: [],
    needs_triage: [],
  };

  let section: SectionKey | null = null;
  let current: Task | null = null;
  let stopped = false;

  for (let i = 0; i < lines.length && !stopped; i++) {
    const line = lines[i]!;

    if (line.startsWith("## ") || line.trim() === "---") {
      if (line.trim() === "---") {
        stopped = true;
        break;
      }
      const key = sectionKeyFor(line.slice(3));
      if (key === "stop") {
        stopped = true;
        break;
      }
      section = key;
      current = null;
      continue;
    }

    if (!section) continue;

    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
      const done = taskMatch[1]!.toLowerCase() === "x";
      const rawTitle = taskMatch[2]!.trim();
      const tags: string[] = [];
      let priority: Task["priority"] = null;
      let m: RegExpExecArray | null;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(rawTitle))) {
        const tag = m[1]!;
        tags.push(tag);
        if (PRIORITY_RE.test(tag)) priority = tag as Task["priority"];
      }
      const title = rawTitle.replace(TAG_RE, "").replace(/\s{2,}/g, " ").trim();

      current = {
        id: `L${i + 1}`,
        line: i + 1,
        done,
        title,
        rawTitle,
        section,
        tags,
        priority,
        meta: {},
        detail: [],
      };
      bySection[section].push(current);
      continue;
    }

    const indentMatch = INDENT_RE.exec(line);
    if (indentMatch && current) {
      const body = indentMatch[1]!.trim();
      const kv = /^([A-Za-z][\w -]*):\s*(.+)$/.exec(body);
      if (kv) current.meta[kv[1]!.toLowerCase()] = kv[2]!.trim();
      else current.detail.push(body);
    }
  }

  const tasks: Task[] = [];
  const sectionCounts = { active: 0, scheduled: 0, waiting: 0, needs_triage: 0 } as Record<SectionKey, number>;
  for (const key of SECTION_KEYS) {
    for (const t of bySection[key]) {
      if (!t.done) {
        tasks.push(t);
        sectionCounts[key]++;
      }
    }
  }
  tasks.sort((a, b) => a.line - b.line);

  return {
    tasks,
    bySection,
    openCount: tasks.length,
    sectionCounts,
    parsedAt: Date.now(),
  };
}
