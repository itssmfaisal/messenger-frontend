const fs = require('fs');
let content = fs.readFileSync('app/login/page.tsx', 'utf8');

content = content.replace(/bg-\[\#dce9e7\]/g, 'bg-[#dce9e7] dark:bg-gray-950');
content = content.replace(/bg-\[\#f3f5f5\]/g, 'bg-[#f3f5f5] dark:bg-gray-900');
content = content.replace(/bg-\[\#d9e3f0\]/g, 'bg-[#d9e3f0] dark:bg-gray-800');
content = content.replace(/border-\[\#c7ced8\]/g, 'border-[#c7ced8] dark:border-gray-700');
content = content.replace(/text-slate-900/g, 'text-slate-900 dark:text-white');
content = content.replace(/bg-\[\#dff6f0\]/g, 'bg-[#dff6f0] dark:bg-[#13C9A0]/20');
content = content.replace(/text-slate-500/g, 'text-slate-500 dark:text-gray-400');

fs.writeFileSync('app/login/page.tsx', content, 'utf8');
