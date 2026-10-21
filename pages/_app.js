import '../styles/globals.css';
import '../styles/workspace.css';
import '../styles/sidebar.css';
import '../styles/home.css';
import '../styles/knowledge-enterprise.css';
import '../styles/import.css';
import '../styles/intake.css';
import '../styles/platform.css';
import '../styles/monitoring.css';
import '../styles/monitor-chart.css';
import '../styles/custody.css';
import '../styles/dashboard-charts.css';
import '../styles/enterprise.css';
import '../styles/operations.css';
import { AuthProvider } from '../components/AuthContext';
import { ThemeProvider } from '../components/ThemeContext';

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ThemeProvider>
  );
}
