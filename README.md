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
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
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
   - أضف `SUPABASE_SERVICE_ROLE_KEY` كمتغير سري، ولا تستخدم معه بادئة `NEXT_PUBLIC_`
4. اضغط **Deploy** ✅

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
   - **Site URL:** رابط الموقع الرسمي الموجود في `NEXT_PUBLIC_SITE_URL`.
   - **Redirect URLs:** أضف `https://YOUR_DOMAIN.example/**`، وللتطوير `http://localhost:3000/**`.
3. رابط الاستعادة يعيد المستخدم إلى `/reset-password` داخل Net Expert لإنشاء كلمة المرور الجديدة.
4. لكي يصل البريد باسم الموقع بدل خدمة Supabase الافتراضية، افتح Authentication → SMTP Settings واربط بريدًا من دومينك، مثل `noreply@your-domain.com`، واجعل Sender name هو `Net Expert`.
5. من Authentication → Email Templates → Reset Password استخدم عنوانًا مثل `إعادة تعيين كلمة مرور Net Expert`، واترك رابط الاستعادة يعتمد على `{{ .ConfirmationURL }}`.
6. لا تضع كلمة مرور SMTP أو Service Role Key في GitHub أو في متغير يبدأ بـ`NEXT_PUBLIC_`.

كل حساب جديد يحصل على دور `viewer` تلقائياً. لا يستطيع المستخدم اختيار دوره أو ترقية صلاحياته من الواجهة.

---

## الحالة الوظيفية الحالية

- تسجيل بالبريد وكلمة المرور وإدارة جلسات Supabase.
- استعادة كلمة المرور عبر صفحة داخل الموقع.
- إنشاء Profile تلقائي واستكمال الاسم والقسم.
- صلاحيات قاعدة بيانات تعتمد على RLS.
- سجل أصول مع إضافة وتعديل وحذف وتصدير CSV.
- واجهة عربية وإنجليزية.
- يتوقف الاتصال بوضوح عند غياب إعدادات Supabase، ولا يتصل بقاعدة افتراضية.
