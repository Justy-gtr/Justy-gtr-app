import fs from "node:fs";
import { inAfternoonRefresh } from "../js/afternoon.js";

const force = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" || process.argv.includes("--force");
const run = force || inAfternoonRefresh(new Date());
const line = `run=${run ? "true" : "false"}\n`;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
console.log(`${line.trim()} berlin afternoon`);
