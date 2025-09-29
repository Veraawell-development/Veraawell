import HeroSection from '../components/HeroSection';
import FeaturesSection from '../components/landing/features';
import WhatIsVeraawell from '../components/landing/about';
import MissionStats from '../components/landing/statistics';
import Reviews from '../components/landing/testimonials';

export default function LandingPage({ username, userRole, onLogout }: {
  username?: string;
  userRole?: string;
  onLogout?: () => void;
}) {
  return (
    <>
      <HeroSection username={username} userRole={userRole} onLogout={onLogout} />
      <FeaturesSection />
      <WhatIsVeraawell />
      <MissionStats />
      <Reviews />
    </>
  );
} 