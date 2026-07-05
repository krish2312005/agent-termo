import re

with open('src/ui/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Remove leading \n from initial prompt (line 260)
content = content.replace(
    "// Draw initial prompt\n    process.stdout.write('\\n' + c.magenta('> ') + '\\x1b[?25h');",
    "// Draw initial prompt\n    process.stdout.write(c.magenta('> ') + '\\x1b[?25h');"
)

# Fix 2: Remove bare process.stdout.write('\\n') followed by resolve in dropdown no-items branch
# Pattern: finalize(line); \n process.stdout.write('\n'); \n resolve(line);
content = content.replace(
    """              finalize(line);
              process.stdout.write('\\n');
              resolve(line);""",
    """              finalize(line);
              process.stdout.write('\\r' + c.magenta('> '));
              resolve(line);"""
)

# Fix 3: Remove bare process.stdout.write('\\n') followed by resolve in plain Enter handler
# Pattern: if (keyName === 'return' || keyName === 'enter') {\n    finalize(line);\n    process.stdout.write('\n');\n    resolve(line);
content = content.replace(
    """  if (keyName === 'return' || keyName === 'enter') {
    finalize(line);
    process.stdout.write('\\n');
    resolve(line);""",
    """  if (keyName === 'return' || keyName === 'enter') {
    finalize(line);
    resolve(line);"""
)

# Fix 4: Remove process.stdout.write('\\n'); before finalize in ctrl+c handler
content = content.replace(
    "      process.stdout.write('\\n');\n      finalize(line);\n      resolve(null as unknown as string);",
    "      finalize(line);\n      resolve(null as unknown as string);"
)

# Fix 5: Remove trailing \n from selected command display (line 283)
# Keep the \n after displaying - actually this one is OK since it ends the line
# But let's make it cleaner - remove the \n from the display and let resolve handle it
# Actually skip this one - it properly shows the command then breaks line

with open('src/ui/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixes applied successfully")
