/**
 * Read & Translate — secure multi-provider translation gateway.
 * Deploy as a Cloudflare Worker. Never put provider keys in GitHub Pages code.
 */
const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  }
});

function languageCode(value) {
  return String(value || "").split("-")[0].toLowerCase();
}
function deeplLanguage(value, target) {
  const raw = String(value || "").replace("_", "-").toUpperCase();
  const base = raw.split("-")[0];
  if (base === "EN") return raw === "EN-GB" ? "EN-GB" : "EN-US";
  if (base === "PT") return raw === "PT-BR" ? "PT-BR" : "PT-PT";
  if (target && base === "ZH") return "ZH";
  return base;
}
async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || ("HTTP " + response.status));
  return data;
}
async function google(text, source, target, env) {
  if (!env.GOOGLE_TRANSLATE_API_KEY) throw new Error("Google key not configured");
  const url = "https://translation.googleapis.com/language/translate/v2";
  const response = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GOOGLE_TRANSLATE_API_KEY},body:JSON.stringify({q:text,source:languageCode(source),target:languageCode(target),format:"text"})});
  const data = await readJson(response);
  const result = data.data?.translations?.[0]?.translatedText;
  if (!result) throw new Error("Google returned an empty translation");
  return result;
}
async function azure(text, source, target, env) {
  if (!env.AZURE_TRANSLATOR_KEY || !env.AZURE_TRANSLATOR_ENDPOINT) throw new Error("Azure key or endpoint not configured");
  const endpoint = env.AZURE_TRANSLATOR_ENDPOINT.replace(/\/$/, "");
  const url = endpoint + "/translate?api-version=3.0&from=" + encodeURIComponent(languageCode(source)) + "&to=" + encodeURIComponent(languageCode(target));
  const headers = {"Ocp-Apim-Subscription-Key":env.AZURE_TRANSLATOR_KEY,"Content-Type":"application/json"};
  if (env.AZURE_TRANSLATOR_REGION) headers["Ocp-Apim-Subscription-Region"] = env.AZURE_TRANSLATOR_REGION;
  const response = await fetch(url,{method:"POST",headers,body:JSON.stringify([{Text:text}])});
  const data = await readJson(response);
  const result = data?.[0]?.translations?.[0]?.text;
  if (!result) throw new Error("Azure returned an empty translation");
  return result;
}
async function deepl(text, source, target, env) {
  if (!env.DEEPL_API_KEY) throw new Error("DeepL key not configured");
  const isFree = env.DEEPL_API_KEY.endsWith(":fx");
  const endpoint = isFree ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
  const body = new URLSearchParams({text,source_lang:deeplLanguage(source,false),target_lang:deeplLanguage(target,true)});
  const response = await fetch(endpoint,{method:"POST",headers:{"Authorization":"DeepL-Auth-Key "+env.DEEPL_API_KEY,"Content-Type":"application/x-www-form-urlencoded"},body});
  const data = await readJson(response);
  const result = data.translations?.[0]?.text;
  if (!result) throw new Error("DeepL returned an empty translation");
  return result;
}
async function libre(text, source, target, env) {
  if (!env.LIBRETRANSLATE_URL) throw new Error("LibreTranslate URL not configured");
  const headers = {"Content-Type":"application/json"};
  const body = {q:text,source:languageCode(source),target:languageCode(target),format:"text"};
  if (env.LIBRETRANSLATE_API_KEY) body.api_key = env.LIBRETRANSLATE_API_KEY;
  const response = await fetch(env.LIBRETRANSLATE_URL.replace(/\/$/,"") + "/translate",{method:"POST",headers,body:JSON.stringify(body)});
  const data = await readJson(response);
  if (!data.translatedText) throw new Error("LibreTranslate returned an empty translation");
  return data.translatedText;
}
const providers = {
  google: (text,source,target,env) => google(text,source,target,env),
  azure: (text,source,target,env) => azure(text,source,target,env),
  deepl: (text,source,target,env) => deepl(text,source,target,env),
  libre: (text,source,target,env) => libre(text,source,target,env)
};
export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;
    const requestOrigin = request.headers.get("Origin") || "";
    if (!allowedOrigin) return new Response("Worker setup incomplete: set ALLOWED_ORIGIN.",{status:503});
    if (requestOrigin !== allowedOrigin) return new Response("Origin not allowed.",{status:403});
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:{
      "Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"POST, OPTIONS",
      "Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400","Vary":"Origin"
    }});
    if (request.method !== "POST") return json({error:"Method not allowed."},405,allowedOrigin);
    try {
      const input = await request.json();
      const text = String(input.text || "");
      const source = String(input.source || "");
      const target = String(input.target || "");
      if (!text.trim() || !source || !target) return json({error:"Text, source and target are required."},400,allowedOrigin);
      if (new TextEncoder().encode(text).length > 500) return json({error:"Chunk is larger than 500 bytes."},413,allowedOrigin);
      const preferred = String(input.preferredProvider || "auto").toLowerCase();
      const order = preferred !== "auto" && providers[preferred]
        ? [preferred,...Object.keys(providers).filter(name => name !== preferred)]
        : ["google","azure","deepl","libre"];
      const errors = [];
      for (const name of order) {
        try {
          const translatedText = await providers[name](text,source,target,env);
          return json({translatedText,provider:name},200,allowedOrigin);
        } catch (error) {
          errors.push(name + ": " + String(error.message || error).slice(0,180));
        }
      }
      return json({error:"Дополнительные сервисы пока не настроены или недоступны. Пробуем резервный MyMemory.",providersTried:errors},503,allowedOrigin);
    } catch (error) {
      return json({error:"Invalid request: " + String(error.message || error)},400,allowedOrigin);
    }
  }
};
