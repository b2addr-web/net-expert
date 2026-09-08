import '../styles/globals.css';
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
