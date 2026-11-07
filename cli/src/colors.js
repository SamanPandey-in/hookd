// Minimal ANSI color helpers — no runtime dependency. Colors are disabled when
// stdout is not a TTY or when NO_COLOR is set (https://no-color.org).
const enabled = Boolean(process.stdout && process.stdout.isTTY) && !process.env.NO_COLOR;

function wrap(open, close) {
  return (s) => (enabled ? `\u001b[${open}m${s}\u001b[${close}m` : String(s));
}

export const colors = {
  enabled,
  dim: wrap(2, 22),
  bold: wrap(1, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};
