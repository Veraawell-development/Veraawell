import HeroSection from '../components/HeroSection';
import FeaturesSection from '../components/landing/features';
import WhatIsVeraawell from '../components/landing/about';
import MissionStats from '../components/landing/statistics';
import Reviews from '../components/landing/testimonials';

export default function LandingPage({ onLogin, onSignup, username, userRole, onLogout }: {
  onLogin: () => void;
  onSignup: () => void;
  username?: string;
  userRole?: string;
  onLogout?: () => void;
}) {
  return (
    <>
      <HeroSection onLogin={onLogin} onSignup={onSignup} username={username} userRole={userRole} onLogout={onLogout} />
      <FeaturesSection />
      <WhatIsVeraawell />
      <MissionStats />
      <Reviews />
    </>
  );
} 