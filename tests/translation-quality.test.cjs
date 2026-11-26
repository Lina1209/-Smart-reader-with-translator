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
const cacheStart=html.indexOf('function translationCacheKey(');
const cacheEnd=html.indexOf('\n}',cacheStart);
if(cacheStart<0||cacheEnd<0)throw new Error('Translation cache key helper not found');
const cacheSource=html.slice(cacheStart,cacheEnd+2);
let endpoint='https://one.example',glossaryValue='term = перевод';
const cacheContext={translationEngine:'libretranslate',$:(id)=>({value:id==='libreTranslateEndpoint'?endpoint:glossaryValue})};
const cacheKey=vm.runInNewContext(cacheSource+'; translationCacheKey',cacheContext);
const key1=cacheKey('source','en','ru');
endpoint='https://two.example';
const key2=cacheKey('source','en','ru');
if(key1===key2)throw new Error('Different translation endpoints must not share cached translations');
glossaryValue='term = термин';
const key3=cacheKey('source','en','ru');
if(key2===key3)throw new Error('Different glossary settings must not share cached translations');
console.log('Translation quality tests passed: glossary parsing, longest-first matching, exact term restoration and retry classification.');
