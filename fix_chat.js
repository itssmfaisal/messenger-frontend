const fs = require('fs');
let content = fs.readFileSync('app/chat/page.tsx', 'utf8');

content = content.replace(/className="flex h-screen overflow-hidden" className="flex h-screen overflow-hidden bg-\[\#f0f2f5\] dark:bg-gray-950"/g, 'className="flex h-screen overflow-hidden bg-[#f0f2f5] dark:bg-gray-950"');

content = content.replace(/className="w-full h-10 rounded-xl flex items-center justify-center transition" className="\.\.\. bg-\[\#e8faf5\] dark:bg-\[\#13C9A0\]\/20 text-\[\#13C9A0\] dark:text-\[\#13C9A0\]" title="Chats"/g, 'className="w-full h-10 rounded-xl flex items-center justify-center transition bg-[#e8faf5] dark:bg-[#13C9A0]/20 text-[#13C9A0] dark:text-[#13C9A0]" title="Chats"');
content = content.replace(/className="mt-1\.5 md:mt-2 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1\.5 cursor-default" className="\.\.\. bg-\[\#e8faf5\] dark:bg-\[\#13C9A0\]\/20 text-\[\#13C9A0\] dark:text-\[\#13C9A0\]"/g, 'className="mt-1.5 md:mt-2 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-default bg-[#e8faf5] dark:bg-[#13C9A0]/20 text-[#13C9A0] dark:text-[#13C9A0]"');

content = content.replace(/className="w-24 h-24 rounded-full border-4 border-dashed flex items-center justify-center" style={{ borderColor: "\#13C9A0" }} className="\.\.\. bg-\[\#f0fdf9\] dark:bg-\[\#13C9A0\]\/10"/g, 'className="w-24 h-24 rounded-full border-4 border-dashed flex items-center justify-center bg-[#f0fdf9] dark:bg-[#13C9A0]/10" style={{ borderColor: "#13C9A0" }}');
content = content.replace(/className="w-20 h-20 rounded-full flex items-center justify-center mb-4" className="\.\.\. bg-\[\#f0fdf9\] dark:bg-\[\#13C9A0\]\/10"/g, 'className="w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-[#f0fdf9] dark:bg-[#13C9A0]/10"');

fs.writeFileSync('app/chat/page.tsx', content, 'utf8');
