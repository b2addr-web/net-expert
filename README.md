# ⚡ خبير الشبكة | Net Expert v2.0
## نظام إدارة الجرد التقني — مع Supabase السحابي

---

## 🗄️ إعداد Supabase (قاعدة البيانات السحابية)

### الخطوة 1: إنشاء مشروع
1. اذهب إلى https://supabase.com وسجّل دخول (مجاني)
2. اضغط **New Project**
3. اختر اسم المشروع: `net-expert`
4. اختر كلمة مرور قوية للـ database
5. اختر المنطقة: **Middle East (Bahrain)** للأسرع
6. انتظر دقيقة حتى يكتمل الإنشاء

### الخطوة 2: إنشاء الجداول
1. من القائمة الجانبية اضغط **SQL Editor**
2. اضغط **New Query**
3. شغّل ملفات SQL التالية بالترتيب، ولا تتجاوز أي ملف:
   1. `supabase-schema.sql`
   2. `supabase-multitenant.sql`
   3. `supabase-export-center.sql`
   4. `supabase-workspace.sql`
   5. `supabase-workspace-history.sql`
   6. `supabase-security-hardening.sql`
4. اضغط **Run** بعد كل ملف وتأكد من عدم وجود خطأ قبل الانتقال للملف التالي ✅

### الخطوة 3: نسخ مفاتيح الـ API
1. اذهب إلى **Project Settings** → **API**
2. انسخ:
   - **Project URL** → يبدأ بـ `https://xxxxx.supabase.co`
   - **anon public key** → سلسلة طويلة من الحروف

### الخطوة 4: إضافة المفاتيح للمشروع
انسخ ملف `.env.local.example` وأعد تسميته إلى `.env.local`:
```bash
cp .env.local.example .env.local
```
ثم افتحه وضع المفاتيح:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY_HERE
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN.example
```

---

## 🚀 النشر على Vercel

### تشغيل محلي أولاً:
```bash
npm install
npm run dev
# افتح http://localhost:3000
```

### النشر على Vercel:
1. ارفع المشروع على GitHub
2. اذهب إلى https://vercel.com → New Project → Import
3. **مهم:** أضف Environment Variables في Vercel:
   - اذهب إلى Settings → Environment Variables
   - أضف `NEXT_PUBLIC_SUPABASE_URL`
   - أضف `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - أضف `NEXT_PUBLIC_SITE_URL` بالرابط الرسمي للموقع
4. انشر وظيفة `supabase/functions/invite-organization-user` في مشروع Supabase مع `verify_jwt = false` كما في `supabase/config.toml`. تتحقق الوظيفة بنفسها من جلسة المستخدم ودور مدير الشركة، وتستخدم مفتاح Supabase السري المتاح لها داخل بيئة الوظائف.
5. اضغط **Deploy** ✅

---

## 🌐 ربط دومين خاص

1. اشتري دومين من namecheap.com أو godaddy.com
2. في Vercel: Settings → Domains → Add Domain
3. اتبع تعليمات تغيير DNS
4. خلال 24 ساعة يصبح شغّالاً

---

## 🔐 إعداد المصادقة واستعادة كلمة المرور

يعتمد النظام على Supabase Auth ولا يحتوي على بيانات دخول ثابتة.

1. شغّل جميع ملفات SQL بالترتيب الموضح أعلاه لإنشاء الجداول وسياسات RLS وسجل المصادقة.
2. من Supabase افتح Authentication → URL Configuration واضبط:
   - **Site URL:** `https://www.netexpert.dev` دون `/` أخيرة.
   - **Redirect URLs:** أبقِ الروابط الحالية، وتأكد من السماح بـ`https://www.netexpert.dev/reset-password` و`https://www.netexpert.dev/auth/confirm`، وللتطوير `http://localhost:3000/**` عند الحاجة.
   - اضبط `NEXT_PUBLIC_SITE_URL=https://www.netexpert.dev` في بيئات Vercel المطلوبة. أعد النشر بعد تغيير المتغير. يستمر هذا العنوان في خدمة روابط التفعيل القديمة والتسجيل.
3. رابط الاستعادة الجديد يفتح `/auth/confirm` على نطاق الموقع. تعرض الصفحة زر تأكيد، ثم تتحقق من `token_hash` باستخدام `verifyOtp` وتنتقل إلى `/reset-password`. يُحذف الرمز من شريط العنوان قبل التحقق، ولا يُرسل ضمن طلب الصفحة عند استخدام صيغة `#` أدناه. لا يُعاد استخدام الرابط بعد التحقق.
4. لكي يصل البريد باسم الموقع بدل خدمة Supabase الافتراضية، افتح Authentication → SMTP Settings واربط بريدًا من دومينك، مثل `noreply@your-domain.com`، واجعل Sender name هو `Net Expert`.
5. من Authentication → Email Templates → Reset Password استخدم عنوانًا مثل `إعادة تعيين كلمة مرور Net Expert`، واستبدل قالب **Reset Password فقط** بهذا المحتوى، ثم احفظه:

   ```html
   <h2>إعادة تعيين كلمة مرور Net Expert</h2>
   <p>وصلنا طلب لإعادة تعيين كلمة مرور حسابك. اضغط الرابط أدناه ثم أكّد الاستعادة لاختيار كلمة مرور جديدة.</p>
   <p><a href="{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=recovery">تعيين كلمة مرور جديدة</a></p>
   <p>إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
   ```

   يجب أن تكون **Site URL** بالضبط `https://www.netexpert.dev` دون شرطة مائلة في النهاية. أبقِ روابط التسجيل والدعوات في قوالبها الحالية. الصيغة `#token_hash` تحفظ الرمز خارج طلبات Vercel، وتقبل صفحة التأكيد أيضًا صيغة `?token_hash` إذا كان لديك قالب قديم. الرابط الظاهر في البريد يبدأ بنطاق الموقع دون شراء Supabase Custom Domain.
6. لا تضع كلمة مرور SMTP أو Service Role Key في GitHub أو في متغير يبدأ بـ`NEXT_PUBLIC_`.
7. إذا كان بريد الموظف مسجلاً في Supabase مسبقًا، تضيف الدعوة عضويته إلى الشركة مباشرة. تظهر له الشركات المتاحة في قائمة الحساب ليختار مساحة العمل المطلوبة؛ لا تُرسل له رسالة دعوة جديدة في هذه الحالة.
8. لجعل **رابط دعوة الموظف الجديد** يبدأ بنطاق Net Expert، افتح Authentication → Email Templates → **Invite User**، واضبط العنوان مثلاً `دعوة للانضمام إلى Net Expert`، ثم انسخ محتوى [`supabase/email-templates/invite.html`](supabase/email-templates/invite.html) واحفظه. يستخدم الرابط `{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=invite`. بعد تأكيد الدعوة، يفتح نموذج تعيين كلمة المرور مباشرة؛ وبعد الحفظ يدخل الموظف ببريده وكلمته الجديدة. لا تغيّر قالب Reset Password أثناء هذه الخطوة، ولا تحتاج Supabase Custom Domain.

اختبار الاستعادة بعد تحديث القالب: اطلب رابطًا من حساب اختبار، افتح البريد من نافذة خاصة، تأكد أن وجهة زر الاستعادة تبدأ بـ`https://www.netexpert.dev/auth/confirm`، اضغط زر التأكيد ثم غيّر كلمة المرور في `/reset-password`، وسجّل الدخول بالكلمة الجديدة. جرّب الرابط نفسه مرة ثانية وتأكد من ظهور رسالة انتهاء/استخدام الرابط. يتطلب هذا الاختبار صندوق بريد فعليًا؛ نجاح البناء وحده لا يثبت وصول الرسالة أو صحة إعداد القالب في لوحة Supabase.

كل حساب جديد يحصل على دور `viewer` تلقائياً. لا يستطيع المستخدم اختيار دوره أو ترقية صلاحياته من الواجهة.

---

## الحالة الوظيفية الحالية

### البلاغات وطلبات الأجهزة

شغّل ملفات SQL بالترتيب بعد ملفات مساحة العمل: `migrations/20261013_intake_cases.sql` ثم `migrations/20261013_intake_link_encryption.sql` ثم `migrations/20261013_intake_short_links.sql`. ملف الروابط المختصرة يضيف رموزاً قصيرة للروابط الجديدة والحالية، مع استمرار عمل الروابط القديمة. جداول النماذج محمية بـ RLS ولا تمنح `anon` أو `authenticated` أي صلاحية قراءة أو كتابة مباشرة؛ تمر الطلبات العامة عبر `/api/intake/[token]` فقط.

اضبط هذه المتغيرات في إعدادات الخادم على Vercel (بدون `NEXT_PUBLIC_`): `SUPABASE_SERVICE_ROLE_KEY` و`INTAKE_RATE_LIMIT_SECRET` و`INTAKE_LINK_SECRET` و`RESEND_API_KEY` و`RESEND_FROM_EMAIL`. يجب أن يكون بريد المرسل على نطاق موثق في Resend، مثل `NetExpert <notifications@auth.netexpert.dev>` إذا بقي هذا النطاق موثقاً. اضبط أيضاً `NEXT_PUBLIC_SITE_URL=https://www.netexpert.dev` ليُنشئ النظام روابط كاملة. لا تنشر المفتاح السري لـ Supabase أو مفتاح Resend في GitHub أو المتصفح.

بعد النشر، سجّل دخول مدير الشركة، افتح «البلاغات» أو «طلبات الأجهزة»، أنشئ رابطاً، وجرّب نموذجاً من نافذة خاصة. الروابط التي تعرضها اللوحة تستخدم `/i/` ورمزاً من أحرف وأرقام فقط. تحقق من ظهور الرقم المرجعي في لوحة التحكم ووصول رسالة التأكيد، ومن عرض صورة البلاغ في التفاصيل. تغيير حالة أي بلاغ أو طلب يرسل رسالة حالة إلى مقدمه؛ الملاحظات الداخلية لا تُرسل بالبريد. جرّب تعطيل الرابط وتأكد أن فتحه يعرض أنه غير متاح.

- تسجيل بالبريد وكلمة المرور وإدارة جلسات Supabase.
- استعادة كلمة المرور عبر صفحة داخل الموقع.
- إنشاء Profile تلقائي واستكمال الاسم والقسم.
- صلاحيات قاعدة بيانات تعتمد على RLS.
- سجل أصول مع إضافة وتعديل وحذف وتصدير CSV.
- واجهة عربية وإنجليزية.
- يتوقف الاتصال بوضوح عند غياب إعدادات Supabase، ولا يتصل بقاعدة افتراضية.

