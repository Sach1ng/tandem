import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTasksMarkdown } from "../src/parser.ts";

const file = resolve(process.cwd(), "../../tasks.example.md");
const parsed = parseTasksMarkdown(readFileSync(file, "utf8"));

console.log("openCount     :", parsed.openCount);
console.log("sectionCounts :", parsed.sectionCounts);
console.log("tasks:");
for (const t of parsed.tasks) {
  console.log(`  ${t.id} [${t.section}] p=${t.priority ?? "-"} tags=${t.tags.join(",") || "-"} :: ${t.title}`);
  if (Object.keys(t.meta).length) console.log("      meta:", t.meta);
}

const archived = parsed.bySection.active.concat(parsed.bySection.needs_triage).filter((t) => t.done);
console.log("\nassert: no Archive task leaked in →", archived.length === 0 ? "PASS" : "FAIL");
console.log("assert: openCount === 5 →", parsed.openCount === 5 ? "PASS" : `FAIL (${parsed.openCount})`);
