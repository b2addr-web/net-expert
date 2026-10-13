import {useEffect,useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';

const issueTypes=[['جهاز','Device'],['شبكة أو إنترنت','Network or internet'],['طابعة','Printer'],['بريد إلكتروني','Email'],['برنامج','Software'],['شريحة اتصال','SIM card'],['أخرى','Other']];
const deviceTypes=[['لابتوب','Laptop'],['شاشة','Monitor'],['طابعة','Printer'],['كمبيوتر مكتبي','Desktop computer'],['هاتف','Phone'],['ملحقات','Accessories'],['غيره','Other']];
const words={
 ar:{service:'خدمات تقنية المعلومات',loading:'جارٍ تحميل النموذج…',unavailable:'هذا الرابط غير متاح أو تم تعطيله.',reportTitle:'نموذج البلاغات التقنية',requestTitle:'نموذج طلب جهاز',reportHeading:'بلاغ تقني',requestHeading:'طلب جهاز',reportCategory:'البلاغات',requestCategory:'طلبات الأجهزة',subtitle:'املأ البيانات وسنرسل لك رقم متابعة.',employeeName:'اسم الموظف',employeeNumber:'الرقم الوظيفي',email:'البريد الإلكتروني',department:'القسم أو الإدارة',issueType:'نوع المشكلة التقنية',deviceType:'نوع الجهاز المطلوب',chooseIssue:'اختر النوع',chooseDevice:'اختر الجهاز',reportDescription:'وصف تفصيلي للمشكلة',requestDescription:'سبب الطلب وتفاصيل إضافية',image:'صورة توضيحية (اختياري)',imageLimit:'حتى 3 ميجابايت',sending:'جارٍ الإرسال…',sendReport:'إرسال البلاغ',sendRequest:'إرسال الطلب',receivedReport:'تم استلام بلاغك',receivedRequest:'تم استلام طلبك',reference:'رقم المتابعة:',emailSent:'أرسلنا رسالة تأكيد إلى بريدك الإلكتروني.',emailDelayed:'تم حفظ النموذج، وقد تتأخر رسالة التأكيد البريدية.',attachmentFailed:'تم حفظ البلاغ، لكن تعذر حفظ الصورة. يمكنك ذكر ذلك لفريق الدعم مع رقم المتابعة.',footer:'NetExpert · نموذج آمن لاستقبال طلبات الموظفين',imageError:'الصورة يجب أن تكون PNG أو JPG أو WebP وأقل من 3 ميجابايت.',rateError:'تم تجاوز عدد المحاولات. حاول بعد ساعة.',submitError:'تعذر إرسال النموذج. تحقق من البيانات وحاول مجدداً.'},
 en:{service:'Information technology services',loading:'Loading form…',unavailable:'This link is unavailable or has been disabled.',reportTitle:'Technical Report Form',requestTitle:'Device Request Form',reportHeading:'Technical report',requestHeading:'Device request',reportCategory:'Technical reports',requestCategory:'Device requests',subtitle:'Fill in the details and we will send you a tracking number.',employeeName:'Employee name',employeeNumber:'Employee ID',email:'Email address',department:'Department',issueType:'Type of technical issue',deviceType:'Requested device type',chooseIssue:'Select an issue',chooseDevice:'Select a device',reportDescription:'Detailed description of the issue',requestDescription:'Reason for request and additional details',image:'Supporting image (optional)',imageLimit:'Up to 3 MB',sending:'Sending…',sendReport:'Submit report',sendRequest:'Submit request',receivedReport:'Your report was received',receivedRequest:'Your request was received',reference:'Tracking number:',emailSent:'A confirmation email was sent to your address.',emailDelayed:'Your form was saved. The confirmation email may be delayed.',attachmentFailed:'The report was saved, but the image could not be saved. Please tell support your tracking number.',footer:'NetExpert · Secure employee request form',imageError:'The image must be PNG, JPG, or WebP and under 3 MB.',rateError:'Too many attempts. Please try again in an hour.',submitError:'Could not submit the form. Check the details and try again.'}
};

// Supply the link-specific title in the first HTML response for link previews.
export async function getServerSideProps({params,res}){
 res.setHeader('Cache-Control','private, no-store');
 const token=String(params?.token||'');
 const shortCode=/^[A-Za-z0-9]{22}$/.test(token);
 if(!shortCode&&!/^[A-Za-z0-9_-]{43}$/.test(token))return {props:{initialLink:null}};
 try{
  const {serverClient,tokenHash}=await import('../../lib/intake-server');
  const db=serverClient();
  let linkId=null;
  if(shortCode){
   const {data,error}=await db.from('intake_link_aliases').select('link_id').eq('code_hash',tokenHash(token)).maybeSingle();
   if(error||!data)return {props:{initialLink:null}};
   linkId=data.link_id;
  }
  const lookup=db.from('intake_links').select('kind,label').eq('active',true);
  const {data,error}=await (shortCode?lookup.eq('id',linkId):lookup.eq('token_hash',tokenHash(token))).maybeSingle();
  return {props:{initialLink:error||!data?null:{kind:data.kind,label:data.label}}};
 }catch{return {props:{initialLink:null}};}
}

export default function IntakeForm({initialLink=null}){
 const router=useRouter(),token=router.query.token;
 const [lang,setLang]=useState('ar'),[link,setLink]=useState(initialLink),[loading,setLoading]=useState(!initialLink),[error,setError]=useState(''),[sending,setSending]=useState(false),[result,setResult]=useState(null);
 const [form,setForm]=useState({employee_name:'',employee_number:'',email:'',department:'',issue_type:'',device_type:'',description:'',website:''});
 const [image,setImage]=useState(''),t=words[lang],report=link?.kind==='report';
 useEffect(()=>{if(typeof token!=='string'||initialLink)return;let active=true;fetch(`/api/intake/${encodeURIComponent(token)}`).then(async response=>{if(!response.ok)throw new Error('unavailable');return response.json()}).then(data=>{if(active)setLink(data)}).catch(()=>{if(active)setError('unavailable')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[token,initialLink]);
 const set=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 const chooseImage=e=>{setError('');const file=e.target.files?.[0];if(!file){setImage('');return}if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024){setError('imageError');e.target.value='';return}const reader=new FileReader();reader.onload=()=>setImage(String(reader.result));reader.readAsDataURL(file)};
 const submit=async e=>{e.preventDefault();setSending(true);setError('');try{const response=await fetch(`/api/intake/${encodeURIComponent(token)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,image:report?image:undefined})});const data=await response.json();if(!response.ok)throw new Error(response.status===429?'rateError':response.status===404?'unavailable':'submitError');setResult(data)}catch(e){setError(e.message in t?e.message:'submitError')}finally{setSending(false)}};
 const field=(key,label,type='text')=><label key={key}>{label}<input required type={type} maxLength={key==='email'?254:120} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 const title=link?(report?t.reportTitle:t.requestTitle):t.unavailable;
 const description=link?(report?t.reportCategory:t.requestCategory)+' · '+t.subtitle:t.unavailable;
 return <div className="intake-page" dir={lang==='ar'?'rtl':'ltr'} lang={lang}>
  <Head><title>{title} | NetExpert</title><meta name="description" content={description}/><meta property="og:type" content="website"/><meta property="og:title" content={`${title} | NetExpert`}/><meta property="og:description" content={description}/><meta name="twitter:card" content="summary"/><meta name="twitter:title" content={`${title} | NetExpert`}/><meta name="robots" content="noindex,nofollow"/></Head>
  <main className="intake-card"><header><span className="intake-logo">NE</span><div><b>NetExpert</b><small>{t.service}</small></div><button className="intake-language" type="button" onClick={()=>setLang(value=>value==='ar'?'en':'ar')} aria-label={lang==='ar'?'Switch form to English':'تحويل النموذج إلى العربية'}>{lang==='ar'?'English':'العربية'}</button></header>
   {loading?<p>{t.loading}</p>:!link?<p role="alert">{t.unavailable}</p>:result?<section className="intake-success" role="status"><h1>{report?t.receivedReport:t.receivedRequest}</h1><p>{t.reference} <strong>{result.reference}</strong></p><p>{result.emailSent?t.emailSent:t.emailDelayed}</p>{result.attachmentSaved===false&&<p>{t.attachmentFailed}</p>}</section>:<>
    <h1>{report?t.reportHeading:t.requestHeading}</h1><p className="intake-subtitle">{lang==='ar'?link.label:(report?t.reportCategory:t.requestCategory)} · {t.subtitle}</p>
    <form onSubmit={submit}><div className="intake-fields">
     {field('employee_name',t.employeeName)}{field('employee_number',t.employeeNumber)}{field('email',t.email,'email')}{field('department',t.department)}
     {report?<label>{t.issueType}<select required value={form.issue_type} onChange={e=>set('issue_type',e.target.value)}><option value="">{t.chooseIssue}</option>{issueTypes.map(([value,english])=><option key={value} value={value}>{lang==='ar'?value:english}</option>)}</select></label>:<label>{t.deviceType}<select required value={form.device_type} onChange={e=>set('device_type',e.target.value)}><option value="">{t.chooseDevice}</option>{deviceTypes.map(([value,english])=><option key={value} value={value}>{lang==='ar'?value:english}</option>)}</select></label>}
     <label className="wide">{report?t.reportDescription:t.requestDescription}<textarea required minLength={10} maxLength={3000} rows={5} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
     {report&&<label className="wide">{t.image}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage}/><small>{t.imageLimit}</small></label>}
    </div><input className="intake-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e=>set('website',e.target.value)}/>{error&&<p role="alert" className="intake-error">{t[error]||t.submitError}</p>}<button disabled={sending}>{sending?t.sending:(report?t.sendReport:t.sendRequest)}</button></form>
   </>}
   <footer>{t.footer}</footer>
  </main>
 </div>;
}
