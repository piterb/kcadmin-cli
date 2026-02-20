const isTty = process.stdout.isTTY;

function wrap(code, text) {
  if (!isTty) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export const color = {
  green: (text) => wrap("32", text),
  red: (text) => wrap("31", text),
  yellow: (text) => wrap("33", text),
  cyan: (text) => wrap("36", text),
  bold: (text) => wrap("1", text)
};
