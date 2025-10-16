import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigationLinks = [
    { name: 'About Us', path: '/about' },
    { name: 'Services', path: '/services' },
    { name: 'Resources', path: '/resources' },
    { name: 'Partner', path: '/partner' },
    { name: 'Careers', path: '/careers' },
  ];

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const AuthButton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
    const commonClasses = 'font-bree-serif font-semibold px-6 py-2 rounded-full transition-colors duration-300';
    const mobileClasses = isMobile ? 'w-full' : '';

    if (isLoggedIn) {
      const handleLogout = async () => {
        await logout();
        if (isMobile) setIsMobileMenuOpen(false);
        navigate('/', { replace: true });
        window.location.href = '/';
      };

      return (
        <button
          onClick={handleLogout}
          className={`${commonClasses} ${mobileClasses} bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#7DA9A7]`}
        >
          Logout
        </button>
      );
    }

    return (
      <button
        onClick={isMobile ? () => { navigate('/login'); setIsMobileMenuOpen(false); } : () => navigate('/login')}
        className={`${commonClasses} ${mobileClasses} bg-white text-[#7DA9A7] hover:bg-gray-200`}
      >
        Sign In
      </button>
    );
  };

  return (
    <nav className="w-full bg-[#7DA9A7] shadow-md font-bree-serif">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex-shrink-0 cursor-pointer" onClick={() => {
            if (isLoggedIn && user) {
              const dashboardPath = user.role === 'doctor' ? '/doctor-dashboard' : '/patient-dashboard';
              navigate(dashboardPath);
            } else {
              navigate('/');
            }
          }}>
            <img src="/logo.png" alt="Veraawell Logo" className="h-24 w-auto" />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-10">
            {navigationLinks.map((link) => (
              <a key={link.name} href={link.path} className="text-white text-lg hover:text-gray-200 transition-colors">
                {link.name}
              </a>
            ))}
          </div>

          {/* Desktop Auth Button */}
          <div className="hidden md:block">
            <AuthButton />
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button onClick={toggleMobileMenu} className="text-white p-2 rounded-md focus:outline-none">
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-4 pt-4 pb-6 space-y-4">
            {navigationLinks.map((link) => (
              <a key={link.name} href={link.path} className="block text-white text-lg hover:text-gray-200" onClick={() => setIsMobileMenuOpen(false)}>
                {link.name}
              </a>
            ))}
            <div className="pt-4">
              <AuthButton isMobile />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}