# NetExpert — Phase 4C Security Fix Consolidation

تاريخ التنفيذ: 24 أكتوبر 2026  
الفرع: `codex/security-phase-4`  
النطاق: قاعدة Supabase محلية معزولة فقط. لم يحدث اتصال بالإنتاج أو نشر أو دفع.

## الإصلاح

- عُدّل `supabase-multitenant.sql` كي تستخدم سياسات `devices` دالة `workspace_write('assets')` في INSERT وUPDATE، مع إبقاء شرط الشركة في `USING` و`WITH CHECK`.
- أضيفت صلاحيات جدول `devices` للمستخدم المصادق عليه؛ تبقى RLS هي حدود التفويض الفعلية.
- أضيفت دالة bootstrap لـ`workspace_write` قبل إنشاء السياسات، حتى ينجح التأسيس من قاعدة فارغة.
- أضيف Migration قابل للمراجعة: `migrations/20261024_devices_write_policy_hardening.sql`.

## إعادة البناء المحلية

تم التحقق من عنوان قاعدة الاختبار على `127.0.0.1:55432`، ثم أُعيد إنشاء مخطط `public` المحلي فقط. طُبقت ملفات التأسيس بالترتيب:

1. `supabase-schema.sql`
2. `supabase-multitenant.sql`
3. `supabase-export-center.sql`
4. `supabase-workspace.sql`
5. `supabase-user-presence.sql`
6. `supabase-sim-custody.sql`
7. `supabase-security-hardening.sql`
8. Migrations الزمنية مع تقديم عمليات modules قبل jobs، وcustody قبل الفهارس، وknowledge split قبل attachments.
9. `20261024_devices_write_policy_hardening.sql`.

تم تجاوز `20261014_operations_schedule.sql` فقط لأن صورة Supabase المحلية لا تحتوي مخطط `cron`.

## الاختبارات

| الاختبار | النتيجة |
|---|---|
| Admin A لا يقرأ أجهزة B | ناجح |
| Operator A لا يضيف جهازًا لشركة B | ناجح |
| Viewer A لا يضيف جهازًا بعد الإصلاح | ناجح |
| Viewer A لا يعدل جهازًا بصلاحية قراءة فقط | ناجح |
| Viewer A لا يمنح نفسه الإدارة | ناجح |
| Operator A لا ينقل جهاز B إلى A | ناجح |
| Viewer A لا يقرأ ملفًا خاصًا لشركة B | ناجح |
| كلمة مرور خاطئة وتسجيل الخروج | ناجح |

النتيجة: `8 passed, 0 failed`، مع اختبار API منفصل متوقف عند الحاجة إلى تشغيل Next.js محليًا.

## مراجعة السياسات الأخرى

تم العثور على سياسات كتابة أخرى تستخدم `has_section_access` في المشتريات والمصروفات والأصول والعقود والتصدير والملاحظات. لم تُعدّل تلقائيًا لأن تغييرها يحتاج اختبارات أدوار مستقلة لكل وحدة؛ تُسجل كعنصر مراجعة Staging، ولا تُعد ثغرات مؤكدة من هذا الاختبار.

## غير مكتمل

- تدفقات Auth الكاملة واستعادة البريد: غير منفذة لعدم تشغيل Mailpit.
- cron والجدولة: غير منفذة لغياب إضافة cron محليًا.
- اختبار API الكامل: يحتاج تشغيل Next.js محليًا مع مفاتيح الاختبار.
- لا يوجد إثبات على قاعدة الإنتاج.

## خطة Staging والتراجع

1. تطبيق Migration على نسخة Staging مع نسخة احتياطية.
2. تشغيل اختبارات الأدوار الثمانية قبل وبعد Migration.
3. فحص `pg_policies` وGRANTs ومراجعة سجلات الرفض.
4. التراجع بحذف Migration وإعادة تعريف السياسات السابقة فقط إذا أثبتت اختبارات التوافق ضرورة ذلك؛ لا يُنفذ تلقائيًا.
5. بعد اعتماد النتائج، يُحدد نشر الإنتاج في إجراء منفصل ومصرح.
