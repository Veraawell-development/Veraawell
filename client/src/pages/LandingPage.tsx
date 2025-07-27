import HeroSection from '../components/HeroSection';

export default function LandingPage({ onLogin, onSignup, username, onLogout }: {
  onLogin: () => void;
  onSignup: () => void;
  username?: string;
  onLogout?: () => void;
}) {
  return <HeroSection onLogin={onLogin} onSignup={onSignup} username={username} onLogout={onLogout} />;
} 