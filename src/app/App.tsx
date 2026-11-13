import React, { useCallback, useEffect, useState } from 'react';
import type { AppRoute } from '../types';
import type { UserSession, WalletState } from '../app-workspace/types';
import { Navbar } from '../components/navigation/Navbar';
import { Hero } from '../components/hero/Hero';
import { Problem } from '../components/sections/Problem';
import { HowItWorks } from '../components/sections/HowItWorks';
import { Features } from '../components/sections/Features';
import { Security } from '../components/sections/Security';
import { Assistant } from '../components/sections/Assistant';
import { Audience } from '../components/sections/Audience';
import { Accountability } from '../components/sections/Accountability';
import { Ecosystem } from '../components/sections/Ecosystem';
import { FAQ } from '../components/sections/FAQ';
import { FinalCTA } from '../components/sections/FinalCTA';
import { Footer } from '../components/footer/Footer';
import { AuthPage } from '../components/pages/AuthPages';
import { FrostedInfoPage } from '../components/pages/FrostedInfoPage';
import { WordApp } from '../app-workspace/WordApp';

const SESSION_KEY = 'word_demo_session';
const WALLET_KEY = 'word_demo_wallet';

function readStoredJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function getRouteFromPath(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  switch (clean) {
    case '/signin':
      return 'signin';
    case '/signup':
      return 'signup';
    case '/app':
      return 'app';
    case '/about':
      return 'about';
    case '/contact':
      return 'contact';
    case '/docs':
      return 'docs';
    case '/privacy':
      return 'privacy';
    case '/terms':
      return 'terms';
    default:
      return 'home';
  }
}

function getPathFromRoute(route: AppRoute): string {
  return route === 'home' ? '/' : `/${route}`;
}

export const App: React.FC = () => {
  const [route, setRoute] = useState<AppRoute>(() =>
    getRouteFromPath(typeof window !== 'undefined' ? window.location.pathname : '/')
  );
  const [session, setSession] = useState<UserSession | null>(() =>
    typeof window !== 'undefined' ? readStoredJSON<UserSession>(SESSION_KEY) : null
  );
  const [wallet, setWallet] = useState<WalletState | null>(() =>
    typeof window !== 'undefined' ? readStoredJSON<WalletState>(WALLET_KEY) : null
  );

  useEffect(() => {
    const onPopState = () => {
      setRoute(getRouteFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute, hash?: string) => {
    const targetPath = getPathFromRoute(nextRoute) + (hash && nextRoute === 'home' ? hash : '');
    if (window.location.pathname + window.location.hash !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(nextRoute);

    if (nextRoute === 'home' && hash) {
      requestAnimationFrame(() => {
        const el = document.querySelector(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const handleAuthenticated = useCallback(
    (newSession: UserSession) => {
      setSession(newSession);
      try {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
      } catch {
        // ignore storage quota errors
      }
      navigate('app');
    },
    [navigate]
  );

  const handleWalletChange = useCallback((nextWallet: WalletState | null) => {
    setWallet(nextWallet);
    try {
      if (nextWallet) {
        window.localStorage.setItem(WALLET_KEY, JSON.stringify(nextWallet));
      } else {
        window.localStorage.removeItem(WALLET_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSessionUpdate = useCallback((updated: UserSession) => {
    setSession(updated);
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
    setWallet(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(WALLET_KEY);
    } catch {
      // ignore storage errors
    }
    navigate('signin');
  }, [navigate]);

  // Separate Word App Workspace (linked after Sign in / Sign up)
  if (route === 'app') {
    if (!session) {
      return (
        <AuthPage
          mode="signin"
          onNavigate={navigate}
          onAuthenticated={handleAuthenticated}
        />
      );
    }
    return (
      <WordApp
        session={session}
        initialWallet={wallet}
        onWalletChange={handleWalletChange}
        onSessionChange={handleSessionUpdate}
        onLogout={handleLogout}
        onNavigateMarketing={navigate}
      />
    );
  }

  // Full-screen Sign In (left frosted) or Sign Up (right frosted)
  if (route === 'signin' || route === 'signup') {
    return (
      <AuthPage
        mode={route}
        onNavigate={navigate}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  // Marketing Website
  return (
    <>
      <Navbar onNavigate={navigate} />
      {route === 'home' ? (
        <main>
          <Hero onNavigate={navigate} />
          <Problem />
          <HowItWorks />
          <Features />
          <Security />
          <Assistant />
          <Audience />
          <Accountability />
          <Ecosystem />
          <FAQ />
          <FinalCTA onNavigate={navigate} />
        </main>
      ) : (
        <main>
          <FrostedInfoPage route={route} onNavigate={navigate} />
        </main>
      )}
      <Footer onNavigate={navigate} />
    </>
  );
};

export default App;
