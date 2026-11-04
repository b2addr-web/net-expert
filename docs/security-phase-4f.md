# NetExpert — Phase 4F Complete Security Verification Report

**تاريخ التنفيذ:** 2 نوفمبر 2026 (Asia/Riyadh)  
**الفرع:** `codex/security-phase-4`  
**آخر Commit عند بدء الفحص:** `a5d50696fbe24a83f8fa57034b3ea1998858167e`  
**النتيجة:** **NOT READY FOR STAGING**

## حدود التنفيذ

حُفظت جميع تغييرات Phase 4E غير المحفوظة. لم يحدث Push أو نشر أو اتصال بقاعدة الإنتاج. لم تُستخدم حسابات حقيقية. بدأت حاويات Supabase المحلية القائمة دون `db reset` أو حذف بياناتها. طُبق Migration العقود على PostgreSQL المحلي فقط. استخدم اختبار العقود شركتين وخمسة مستخدمين وهميين ضمن معاملة انتهت بـ`ROLLBACK`، وثبت عدم بقاء سجلاته.

رفضت المراجعة الآلية أمر `supabase status --output json` لأن ناتجه قد يعرض مفاتيح محلية؛ استُخدم بدلًا منه فحص حالة الحاويات وبنية PostgreSQL دون تضمين أي مفتاح في التقرير. ولهذا لم تُهيّأ اختبارات Supabase API التي تتطلب مفاتيح وجلسات اختبار في هذه الجولة.

| Component | Status | Tests Passed | Tests Failed | Notes |
|---|---|---:|---:|---|
| Contracts RLS | PASS | 1 سيناريو SQL متعدد العمليات | 0 | قراءات وعملية كتابة وتعديل وحذف، منع Viewer من الكتابة ومنع شركة أخرى وتغيير `organization_id`. اختبار SQL يحاكي `authenticated` وJWT ولا يثبت جلسة Auth حقيقية. |
| بقية RLS وStorage وRPC | NOT TESTED | 0 في هذه الجولة | 0 | نتائج 4E سابقة، لم تُعد مصفوفة كل الأقسام أو اختبارات Storage وRPC الشاملة. |
| API بلا جلسة وبرمز غير صالح | PASS | 8 طلبات رفض | 0 | شُغّل Next.js على `127.0.0.1:3012` بمُعرّفات اختبار محلية. 403 للمسارات المحمية، 405 لطريقة HTTP غير المدعومة. |
| API بجلسات الأدوار | NOT TESTED | 0 | 0 | لم تُشغّل جلسات Supabase Auth محلية صالحة لـ Admin/Operator/Viewer أو محاولات عبر شركتين. |
| Authentication & Recovery | NOT TESTED | 0 | 0 | مراجعة كود فقط؛ لم تُختبر دورة الدخول والخروج والتجديد والاستعادة والدعوات والبريد فعليًا. |
| Cron & Background Jobs | BLOCKED | 2 فحوص رفض HTTP | 0 | تحقق رفض رمز cron غير الصالح والطريقة غير المدعومة. لم تُختبر جدولة الفعل أو التكرار أو البريد؛ تنفذ الوظائف عبر service role. |
| Playwright | PASS | 2 | 0 | Chromium وaxe وفحص XSS في صفحة معزولة، وليست اختبارات دخول أو صلاحيات واجهة حقيقية. |
| Node Tests | PASS | 39 | 0 | بعد تحديث اختبار RBAC للعقود. |
| ESLint | PASS | 1 تشغيل | 0 أخطاء | **17 تحذيرًا** قائمة؛ لم تُخفَ. |
| Production Build | PASS | 1 | 0 | Next.js 15.5.28؛ اكتمل محليًا بعد إصلاح العقود. |
| Dependency Audit | FAIL | 0 | 3 تنبيهات متوسطة | `@tiptap/core` و`postcss-selector-parser` و`minimatch`؛ صفر عالية وحرجة. لم تُغيّر الاعتماديات. |

## العقود: المشكلة والإصلاح

`contracts` موجود في `supabase-multitenant.sql` وجدول `public.contracts`، وتستخدم سياسة الكتابة `workspace_write('contracts')`. آخر تعريف في `migrations/20261021_knowledge_split.sql` حذف الاسم من القائمة البيضاء وقيد `member_permissions`. في قاعدة الاختبار المحلية قبل الإصلاح أعاد `has_section_access('contracts')` و`workspace_write('contracts')` القيمة `false` حتى لمسؤول شركة نشط. كما كانت سياسة `tenant_contracts` موحدة للعمليات كلها، فلم توفر قراءة مستقلة لـViewer المصرح له.

أُضيف [Migration العقود](../migrations/20261102_contracts_explicit_permission.sql) بعد ملفات 20261024. يعيد الاسم إلى القائمة البيضاء دون تغيير صلاحيات Manager/Operator/Viewer الافتراضية. يمنح `company_admin` صلاحية نموذجية، ويتيح منح غير المسؤولين صلاحية قراءة صريحة. تتطلب الإضافة والتعديل والحذف `workspace_write('contracts')`، لذلك لا يستطيع Viewer الكتابة حتى لو مُنح القراءة. فُصلت سياسات SELECT/INSERT/UPDATE/DELETE داخل معاملة واحدة. أضيف الاسم إلى قائمة إدارة الصلاحيات وإلى نتيجة `get_my_access`.

بعد الإصلاح أعادت دالتا الوصول والكتابة `true` لمسؤول شركة نشط، و`false` لـViewer دون منح. نجح [اختبار SQL المحلي](../tests/local-supabase/contracts-rls.sql): Viewer مخوّل للقراءة فقط، Manager رُفض افتراضيًا ثم استطاع القراءة بعد منحه صراحةً، Operator مُنح العقد صراحةً فاستطاع الإضافة والتعديل والحذف، مسؤول الشركة قرأ السجل، ومستخدم الشركة الثانية لم يقرأ أو يعدّل. رُفض تغيير `organization_id`، ولم يبق أي سجل اختبار بعد `ROLLBACK`. تحقق أيضًا وجود GRANT لكل عملية، وأربع سياسات محددة، وعدم قدرة `authenticated` أو `anon` على إنشاء كائنات داخل `public`.

الاختبار المضاف إلى `tests/local-supabase/authorization-matrix.test.mjs` يهيئ فحصًا عبر Supabase API مستقبلًا، لكنه **تُجاوز 4/4** عند تشغيله بلا مفاتيح وجلسات محلية؛ لا يُحسب إثباتًا عمليًا. لم تُجر إعادة إنشاء قاعدة نظيفة أو تطبيق سلسلة SQL كاملة، حتى لا تُحذف بيانات الاختبار المحلية القائمة.

## API وAuth وCron

فشل اتصال loopback في البيئة المعزولة برسالة منع socket. تشغيل الخادم والطلبات في السياق المحلي المصرح حل المشكلة. أعاد `/api/intake/admin` و`/api/platform/inventory` و`/api/jobs/platform?task=monitor` رفضًا دون اعتماد، وأعاد `/api/organization/users` 405 عند GET. رُفض أيضًا Bearer غير صالح ورمز cron غير صالح. لا تثبت هذه الطلبات صلاحيات الجلسات الحقيقية أو العزل عبر `service_role`.

أُضيف شرط `access.status === 'active'` ووجود `organization_id` إلى `/api/organization/users` قبل حذف عضو، اتساقًا مع تحقق بقية API. لم يثبت اختبار بجلسة مستخدم موقوف سلوك المسار بعد هذا التعديل، لذا يبقى اختبار الانحدار الخاص به مطلوبًا.

مراجعة كود Cron أظهرت أن `/api/jobs/platform` يقبل GET محدد المهمة فقط، ويتحقق من رمز Vault عبر RPC قبل تشغيل وظائف `service_role`، ويعيد أخطاء عامة. `claim_platform_notification` يمنع تكرار بعض الإشعارات، وSite Monitoring يستخدم lease. لم تُختبر فعليًا جدولة cron أو إعادة المحاولة والبريد أو تداخل الشركات تحت حمل متزامن.

## الاعتماديات والمخاطر المتبقية

`pnpm audit --json`: **3 متوسطة، 0 عالية، 0 حرجة**. النسخ المصححة المعلنة: `@tiptap/core >=3.30.4` (قد تتطلب ترقية عائلة TipTap معًا)، `postcss-selector-parser >=6.1.5`، `minimatch >=11.0.1`. لا توجد ترقية تلقائية. يجب تقييم مسارات الوصول والتوافق قبل تحديثها.

العوائق قبل Staging: تشغيل مصفوفة RLS/Storage/RPC لكل الوحدات بجلسات محلية حقيقية؛ تشغيل API بحسابات Admin/Manager/Operator/Viewer وشركتين، خصوصًا مسارات `service_role`؛ اختبار Auth Recovery وMailpit والجلسات الموقوفة؛ اختبار Cron في بيئة معزولة؛ ثم تطبيق سلسلة Migrations من قاعدة فارغة مع مراجعة ترقية القواعد القائمة. لا يكفي نجاح اختبار العقود وحده لإثبات عزل NetExpert بالكامل.

## الملفات المعدلة في Phase 4F

- `migrations/20261102_contracts_explicit_permission.sql`: إصلاح RBAC وسياسات العقود القابل للمراجعة.
- `tests/local-supabase/contracts-rls.sql`: اختبار PostgreSQL محلي يعيد جميع بياناته.
- `tests/local-supabase/authorization-matrix.test.mjs`: سيناريو API للعقود يحتاج تشغيلًا لاحقًا بمفاتيح محلية.
- `lib/rbac.js` و`components/UsersPanel.js` و`tests/workspace.test.mjs`: عرض صلاحية العقود واختبار سلوك القراءة والكتابة.
- `pages/api/organization/users.js`: اشتراط عضوية نشطة في مسار حذف العضو.

## إعادة التشغيل

```text
pnpm test:node
pnpm lint
pnpm build
pnpm test:e2e
pnpm audit
```

اختبار SQL: تحقق من أن الهدف هو الحاوية المحلية `supabase_db_net-expert-security-phase4` وقاعدة `postgres` على `127.0.0.1:55432`، ثم شغّل `tests/local-supabase/contracts-rls.sql` عبر `psql -v ON_ERROR_STOP=1`. لا تطبق Migration على الإنتاج. تشغيل اختبارات `authorization-matrix.test.mjs` يتطلب متغيرات Supabase المحلية فقط و`RUN_LOCAL_SUPABASE_TESTS=1`.

**قرار الجاهزية: NOT READY FOR STAGING.** إصلاح العقود قابل للمراجعة محليًا، لكن تفويض API بجلسات الأدوار وStorage وAuth Recovery لم يُثبت في هذه الجولة.
