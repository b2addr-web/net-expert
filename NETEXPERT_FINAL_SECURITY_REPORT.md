# NetExpert — Final Security Remediation Report

**التاريخ:** 2 نوفمبر 2026. **الفرع:** `codex/security-phase-4`. **HEAD عند الفحص:** `a5d50696fbe24a83f8fa57034b3ea1998858167e`. جميع التغييرات محلية وغير مدفوعة. لم تُستخدم قاعدة الإنتاج أو حسابات حقيقية.

## القرار

**NOT READY FOR STAGING.** الإصلاحات والاختبارات المحلية خفّضت المخاطر، لكن `pnpm audit` ما زال يجد تنبيهين متوسطين دون قبول خطر صريح، ونجاح فحص موقع مراقبة فعلي ومهلات/إعادة محاولات كل الوظائف المجدولة لم يُثبت، ولم تُختبر جميع RPC والعمليات في مصفوفة شاملة. لا يصح وصف هذه الفجوات بأنها PASS.

## المشاكل والإصلاحات

| Issue | Root Cause | Fix | Verification | Status |
|---|---|---|---|---|
| GRANT Drift على 37/38 جدولًا | اختلاف GRANT الفعلي بين تثبيت قديم ونظيف، مع نقص ثلاثة ملفات SQL في سلسلة التثبيت النظيف | `migrations/20261102_canonical_privilege_baseline.sql` وسلسلة تأسيس تشمل `supabase-auth-repair.sql` و`supabase-excel-import.sql` و`supabase-workspace-history.sql` | `tests/phase4h/compare-privileges.mjs --phase4h --after`: 0 اختلافات جداول، 0 عروض، 0 تسلسلات، 0 دوال؛ 70 GRANT للمصادَقين و0 لـanon على الجداول | PASS للكائنات الحالية |
| صلاحيات الكائنات المستقبلية | `pg_default_acl` الخاص بدور `supabase_admin` يختلف بين مثيلي Supabase؛ `postgres` لا يملك تعديل امتيازات دور آخر | حُدّدت امتيازات `postgres` الافتراضية في migration؛ لم نتجاوز ملكية `supabase_admin` | محاولة تعديل افتراضيات `supabase_admin` رُفضت برسالة `permission denied to change default privileges`؛ تراجع التعديل داخل المعاملة | BLOCKED لتوحيد المستقبل |
| دعوة الموظف توجه إلى الإنتاج من المحلي | Redirect ثابت؛ Trigger يقبل الدعوة عند إنشاء Auth user قبل تأكيد البريد | قائمة Origins مسموحة حسب البيئة، وMigration `20261102_invitation_acceptance_hardening.sql` يؤجل العضوية حتى تأكيد البريد ويضبط انتهاء الدعوة | Mailpit محلي: الدعوة الجديدة pending قبل فتح الرابط، ثم accepted؛ الملغاة والمنتهية لا تمنح عضوية | PASS محليًا |
| هدف الوظائف المجدولة ثابت للإنتاج | وظيفة استدعاء Cron استخدمت عنوان الإنتاج | `20261102_platform_job_target_config.sql` يقرأ هدفًا من Vault ويقبل هدفًا محليًا محددًا للاختبار مع إبقاء fallback الإنتاجي | `pg_cron` محلي نفذ وظيفة الاشتراكات لشركتين؛ سجلان بلا تكرار، واستدعاءات مجهولة مرفوضة | PASS لمسار الاشتراكات |
| مراقبة موقع محلي | دفاع SSRF يمنع localhost و`.test`، وهو سلوك أمني صحيح | لم تُضعف الحماية | عاملان متزامنان حجزا موقعين لشركتين بلا معالجة مكررة، ثم رُفض الهدف غير الآمن؛ probe ناجح لم يُختبر | PARTIAL |
| `postcss-selector-parser` | نسخة متعدية متأثرة من Tailwind | Override متوافق إلى 6.1.5 في `pnpm-workspace.yaml` | `pnpm why` وتدقيق الاعتماديات: 3 متوسطة قبل، 2 بعد؛ Node/ESLint/Build/Playwright ناجحة | PASS |
| `@tiptap/core` و`minimatch` | إصدارات متأثرة؛ إصلاحهما المتاح يتطلب سلسلة Major/اعتماديات مترابطة | لم تُفرض Overrides غير متوافقة أو ترقية محرر بلا E2E كامل | `pnpm audit --json`: 2 متوسطة، 0 عالية/حرجة | OPEN |

## أدلة الاختبار

| Component | Status | Tests Passed | Tests Failed | Notes |
|---|---|---:|---:|---|
| مقارنة GRANT الحالية | PASS | 39 جدولًا، عرض واحد، 13 تسلسلًا، 41 دالة بلا اختلاف فعلي | 0 | [النتيجة التفصيلية](docs/security-phase-4h-grants-after.md)؛ اختلاف افتراضي `supabase_admin` موثق |
| تكامل Supabase الأساسي | PASS في آخر Gate | 29 | 0 | 3 SKIP تخص Cron على هذا المثيل وتُنفذ على المثيل المعزول |
| تكامل Supabase المعزول وCron | PASS في آخر Gate | 29 | 0 | 3 SKIP تخص Mailpit وEdge Runtime وتُنفذ على المثيل الأساسي |
| Playwright بجلسة Auth حقيقية | PASS في آخر Gate | 1 | 0 | Viewer read-only، عزل شركتين، إضافة مسؤول، خروج. فشل سابق بسبب سباق انتقال صفحة الدخول ثم أصلح محدد الاختبار |
| Node Tests | PASS | 39 | 0 | شمل XSS والتشفير وRBAC |
| Playwright المعزول | PASS | 2 | 0 | Chromium وaxe وXSS |
| ESLint | PASS مع تحذيرات | 0 أخطاء | 0 | 17 تحذيرًا، بعضها Hooks؛ لم تُخفَ |
| Production Build محلي | PASS | 1 | 0 | Next.js 15.5.28 |
| Dependency Audit | FAIL للبوابة | 0 عالي/حرج | 2 متوسط | TipTap وminimatch |
| Cron: probe محلي ناجح، retries، timeouts، إرسال بريد ناجح | NOT TESTED | 0 | 0 | دفاع SSRF يمنع أهداف loopback؛ لم يُسمح باتصال خارجي أو إرسال بريد حقيقي |
| RPC/Auth/Storage الشامل لكل المسارات | PARTIAL | حالات حساسة منفذة | 0 مؤكدة | ليست مصفوفة كاملة لكل دالة وسجل وBucket |

## حفظ البيانات والترقية

`tests/phase4h/apply-upgrade.mjs` يتحقق من منفذ Docker المحلي ومن عدد سجلات organizations/devices/workspace_records/knowledge_items/storage.objects قبل وبعد تطبيق migrations؛ لم ينخفض العدد. السلسلة النظيفة طبقت ملفات الجذر والمهاجرات الأساسية على مثيل ثالث معزول، ثم طبقت migrations الدعوات والوظائف الجديدة عليه دون إعادة تهيئة بياناته. لم يُختبر التثبيت الكامل من الصفر بعد آخر تعديل في تجربة رابعة مستقلة؛ يُعد ذلك **NOT TESTED** بدل ادعاء النجاح. لم يُختبر rollback تنفيذي؛ خطة الاستعادة لمرحلة Staging في الملف المرفق.

## الملفات الأساسية المتغيرة

`migrations/20261102_canonical_privilege_baseline.sql`، `migrations/20261102_invitation_acceptance_hardening.sql`، `migrations/20261102_platform_job_target_config.sql`، `supabase/functions/invite-organization-user/index.ts`، `tests/phase4g-clean/apply-schema.mjs`، `tests/phase4h/`، `tests/local-supabase/`، `tests/e2e/security-auth.spec.mjs`، `lib/supabase.js`، `next.config.js`، `pnpm-workspace.yaml`، `pnpm-lock.yaml`، `package.json`، `tests/security-verify.mjs`. بقيت تغييرات المراحل 4E–4G المحلية الأخرى محفوظة. راجع `git status` قبل أي commit؛ لم يُجر Push أو Deploy أو Merge.

## إعادة التحقق

`pnpm security:verify` يوقف الجاهزية عند فشل أي خطوة ويسجل JSON في `security-verification-results.json`. آخر تشغيل موثق أعطى PASS لمقارنة RLS، ومقارنة GRANT، ومجموعتي التكامل (29 PASS و3 SKIP تكميلي لكل مثيل)، واختبار المتصفح الحقيقي، وNode، وPlaywright المعزول، وESLint، وBuild. أعطى FAIL لتدقيق الاعتماديات بسبب تنبيهين متوسطين. يتطلب الأمر Docker وثلاثة مثيلات Supabase المحلية على المنافذ 55431 و56431 و57431، Chromium مثبتًا، واتصالًا بسجل npm. لا تُحتسب SKIP فردية على أنها PASS؛ الاختبارات المكملة نُفذت في المثيل الآخر.

## ما يلزم لإغلاق البوابة

1. معالجة تنبيهي TipTap وminimatch بترقية متوافقة واختبارات محرر/استيراد، أو قبول خطر صريح بعد تقييم منفصل.
2. إزالة مخاطر SKIP الإلزامية المتبقية بتشغيل كل فئة في مثيلها المحلي والتحقق من وجود الخدمات قبل التقييم؛ آخر Gate أثبت نجاح مجموعتي التكامل لكن ما زال يرفض الجاهزية بسبب audit.
3. إنشاء مثيل نظيف جديد للسلسلة النهائية كاملة ومقارنة مخططها وصلاحياتها مع ترقية نسخة قائمة.
4. حسم امتيازات `supabase_admin` الافتراضية في إعداد Supabase المناسب أو جعل مراجعة GRANT لكل كائن جديد حاجزًا إلزاميًا.
5. اختبار بقية Cron والـRPC والـStorage والـAuth ذات الأولوية، باستخدام Mock آمن لا يضعف حماية SSRF.
