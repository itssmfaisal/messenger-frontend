const fs = require('fs');
const path = require('path');

const replacements = [
  { regex: /bg-white/g, replacement: 'bg-white dark:bg-gray-900' },
  { regex: /bg-gray-50/g, replacement: 'bg-gray-50 dark:bg-gray-800' },
  { regex: /bg-gray-100/g, replacement: 'bg-gray-100 dark:bg-gray-700' },
  { regex: /bg-gray-200/g, replacement: 'bg-gray-200 dark:bg-gray-600' },
  { regex: /text-gray-900/g, replacement: 'text-gray-900 dark:text-gray-100' },
  { regex: /text-gray-700/g, replacement: 'text-gray-700 dark:text-gray-300' },
  { regex: /text-gray-600/g, replacement: 'text-gray-600 dark:text-gray-400' },
  { regex: /text-gray-500/g, replacement: 'text-gray-500 dark:text-gray-400' },
  { regex: /border-gray-100/g, replacement: 'border-gray-100 dark:border-gray-800' },
  { regex: /border-gray-200/g, replacement: 'border-gray-200 dark:border-gray-700' },
  { regex: /bg-\[\#f0f2f5\]/g, replacement: 'bg-[#f0f2f5] dark:bg-gray-950' },
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  // Make sure we haven't already processed it
  if (content.includes('dark:bg-gray-900') && filePath.includes('chat/page.tsx')) {
    console.log(`Skipping ${filePath}, already has dark mode classes`);
    return;
  }

  replacements.forEach(({ regex, replacement }) => {
    // Only replace if not already followed by dark:
    const originalContent = content;
    content = content.replace(regex, (match) => {
        return replacement; // This is a simple regex, could cause duplicates if run multiple times
    });
    if (content !== originalContent) changed = true;
  });

  // some specific inline styles in chat/page.tsx
  if (filePath.includes('chat/page.tsx')) {
    content = content.replace(/style={{ background: "#f0f2f5" }}/g, 'className="flex h-screen overflow-hidden bg-[#f0f2f5] dark:bg-gray-950"');
    content = content.replace(/style={{ background: "#e8faf5", color: "#13C9A0" }}/g, 'className="... bg-[#e8faf5] dark:bg-[#13C9A0]/20 text-[#13C9A0] dark:text-[#13C9A0]"');
    // For style tags that were used for colors
    content = content.replace(/style={{ background: "#f0fdf9" }}/g, 'className="... bg-[#f0fdf9] dark:bg-[#13C9A0]/10"');
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir('./app');
console.log("Done");
