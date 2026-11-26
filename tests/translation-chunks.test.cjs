const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/function splitTranslationChunks\(value,maxBytes=450\)\{[\s\S]*?return chunks;\s*\}/);
if(!match)throw new Error('splitTranslationChunks function not found');
const fn=vm.runInNewContext('(()=>{'+match[0]+';return splitTranslationChunks})()', {TextEncoder});
const samples=[
 'hello world\n\nsecond paragraph',
 'Русский текст: Ёжик, съешь ещё этих мягких французских булок!',
 '😀🌍🧪🚀'.repeat(300),
 'A'.repeat(2000),
 'line one\r\n\tline two\n',
 'First sentence. Second sentence. Third sentence.',
 'alpha\n\nbeta\n\ngamma'
];
for(const sample of samples){
 const chunks=fn(sample,450);
 if(chunks.join('')!==sample)throw new Error('Chunking changed original text');
 for(const chunk of chunks){
  if(new TextEncoder().encode(chunk).length>450)throw new Error('Chunk exceeded byte budget');
 }
}
const sentenceChunks=fn('First sentence. Second sentence. Third sentence.',24);
if(sentenceChunks[0]!=='First sentence. ')throw new Error('Chunker did not prefer a sentence boundary');
const paragraphChunks=fn('alpha\n\nbeta\n\ngamma',12);
if(paragraphChunks[0]!=='alpha\n\n')throw new Error('Chunker did not prefer a paragraph boundary');
const longWord=fn('Ж'.repeat(300),450);
if(longWord.join('')!=='Ж'.repeat(300)||longWord.some(chunk=>new TextEncoder().encode(chunk).length>450))throw new Error('Long Unicode token was not split safely');
console.log('Translation chunk tests passed: exact round-trip, UTF-8 byte limits, paragraph/sentence boundaries, whitespace, long tokens and emoji.');
