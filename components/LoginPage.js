import { useState } from 'react';
import { useAuth } from './AuthContext';

const metrics = [
  { value: '12,480', label: 'Managed Assets', labelAr: 'أصل مُدار' },
  { value: '186', label: 'Active Contracts', labelAr: 'عقد نشط' },
  { value: '34', label: 'Maintenance Tasks', labelAr: 'مهمة صيانة' },
];

function ProductMark() {
  return (
    <span className="login-product-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M5 7.5 12 3.5l7 4v8l-7 4-7-4v-8Z" />
        <path d="m5 7.5 7 4 7-4M12 11.5v8" />
      </svg>
    </span>
  );
}

export default function LoginPage({ t }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isAr = t.dir === 'rtl';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const authenticated = login(username.trim(), password);
    if (!authenticated) setError(t.wrongCreds);
    setLoading(false);
  };

  return (
    <main className="login-shell" dir="ltr">
      <section className="login-product" dir={t.dir} aria-labelledby="product-title">
        <div className="login-product-inner">
          <header className="login-brand">
            <ProductMark />
            <span>Net Expert</span>
          </header>

          <div className="login-proposition">
            <p className="login-eyebrow">IT ASSET MANAGEMENT</p>
            <h1 id="product-title">Net Expert</h1>
            <p className="login-subtitle">Asset Operations Platform</p>
            <p className="login-description">
              {isAr
                ? 'مساحة موحدة لإدارة دورة حياة الأصول التقنية، العقود، وأعمال الصيانة عبر المؤسسة.'
                : 'One operational system for technology assets, contracts, and maintenance across your organization.'}
            </p>
          </div>

          <dl className="login-metrics" aria-label={isAr ? 'مؤشرات تشغيلية' : 'Operational indicators'}>
            {metrics.map((metric) => (
              <div key={metric.label}>
                <dt>{isAr ? metric.labelAr : metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>

          <footer className="login-product-footer">
            <span>{isAr ? 'بيئة المؤسسة' : 'Enterprise workspace'}</span>
            <span className="login-service-state">
              <i aria-hidden="true" />
              {isAr ? 'جميع الأنظمة تعمل' : 'All systems operational'}
            </span>
          </footer>
        </div>
      </section>

      <section className="login-access" dir={t.dir} aria-labelledby="login-title">
        <div className="login-access-inner">
          <div className="login-mobile-brand">
            <ProductMark />
            <span>Net Expert</span>
          </div>

          <div className="login-card">
            <div className="login-heading">
              <h2 id="login-title">{t.login}</h2>
              <p>
                {isAr
                  ? 'استخدم حساب المؤسسة للوصول إلى مساحة العمل.'
                  : 'Use your organization account to access the workspace.'}
              </p>
            </div>


            <form onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="username">{t.username}</label>
                <input
                  id="username"
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div className="login-field">
                <div className="login-field-row">
                  <label htmlFor="password">{t.password}</label>
                  <button type="button" className="login-text-link">
                    {isAr ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                  </button>
                </div>
                <div className="login-password-control">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((visible) => !showPassword)}
                    aria-label={isAr ? 'إظهار أو إخفاء كلمة المرور' : 'Show or hide password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                  </button>
                </div>
              </div>

              {error && <div className="login-error" role="alert">{error}</div>}

              <button className="login-submit" type="submit" disabled={loading || !username || !password}>
                {loading ? (isAr ? 'جارٍ تسجيل الدخول…' : 'Signing in…') : t.loginBtn}
              </button>
            </form>

            <p className="login-support">
              {isAr ? 'تواجه مشكلة في الوصول؟' : 'Having trouble accessing your account?'}{' '}
              <button type="button">{isAr ? 'تواصل مع مسؤول النظام' : 'Contact your administrator'}</button>
            </p>
          </div>

          <footer className="login-access-footer">
            <span>© {new Date().getFullYear()} Net Expert</span>
            <button type="button">{isAr ? 'الخصوصية' : 'Privacy'}</button>
            <button type="button">{isAr ? 'الشروط' : 'Terms'}</button>
          </footer>
        </div>
      </section>
    </main>
  );
}
