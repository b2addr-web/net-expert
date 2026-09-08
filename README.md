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
3. افتح ملف `supabase-schema.sql` من المشروع
4. انسخ محتواه كاملاً والصقه في المحرر
5. اضغط **Run** ✅

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
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
   - أضف `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. اضغط **Deploy** ✅

---

## 🌐 ربط دومين خاص

1. اشتري دومين من namecheap.com أو godaddy.com
2. في Vercel: Settings → Domains → Add Domain
3. اتبع تعليمات تغيير DNS
4. خلال 24 ساعة يصبح شغّالاً

---

## 🔐 إعداد تسجيل الدخول بدون كلمة مرور

يعتمد النظام على Supabase Auth Email OTP ولا يحتوي على بيانات دخول ثابتة.

1. شغّل آخر نسخة من `supabase-schema.sql` لإنشاء Profiles وسياسات RLS وسجل المصادقة.
2. من Supabase افتح Authentication → Sign In / Providers وفعّل Email OTP.
3. خصص قالب البريد ليعرض رمز التحقق.
4. للإنتاج، اربط Custom SMTP؛ خدمة البريد الافتراضية مخصصة للاختبار فقط.
5. أنشئ أول مستخدم عبر OTP، ثم غيّر دوره إلى `admin` من بيئة إدارية موثوقة.

كل حساب جديد يحصل على دور `viewer` تلقائياً. لا يستطيع المستخدم اختيار دوره أو ترقية صلاحياته من الواجهة.

---

## الحالة الوظيفية الحالية

- Email OTP وإدارة جلسات Supabase.
- إنشاء Profile تلقائي واستكمال الاسم والقسم.
- صلاحيات قاعدة بيانات تعتمد على RLS.
- سجل أصول مع إضافة وتعديل وحذف وتصدير CSV.
- واجهة عربية وإنجليزية.
- تخزين محلي للأصول عند غياب Supabase مخصص للتطوير فقط.
- وحدات Operations وProcurement وContracts ظاهرة كحالات إعداد صريحة حتى يتم ربط نماذج بياناتها؛ لا تعرض أزراراً وهمية.
