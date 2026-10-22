const features = [
  { icon: 'devices', ar: ['الأجهزة والأصول', 'متابعة الأجهزة التقنية والشرائح والمخزون.'], en: ['Devices & assets', 'Track IT devices, SIM cards, and inventory.'] },
  { icon: 'requests', ar: ['البلاغات والطلبات', 'تنظيم البلاغات التقنية وطلبات الأجهزة ومتابعتها.'], en: ['Reports & requests', 'Organize and follow technical reports and device requests.'] },
  { icon: 'services', ar: ['الخدمات والمراقبة', 'إدارة الاشتراكات ومتابعة حالة المواقع.'], en: ['Services & monitoring', 'Manage subscriptions and monitor website status.'] },
];

function Brand({ className = '' }) {
  return <div className={`login-brand ${className}`}><span className="login-product-mark" aria-hidden="true">N</span><span>NetExpert</span></div>;
}

function FeatureIcon({ kind }) {
  const path = kind === 'devices'
    ? <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>
    : kind === 'requests'
      ? <><path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/></>
      : <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
}

export default function AccountShell({ ar, onLanguage, children }) {
  const dir = ar ? 'rtl' : 'ltr';
  return <main className="login-shell" dir="ltr">
    <section className="login-product" dir={dir} aria-label={ar ? 'عن منصة NetExpert' : 'About NetExpert'}>
      <div className="login-product-inner">
        <Brand />
        <div className="login-proposition">
          <p className="login-eyebrow">NetExpert <span aria-hidden="true">|</span> {ar ? 'مساحة العمل' : 'Workspace'}</p>
          <h1>{ar ? 'منصة متكاملة لإدارة تقنية المعلومات' : 'One platform for IT management'}</h1>
          <p className="login-description">{ar ? 'إدارة الأجهزة التقنية وشرائح الاتصال والبلاغات والطلبات والمشتريات والاشتراكات ومراقبة المواقع من منصة واحدة.' : 'Manage IT devices, SIM cards, reports, requests, purchasing, subscriptions, and website monitoring in one platform.'}</p>
        </div>
        <ul className="login-capabilities">{features.map(feature => <li key={feature.icon}><span className="login-feature-icon"><FeatureIcon kind={feature.icon}/></span><span><b>{feature[dir === 'rtl' ? 'ar' : 'en'][0]}</b><small>{feature[dir === 'rtl' ? 'ar' : 'en'][1]}</small></span></li>)}</ul>
      </div>
    </section>
    <section className="login-access" dir={dir}>
      <div className="login-access-inner">
        <div className="login-access-top"><Brand className="login-mobile-brand" />{onLanguage&&<button type="button" className="login-language" onClick={onLanguage} aria-label={ar?'Switch to English':'التبديل إلى العربية'}>{ar?'EN':'العربية'}</button>}</div>
        <div className="login-card">{children}</div>
        <footer className="login-access-footer"><span>© NetExpert {new Date().getFullYear()}</span><span>{ar ? 'الخصوصية والأمان' : 'Privacy & security'}</span></footer>
      </div>
    </section>
  </main>;
}
