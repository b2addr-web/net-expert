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

## 🔐 بيانات الدخول

| المستخدم | كلمة المرور | الصلاحية |
|----------|------------|---------|
| Badr | BADR050982538 | مسؤول كامل |

---

## 💡 وضع Offline

المشروع يعمل حتى **بدون Supabase** — يحفظ في localStorage تلقائياً.
الأيقونة في الشريط العلوي تظهر:
- 🟢 **سحابي** — متصل بـ Supabase، البيانات محفوظة للأبد
- 🟡 **محلي** — يعمل بدون إنترنت، البيانات في المتصفح فقط

---

## ✅ الميزات الكاملة

| الميزة | التفاصيل |
|--------|---------|
| 🗄️ Supabase | قاعدة بيانات سحابية حقيقية |
| 🔄 Realtime | تحديث تلقائي فوري بين الأجهزة |
| 📴 Offline | يعمل بدون إنترنت مع sync تلقائي |
| 🔐 تسجيل دخول | Admin / Viewer |
| 👥 إدارة مستخدمين | إضافة / حذف |
| 📦 11 نوع جهاز | مع ComboBox للإضافة الحرة |
| 🏢 3 مواقع | مستودع / مبنى / مصنع |
| 👤 بيانات موظف | اسم + رقم وظيفي |
| 📝 ملاحظات | حقل نصي لكل جهاز |
| 📎 مرفقات | رفع ملفات مع تسمية مخصصة |
| ⚡ تسجيل تلقائي | المستخدم + وقت كل عملية |
| 📋 سجل العمليات | Audit Log كامل |
| 📊 تصدير CSV | Excel بالعربية |
| 📄 تصدير PDF | طباعة احترافية |
| ☁️ Google Sheets | حفظ اختياري |
| 🌐 ثنائي اللغة | عربي / English |
