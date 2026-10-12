import { useEffect, useMemo, useRef, useState } from 'react';
import { fieldsFor, modules } from '../lib/modules';
import { downloadAttachment, listRecords } from '../lib/workspace';

const recordModules = ['sim', 'assets', 'purchasing'];
const normalize = value => String(value ?? '').trim().toLocaleLowerCase().normalize('NFKC')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ');
const personName = record => String(record.employee_name || record.requested_by || '').trim();
const displayValue = value => value === null || value === undefined || value === '' ? '—'
  : typeof value === 'object' ? JSON.stringify(value) : String(value);
const summary = (module, record, ar) => {
  if (module === 'sim') return `${ar ? 'الشريحة' : 'SIM'}: ${record.sim_number || '—'}`;
  if (module === 'assets') return `${record.hardware || (ar ? 'جهاز' : 'Device')} — ${record.model || record.serial_number || '—'}`;
  return `${ar ? 'طلب' : 'Request'}: ${record.request_number || '—'}`;
};

export default function GlobalEmployeeSearch({ user, ar, allowedModules, onClose }) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const input = useRef(null);
  const modulesToLoad = recordModules.filter(module => allowedModules.includes(module));

  useEffect(() => {
    input.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled(modulesToLoad.map(module => listRecords(module))).then(results => {
      if (!active) return;
      setRecords(results.flatMap((result, index) => result.status === 'fulfilled'
        ? result.value.map(record => ({ module: modulesToLoad[index], record })) : []));
      if (results.some(result => result.status === 'rejected')) {
        setError(ar ? 'تعذر تحميل بعض الأقسام. قد تكون النتائج غير مكتملة.' : 'Some sections could not be loaded. Results may be incomplete.');
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user.organization_id, allowedModules.join(','), ar]);

  const groups = useMemo(() => {
    const term = normalize(query);
    if (!term) return [];
    const direct = records.filter(({ record }) => normalize(personName(record)).includes(term)
      || normalize(record.employee_id).includes(term));
    const directKeys = new Set(direct.map(({ module, record }) => `${module}:${record.id}`));
    const ids = new Set(direct.map(({ record }) => normalize(record.employee_id)).filter(Boolean));
    const names = new Set(direct.map(({ record }) => normalize(personName(record))).filter(Boolean));
    const matched = records.filter(({ module, record }) => directKeys.has(`${module}:${record.id}`)
      || (record.employee_id && ids.has(normalize(record.employee_id)))
      || names.has(normalize(personName(record))));
    const byName = new Map();
    for (const item of matched) {
      const name = personName(item.record);
      const key = normalize(name) || `record:${item.record.id}`;
      if (!byName.has(key)) byName.set(key, { name: name || '—', ids: new Set(), items: [] });
      const group = byName.get(key);
      if (item.record.employee_id) group.ids.add(item.record.employee_id);
      group.items.push(item);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, ar ? 'ar' : 'en'));
  }, [records, query, ar]);

  const download = file => {
    setFileError('');
    downloadAttachment(file).catch(() => setFileError(ar ? 'تعذر تنزيل المرفق.' : 'Could not download the attachment.'));
  };

  return <div className="work-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="work-details global-search" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
      <header><h2 id="global-search-title">{ar ? 'بحث شامل عن موظف' : 'Search all employee records'}</h2><button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}>×</button></header>
      <div className="global-search-body">
        <label htmlFor="global-employee-query">{ar ? 'اسم الموظف أو رقمه الوظيفي' : 'Employee name or ID'}</label>
        <input id="global-employee-query" ref={input} value={query} onChange={event => setQuery(event.target.value)} placeholder={ar ? 'اكتب اسم الموظف…' : 'Enter an employee name…'} autoComplete="off" />
        {error && <p className="work-error" role="alert">{error}</p>}
        {fileError && <p className="work-error" role="alert">{fileError}</p>}
        {loading ? <p role="status" className="work-muted">{ar ? 'جارٍ تحميل السجلات…' : 'Loading records…'}</p>
          : !modulesToLoad.length ? <p className="work-muted">{ar ? 'لا توجد أقسام سجلات متاحة لحسابك.' : 'No record sections are available to your account.'}</p>
            : !query.trim() ? <p className="work-muted">{ar ? 'ابحث بالاسم لعرض الشرائح والأجهزة والطلبات المرتبطة به.' : 'Search by name to see related SIMs, devices, and purchase requests.'}</p>
              : !groups.length ? <p className="work-muted">{ar ? 'لا توجد سجلات مطابقة.' : 'No matching records.'}</p>
                : <><p className="work-muted">{groups.length} {ar ? 'موظف مطابق' : 'matching employees'}</p>{groups.map(group => <article className="global-search-person" key={normalize(group.name)}>
                  <h3>{group.name}</h3>{group.ids.size > 0 && <p className="work-muted">{ar ? 'الرقم الوظيفي' : 'Employee ID'}: {[...group.ids].join('، ')}</p>}
                  {recordModules.filter(module => group.items.some(item => item.module === module)).map(module => <section key={module}>
                    <h4>{ar ? modules[module].ar : modules[module].en} <span>({group.items.filter(item => item.module === module).length})</span></h4>
                    {group.items.filter(item => item.module === module).map(({ record }) => <details key={`${module}-${record.id}`}>
                      <summary>{summary(module, record, ar)}</summary>
                      <dl>{fieldsFor(module).map(field => <div key={field.key}><dt>{ar ? field.ar : field.en}</dt><dd>{displayValue(record[field.key])}</dd></div>)}
                        {Object.entries(record.imported_fields || {}).map(([key, value]) => <div key={`imported-${key}`}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}
                      </dl>
                      {record.attachments?.length > 0 && <div className="global-search-files"><strong>{ar ? 'المرفقات' : 'Attachments'}</strong>{record.attachments.map(file => <button key={file.path} onClick={() => download(file)}>{file.name} ↓</button>)}</div>}
                    </details>)}
                  </section>)}
                </article>)}</>}
      </div>
    </section>
  </div>;
}
