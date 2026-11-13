import React, { useState } from 'react';
import type { AuthModalMode } from '../types';
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
import { AuthModal } from '../components/ui/AuthModal';

export const App: React.FC = () => {
  const [authMode, setAuthMode] = useState<AuthModalMode>(null);

  return (
    <>
      <Navbar onOpenAuth={setAuthMode} />
      <main>
        <Hero onOpenAuth={setAuthMode} />
        <Problem />
        <HowItWorks />
        <Features />
        <Security />
        <Assistant />
        <Audience />
        <Accountability />
        <Ecosystem />
        <FAQ />
        <FinalCTA onOpenAuth={setAuthMode} />
      </main>
      <Footer />
      <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />
    </>
  );
};

export default App;

