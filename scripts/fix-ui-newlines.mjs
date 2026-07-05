import { readFileSync, writeFileSync } from 'fs';

const p = 'src/ui/index.ts';
let s = readFileSync(p, 'utf-8');

// Fix 1: line ~260 — remove leading \n before initial prompt
// Old: process.stdout.write('\n' + c.magenta('> ') + '\x1b[?25h');
// New: process.stdout.write(c.magenta('> ') + '\x1b[?25h');
s = s.replace(
  "process.stdout.write('\\n' + c.magenta('> ') + '\\x1b[?25h');\n",
  "process.stdout.write(c.magenta('> ') + '\\x1b[?25h');\n"
);

// Fix 2: line ~287 — bare \n on empty Enter should not blank the line
// Old: process.stdout.write('\n');
// New: just redraw the prompt (no blank line)
s = s.replace(
  "finalize(line);\n            process.stdout.write('\\n');\n            resolve(line);",
  "finalize(line);\n            process.stdout.write('\\r' + c.magenta('> '));\n            resolve(line);"
);

// Fix 3: line ~330 — bare \n on plain Enter (no dropdown) should not blank
// Old: process.stdout.write('\n');
// New: redraw prompt cleanly
s = s.replace(
  "finalize(line);\n    process.stdout.write('\\n');\n    resolve(line);",
  "finalize(line);\n    process.stdout.write('\\r' + c.magenta('> '));\n    resolve(line);"
);

// Fix 4: line ~317 — ctrl+c: no blank \n before resolve
s = s.replace(
  "process.stdout.write('\\n');\n  finalize(line);\n  resolve(null as unknown as string);",
  "process.stdout.write('\\r' + c.magenta('> '));\n  finalize(line);\n  resolve(null as unknown as string);"
);

writeFileSync(p, s);
console.log('Fixed newline issues in src/ui/index.ts');
