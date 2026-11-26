const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/function splitTranslationChunks\\(value,maxBytes=450\\)\\{[\\s\\S]*?return chunks;\\}/);
if(!match)throw new Error('splitTranslationChunks function not found');
const fn=vm.runInNewContext('(()=>{'+match[0]+';return splitTranslationChunks})()', {TextEncoder});
const samples=['hello world\\n\\nsecond paragraph','Русский текст: Ёжик, съешь ещё этих мягких французских булок!','😀🌍🧪🚀'.repeat(300),'A'.repeat(2000),'line one\\r\\n\\tline two\\n'];
for(const sample of samples){const chunks=fn(sample,450);if(chunks.join('')!==sample)throw new Error('Chunking changed original text');for(const chunk of chunks){if(new TextEncoder().encode(chunk).length>450)throw new Error('Chunk exceeded byte budget');}}
console.log('Translation chunk tests passed: exact round-trip, UTF-8 byte limits, whitespace, long tokens and emoji.');
