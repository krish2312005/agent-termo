import { readFileSync, writeFileSync } from 'fs';

const p = 'src/ui/index.ts';
let s = readFileSync(p, 'utf-8');

// Fix 1: Initial prompt — no leading \n
// Look for the exact line and replace
const oldPrompt = "process.stdout.write('\\n' + c.magenta('> ') + '\\x1b[?25h');";
const newPrompt = "process.stdout.write(c.magenta('> ') + '\\x1b[?25h');";
if (s.includes(oldPrompt)) {
 s = s.replace(oldPrompt, newPrompt);
 console.log('Fixed: initial prompt no leading newline');
} else {
 console.log('WARN: initial prompt already fixed or not found');
}

// Fix 2: Dropdown Enter handler — no-items branch
// Look for the pattern inside the dropdown enter handler
const oldEnterNoItems = "} else {\n               finalize(line);\n               process.stdout.write('\\n');\n               resolve(line);\n             }";
const newEnterNoItems = "} else {\n               finalize(line);\n               process.stdout.write('\\r' + c.magenta('> '));\n               resolve(line);\n             }";
if (s.includes(oldEnterNoItems)) {
 s = s.replace(oldEnterNoItems, newEnterNoItems);
 console.log('Fixed: dropdown enter no-items branch');
} else {
 console.log('WARN: dropdown enter no-items already fixed or not found');
}

// Fix 3: Plain Enter handler (no dropdown)
const oldPlainEnter = "if (keyName === 'return' || keyName === 'enter') {\n    finalize(line);\n    process.stdout.write('\\n');\n    resolve(line);\n    return;\n  }";
const newPlainEnter = "if (keyName === 'return' || keyName === 'enter') {\n    finalize(line);\n    process.stdout.write('\\r' + c.magenta('> '));\n    resolve(line);\n    return;\n  }";
if (s.includes(oldPlainEnter)) {
 s = s.replace(oldPlainEnter, newPlainEnter);
 console.log('Fixed: plain enter handler');
} else {
 console.log('WARN: plain enter already fixed or not found');
}

// Fix 4: The one we missed earlier - process.stdout.write('\n') without proper context
// This is the leftover bare \n in the dropdown Enter else branch (lines 286-288)
const bareElsePattern = "process.stdout.write('\\n');\n            resolve(line);";
const fixedElsePattern = "process.stdout.write('\\r' + c.magenta('> '));\n            resolve(line);";
if (s.includes(bareElsePattern)) {
 s = s.replace(bareElsePattern, fixedElsePattern);
 console.log('Fixed: bare else branch newline');
} else {
 console.log('WARN: bare else already fixed or not found');
}

writeFileSync(p, s);
console.log('All fixes applied to src/ui/index.ts');
