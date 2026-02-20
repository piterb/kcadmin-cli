import { color } from "./colors.js";

export function printSummary({ ok, details = [] }) {
  if (ok) {
    console.log(color.green("PASS") + " operation succeeded");
  } else {
    console.error(color.red("FAIL") + " operation failed");
  }

  if (details.length > 0) {
    console.log(color.cyan("Details:"));
    for (const line of details) {
      console.log(`- ${line}`);
    }
  }
}

export function printResult(message, details = []) {
  printSummary({ ok: true, details: [message, ...details] });
}
