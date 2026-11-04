# NetExpert — Phase 4B Security Verification

> **تحديث Phase 4C (24 أكتوبر 2026):** استُبدلت نتائج هذا التقرير الخاصة بسياسة `devices` بالنتائج الموثقة في [security-phase-4c.md](C:\Users\User\Documents\ChatGPT\موقعي\net-expert-audit\docs\security-phase-4c.md). الإصلاح مثبت محليًا بعد إعادة بناء المخطط، ولم يُطبق على الإنتاج.

تاريخ المراجعة: 24 أكتوبر 2026  
الفرع: `codex/security-phase-4`  
النطاق: فحص محلي ثابت واختبارات محلية محروسة. لم تُستخدم حسابات View Water أو Gmail، ولم يحدث اتصال بـ Supabase الإنتاجي أو نشر أو دفع.

## الخلاصة

ظهور بيانات مختلفة عند دخول حساب Gmail مستقل إلى `?module=assets` لا يكشف بيانات الحساب الآخر في اختبار الواجهة الذي أجراه المستخدم. لكنه لا يثبت وحده حماية RLS أو مسارات API أو Storage.

كانت سياسة الأجهزة القديمة تستخدم `has_section_access('assets')` في INSERT وUPDATE. تم الآن إصلاح مصدر التأسيس وإضافة Migration مستقل، ثم إثبات المنع باختبارات PostgreSQL محلية حقيقية. لا يُعد ذلك تحققًا من الإنتاج قبل تطبيق Migration في Staging.

## حالة البيئة

- الفرع الحالي صحيح: `codex/security-phase-4`.
- Supabase CLI يعمل: `2.122.0`.
- Docker Engine يعمل بالإصدار `29.9.2` وذاكرته `5.68GiB`.
- WSL متاح كأداة Windows، لكن لا توجد توزيعة WSL مسجلة؛ لم أحتجها بعد توفر Docker.
- بدأ `supabase start` بعد اكتمال الصور. Windows كان يحجز المنافذ الافتراضية `54322` و`54321` و`54327` و`54324`؛ عُدّل إعداد محلي فقط إلى PostgreSQL `55432` وAPI `55431`، واستُبعدت التحليلات وStudio وMailpit والخدمات غير المطلوبة.
- الخدمات العاملة: PostgreSQL وAuth وStorage وPostgREST وKong وRealtime وPostgres Meta، وكلها بحالة healthy أو Up.
- لم أقم بتثبيت Docker أو تغيير إعدادات Windows، التزامًا بالشرط.

## مراجعة العزل والصلاحيات

### ما يدعم العزل في الكود

- `pages/api/intake/admin.js` يحقق جلسة المستخدم ثم يربط كل الاستعلامات بـ `organization_id` المأخوذ من سياق المستخدم.
- `pages/api/platform/[section].js` لا يقبل الشركة من جسم الطلب، ويحقق الدور والقسم قبل استخدام العميل الخادمي.
- `lib/intake-server.js` يحتفظ بمفتاح `service_role` في الخادم، ويستعمل `getUser` و`get_my_access` قبل العمليات ذات الامتياز.
- سياسات `workspace_records` في `supabase-workspace.sql` تربط القراءة والكتابة بـ `current_organization_id()`، وتتحقق من `workspace_write`.
- سياسات المعرفة والمرفقات ومسارات التخزين تربط المسار بالشركة الحالية أو بمالك الملاحظة/المشاركة.

أصبحت المراجعة مدعومة باختبار PostgreSQL محلي حقيقي، مع بقاء عدم وجود أي اتصال بقاعدة تشغيلية.

### النتائج المطلوبة والواقع

| الفحص | النتيجة |
|---|---|
| قراءة شركة A من حساب B | **ناجح محليًا**: الصفوف فارغة بسبب RLS |
| تغيير `organization_id` أو معرف السجل | **ناجح محليًا**: العملية مرفوضة |
| تعديل الصلاحيات ذاتيًا | **ناجح محليًا**: Viewer لا يستطيع التصعيد |
| INSERT/UPDATE/DELETE | **ناجح ضمن الحالات المختبرة** مع GRANTs وRLS الفعلية |
| الملاحظات والمرفقات | **ناجح محليًا**: قراءة ملف الشركة الأخرى مرفوضة |
| مفاتيح الخدمة في المتصفح | لم يظهر مسار يضعها في `NEXT_PUBLIC_*`؛ فحص Node السابق ناجح |

## سياسة الأجهزة القديمة

المصدر الحالي:

```sql
create policy tenant_devices_write on devices for insert to authenticated
with check(organization_id=current_organization_id() and has_section_access('assets'));

create policy tenant_devices_update on devices for update to authenticated
using(organization_id=current_organization_id() and has_section_access('assets'))
with check(organization_id=current_organization_id());
```

المشكلة أن `has_section_access` لا تعني بالضرورة صلاحية الكتابة. التصحيح المحلي المقترح محفوظ في [security-phase3-legacy-rls-proposal.sql](C:\Users\User\Documents\ChatGPT\موقعي\net-expert-audit\docs\security-phase3-legacy-rls-proposal.sql)، ويستبدلها بـ `workspace_write('assets')` في INSERT وUPDATE مع إبقاء فحص الشركة.

الحالة: **أُصلحت محليًا**. يحدد `supabase-multitenant.sql` الآن صلاحية `workspace_write('assets')`، ويكررها Migration `20261024_devices_write_policy_hardening.sql`. نجح Viewer في الاختبار القديم قبل الإصلاح، ثم رُفض INSERT وUPDATE بعد إعادة البناء النظيفة. لم يُطبق الإصلاح على الإنتاج.

## الاختبارات

شغّلت `pnpm run test:tenant:local` بعد تشغيل Supabase المحلي:

- 8 اختبارات RLS/Storage/Auth: **ناجحة** بعد التصحيح المحلي.
- فحص API بلا جلسة: **ناجح** عبر `tests/local-supabase/api-authz.test.mjs`.
- اختبار Mailpit/استعادة البريد: غير منفذ لأن Mailpit مستبعد من التشغيل المصغر.

مجموعة الاختبارات الموجودة في `tests/local-supabase/` تغطي:

- Admin A يقرأ جهاز B.
- Operator A يكتب في شركة B.
- Viewer A يكتب في شركته.
- Viewer A يمنح نفسه صلاحية الإدارة.
- نقل جهاز بين الشركات.
- قراءة ملف خاص من مسار شركة أخرى.
- طلبات API بلا جلسة.

لم تُستخدم Mock أو بيانات حسابات حقيقية، ولا أصف هذه الاختبارات بأنها إثبات RLS قبل تشغيلها على PostgreSQL محلي.

اختبارات الانحدار السابقة ما زالت ناجحة: Node `39/39`، Playwright `2/2`، Build ناجح، وESLint بلا أخطاء مع 17 تحذيرًا.

## المشاكل والمخاطر

1. **مُعالج محليًا — يحتاج Staging:** سياسة `devices` القديمة استُبدلت بمنطق الكتابة الصحيح، ويجب تطبيق Migration بعد مراجعة مستقلة.
2. **غير مختبر — حرج:** عزل الإنتاج نفسه لم يُثبت؛ الاختبارات محلية فقط.
3. **غير مختبر — عالٍ:** تدفقات Auth والجلسات وانتهاء الصلاحية وروابط API لم تُنفذ على حسابات تجريبية.
4. **اتساق محتمل — متوسط:** حذف كائن مرتبط بملاحظة قد يترك سجل مرفق يتيمًا؛ يحتاج Storage محليًا وحذفًا ذريًا.

## ترتيب SQL وMigrations

الملفات ليست سلسلة `supabase/migrations` مكتملة؛ `supabase migration list --local` كان فارغًا. أثناء تجهيز القاعدة المحلية اكتشفت واعتمدت الترتيب التالي:

1. `supabase-schema.sql`
2. `supabase-multitenant.sql`
3. `supabase-export-center.sql`
4. `supabase-workspace.sql`
5. migrations الزمنية مع تقديم `operations_modules` على `operations_jobs`، و`custody_return` على فهارس custody، و`sidebar_knowledge`/`knowledge_split` قبل صلاحيات ومرفقات المعرفة.

اكتُشف أيضًا أن `20261012_scope_profile_access_to_owner.sql` لم يكن يعيد إنشاء سياسة `profiles_read_own` بأمان؛ أُضيف له `DROP POLICY IF EXISTS` محليًا في الفرع. أما `operations_schedule.sql` فبقي غير مطبق لأن مخطط `cron` غير متاح في صورة الاختبار.

## ما تم إصلاحه أو تجهيزه

- لم تُجرَ تغييرات على قاعدة البيانات أو سياسات الإنتاج.
- تم تحديث Supabase CLI المحلي إلى `2.122.0`، وأزيلت تنبيهات `tar` الحرجة/العالية.
- أضيفت اختبارات Phase 4 محروسة بعنوان loopback.
- أضيف تقرير Phase 4 السابق، واقتراح SQL منفصل للمراجعة.
- أضيفت منافذ Docker المحلية `55432/55431` في `supabase/config.toml` لتجاوز منافذ Windows المحجوزة.
- أُثبت خلل سياسة الأجهزة قبل الإصلاح وبعده بالاختبار نفسه.

## المطلوب لإكمال التحقق

استعادة Mailpit/cron أو توفير بيئة منفصلة مطلوبة فقط لاختبارات البريد والجدولة. الذاكرة الحالية 5.68GiB أقل من التوصية العملية لتشغيل حزمة Supabase كاملة، لذلك استُخدم التشغيل المصغر. لا أحتاج مفاتيح الإنتاج.

1. شغّل `pnpm run supabase:local:start`.
2. استخدم المفاتيح المطبوعة من `pnpm exec supabase status` محليًا فقط.
3. طبق مخطط اختبار موثق على قاعدة فارغة، دون نقل بيانات حقيقية.
4. شغّل `RUN_LOCAL_SUPABASE_TESTS=1 pnpm run test:tenant:local`.
5. اختبر سياسة الأجهزة القديمة، ثم طبّق الاقتراح داخل القاعدة المحلية وأعد الاختبارات.

## الحكم النهائي

الفصل الظاهر في واجهة المستخدم مدعوم الآن باختبارات RLS وStorage وAuth وAPI على PostgreSQL/Supabase محليين مع شركتين وحسابات وهمية. **عزل الشركات مثبت ضمن مخطط الاختبار المحلي بعد إصلاح سياسة `devices`**. لا يعني ذلك اعتماد الإنتاج تلقائيًا؛ يجب مراجعة SQL المقترح وتطبيقه عبر Migration معتمد على بيئة ما قبل الإنتاج أولًا، ثم اختبار البريد والجدولة في بيئة تحتوي Mailpit وcron.
