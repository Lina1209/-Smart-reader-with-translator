const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const match=html.match(/function parseTranslationGlossary\(\)\{[\s\S]*?(?=async function requestTranslationChunk\(text,from,to\)\{)/);
if(!match)throw new Error('Glossary and retry helpers not found');
let glossary='New York = Нью-Йорк\nOpenAI = OpenAI\nC++ = Си-плюс-плюс';
const helpers=vm.runInNewContext('(()=>{'+match[0]+';return {parseTranslationGlossary,protectGlossaryTerms,restoreGlossaryTerms,isRetryableTranslationError}})()', {
 $:()=>({value:glossary}),
 translationEngine:'mymemory'
});
const input='I live in New York. OpenAI uses C++ and a new york office.';
const protectedValue=helpers.protectGlossaryTerms(input);
if(protectedValue.text===input||protectedValue.tokens.length!==4)throw new Error('Glossary terms were not protected');
const restored=helpers.restoreGlossaryTerms(protectedValue.text,protectedValue.tokens);
if(restored!=='I live in Нью-Йорк. OpenAI uses Си-плюс-плюс and a Нью-Йорк office.')throw new Error('Glossary terms were not restored exactly: '+restored);
const sorted=helpers.parseTranslationGlossary();
if(sorted[0].source!=='New York')throw new Error('Longer glossary phrases must be matched first');
if(!helpers.isRetryableTranslationError(new Error('MyMemory недоступен (HTTP 503).')))throw new Error('HTTP 503 should be retried');
if(helpers.isRetryableTranslationError(new Error('MyMemory ограничил запросы или дневная квота исчерпана.')))throw new Error('Quota errors must not be retried');
console.log('Translation quality tests passed: glossary parsing, longest-first matching, exact term restoration and retry classification.');
