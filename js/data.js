import { appBase } from "./logic.js";

export const FILES = [
  "meta",
  "prices",
  "seasonality",
  "calendar",
  "posts",
  "favorites",
  "crowd",
  "promises",
  "production",
  "insiders",
  "briefing",
  "weekly",
  "daily_question",
  "glossary",
  "track_record",
  "alerts",
  "scenarios",
  "companies",
  "moonshots",
  "sentiment",
  "germany"
];

export async function loadData() {
  const base = appBase();
  const entries = await Promise.all(FILES.map(async (name) => {
    const response = await fetch(`${base}/data/${name}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${name} ${response.status}`);
    return [name, await response.json()];
  }));
  return Object.fromEntries(entries);
}
