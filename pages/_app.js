import '../styles/globals.css';
import '../styles/workspace.css';
import '../styles/import.css';
import { AuthProvider } from '../components/AuthContext';
import { ThemeProvider } from '../components/ThemeContext';
import AppErrorBoundary from '../components/AppErrorBoundary';

export default function App({ Component, pageProps }) {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
