import sanitizeHtml from 'sanitize-html';

export const RICH_PREFIX='NETEXPERT_RICH_V1:';
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}};
const options={allowedTags:['p','br','strong','em','u','ul','ol','li','a'],allowedAttributes:{a:['href','target','rel']},allowedSchemes:['http','https'],allowProtocolRelative:false,transformTags:{a:(tag,attributes)=>{const href=safeUrl(attributes.href);return href?{tagName:'a',attribs:{href,target:'_blank',rel:'noopener noreferrer'}}:{tagName:'span',attribs:{}}}}};
export const sanitizeNoteHtml=html=>sanitizeHtml(String(html||''),options);
export const isRichNote=body=>String(body||'').startsWith(RICH_PREFIX);
const inlineLegacy=text=>{
 let result=escapeHtml(text);
 result=result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>{const href=safeUrl(url.replace(/&amp;/g,'&'));return href?`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label});
 return result.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\+\+([^+]+)\+\+/g,'<u>$1</u>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
};
export const legacyNoteHtml=body=>String(body||'').split('\n').map(line=>line.startsWith('- ')?`<ul><li>${inlineLegacy(line.slice(2))}</li></ul>`:`<p>${inlineLegacy(line)||'<br>'}</p>`).join('');
export const noteHtml=body=>sanitizeNoteHtml(isRichNote(body)?String(body).slice(RICH_PREFIX.length):legacyNoteHtml(body));
export const notePlainText=body=>sanitizeHtml(noteHtml(body),{allowedTags:[],allowedAttributes:{}}).replace(/\s+/g,' ').trim();
export const serializeNote=html=>RICH_PREFIX+sanitizeNoteHtml(html);
