import { readFileSync, writeFileSync } from 'fs';

const p = 'src/ui/index.ts';
let s = readFileSync(p, 'utf-8');

// Fix A: line ~287 — inside Enter handler, no-items branch
// Context: inside the "else" branch where items.length === 0
// Change from just writing \n to NOT printing blank lines
s = s.replace(
  `} else {
               finalize(line);
               process.stdout.write('\\n');
               resolve(line);
             }`,
  `} else {
               // User submitted plain text without dropdown — resolve
               finalize(line);
               resolve(line);
             }`
);

// Fix B: line ~317 — ctrl+c handler
// Remove the newline that creates a blank line on ctrl+c
s = s.replace(
  `if (keyName === 'ctrl+c') {
           process.stdout.write('\\n');
           finalize(line);`,
  `if (keyName === 'ctrl+c') {
           finalize(line);`
);

// Fix C: line ~330 — plain Enter handler (no dropdown visible)
// Remove the newline that creates blank lines
s = s.replace(
  `if (keyName === 'return' || keyName === 'enter') {
         finalize(line);
         process.stdout.write('\\n');
         resolve(line);
         return;
       }`,
  `if (keyName === 'return' || keyName === 'enter') {
         finalize(line);
         process.stdout.write('\\r' + c.magenta('> '));
         resolve(line);
         return;
       }`
);

writeFileSync(p, s);
console.log('Applied newline fixes to src/ui/index.ts');
