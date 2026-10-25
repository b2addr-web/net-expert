function Brand({ className = '' }) {
  return <div className={`login-brand ${className}`}><span className="login-product-mark" aria-hidden="true">N</span><span>NetExpert</span></div>;
}

export default function AccountShell({ ar, onLanguage, children }) {
  const dir = ar ? 'rtl' : 'ltr';
  return <main className="login-shell" dir="ltr">
    <section className="login-product" dir={dir} aria-label={ar ? 'عن منصة NetExpert' : 'About NetExpert'}>
      <div className="login-product-inner">
        <Brand />
        <div className="login-proposition">
          <p className="login-eyebrow">NetExpert <span aria-hidden="true">|</span> {ar ? 'مساحة العمل' : 'Workspace'}</p>
          <h1>{ar ? 'إدارة التقنية تبدأ برؤية مختلفة.' : 'IT management starts with a different perspective.'}</h1>
          <p className="login-description">{ar ? 'مساحة واحدة. رؤية أوضح. تجربة تستحق الاكتشاف.' : 'One space. A clearer view. An experience worth discovering.'}</p>
        </div>
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
