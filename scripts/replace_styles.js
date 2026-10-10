import fs from 'fs';
import path from 'path';

// Patterns to replace
const replacements = [
  // Border radius
  { regex: /borderRadius:\s*'8px'/g, repl: "borderRadius: 'var(--radius-md)'" },
  { regex: /borderRadius:\s*'6px'/g, repl: "borderRadius: 'var(--radius-sm)'" },
  { regex: /borderRadius:\s*'10px'/g, repl: "borderRadius: 'var(--radius-lg)'" },
  { regex: /borderRadius:\s*'12px'/g, repl: "borderRadius: 'var(--radius-lg)'" },
  { regex: /borderRadius:\s*'16px'/g, repl: "borderRadius: 'var(--radius-xl)'" },
  
  // Transitions
  { regex: /transition:\s*'all\s+0\.2s\s+ease'/g, repl: "transition: 'all var(--ease)'" },
  { regex: /transition:\s*'all\s+0\.15s\s+ease'/g, repl: "transition: 'all var(--ease)'" },
  { regex: /transition:\s*'all\s+0\.3s\s+ease'/g, repl: "transition: 'all var(--ease)'" },
  { regex: /transition:\s*'color\s+0\.15s\s+ease'/g, repl: "transition: 'color var(--ease)'" },
  { regex: /transition:\s*'color\s+0\.2s\s+ease'/g, repl: "transition: 'color var(--ease)'" },

  // Colors / Backgrounds
  { regex: /background:\s*'rgba\(255,\s*255,\s*255,\s*0\.0[12]\)'/g, repl: "background: 'var(--bg-tertiary)'" },
  { regex: /border:\s*'1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.15\)'/g, repl: "border: '1px solid var(--border)'" },
  { regex: /border:\s*'1px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.08\)'/g, repl: "border: '1px solid var(--border)'" },
  
  // Hardcoded danger/success background opacities (0.1 -> var glow)
  { regex: /background:\s*'rgba\(239,\s*68,\s*68,\s*0\.1\)'/g, repl: "background: 'var(--danger-glow)'" },
  { regex: /border:\s*'1px\s+solid\s+rgba\(239,\s*68,\s*68,\s*0\.2\)'/g, repl: "border: '1px solid var(--danger)'" },
  
  { regex: /background:\s*'rgba\(59,\s*130,\s*246,\s*0\.1\)'/g, repl: "background: 'var(--accent-glow)'" },
  { regex: /background:\s*'rgba\(76,\s*110,\s*245,\s*0\.1\)'/g, repl: "background: 'var(--accent-glow)'" },
  
  // Misc
  { regex: /color:\s*'#fca5a5'/g, repl: "color: 'var(--danger-text)'" }
];

function getFiles(dir) {
  const files = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      files.push(...getFiles(filePath));
    } else if (file.endsWith('.jsx')) {
      files.push(filePath);
    }
  }
  return files;
}

const files = getFiles(path.join('D:/Barventis', 'src'));
let modifiedCount = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content;
  
  for (const { regex, repl } of replacements) {
    newContent = newContent.replace(regex, repl);
  }
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    modifiedCount++;
    console.log(`Modified: ${path.relative('D:/Barventis', file)}`);
  }
}

console.log(`\nCompleted! Modified ${modifiedCount} files.`);
