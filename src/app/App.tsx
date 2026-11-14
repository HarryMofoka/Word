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
import { supabase } from '../lib/supabase';
import { fetchMyProfile, signOutSession, updateMyProfile } from '../services/authService';
import { fetchMyPrimaryWallet } from '../services/walletService';

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
  const [session, setSession] = useState<UserSession | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateUser = async (userId: string, email: string, fallbackName: string) => {
      try {
        const [profile, primaryWallet] = await Promise.all([
          fetchMyProfile().catch(() => null),
          fetchMyPrimaryWallet(userId).catch(() => null),
        ]);
        if (!active) return;

        setSession({
          id: userId,
          displayName: profile?.display_name ?? fallbackName,
          email: profile?.email ?? email,
          isNewUser: profile ? !profile.onboarding_completed : true,
        });

        if (primaryWallet) {
          setWallet({
            id: primaryWallet.id,
            address: primaryWallet.address,
            method: primaryWallet.method as WalletState['method'],
            network: 'Testnet',
            recoveryBackedUp: primaryWallet.recovery_backed_up,
            isVerified: primaryWallet.is_verified,
          });
        } else {
          setWallet(null);
        }
      } finally {
        if (active) setAuthReady(true);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session?.user) {
          const u = data.session.user;
          const fallbackName =
            (u.user_metadata?.display_name as string | undefined) ||
            u.email?.split('@')[0] ||
            'Word User';
          hydrateUser(u.id, u.email ?? '', fallbackName);
        } else {
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (active) setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextAuthSession) => {
      if (!active) return;
      if (nextAuthSession?.user) {
        const u = nextAuthSession.user;
        const fallbackName =
          (u.user_metadata?.display_name as string | undefined) ||
          u.email?.split('@')[0] ||
          'Word User';
        hydrateUser(u.id, u.email ?? '', fallbackName);
      } else {
        setSession(null);
        setWallet(null);
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

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
      navigate('app');
    },
    [navigate]
  );

  const handleWalletChange = useCallback((nextWallet: WalletState | null) => {
    setWallet(nextWallet);
  }, []);

  const handleSessionUpdate = useCallback((updated: UserSession) => {
    setSession(updated);
    updateMyProfile({ displayName: updated.displayName }).catch(() => {
      // handled gracefully in UI
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOutSession();
    } catch {
      // fallback clear
    }
    setSession(null);
    setWallet(null);
    navigate('signin');
  }, [navigate]);

  // Separate Word App Workspace (linked after Sign in / Sign up)
  if (route === 'app') {
    if (!authReady) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--ink)',
            background: 'var(--bg)',
          }}
        >
          <p className="body-md">Loading your Word workspace...</p>
        </div>
      );
    }
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
