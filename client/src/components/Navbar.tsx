import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Navbar({ isBackendConnected, isLoggedIn, onLogout }: { isBackendConnected: boolean, isLoggedIn: boolean, onLogout?: () => void }) {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigationLinks = [
    { name: 'About Us', path: '/about' },
    { name: 'Services', path: '/services' },
    { name: 'Resources', path: '/resources' },
    { name: 'Partner', path: '/partner' },
    { name: 'Careers', path: '/careers' },
    { name: 'FAQs', path: '/faqs' }
  ];

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="w-full bg-[#7DA9A7] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-12 h-12 flex items-center justify-center mr-3">
              <img 
                src="/logo.png" 
                alt="Veraawell Logo" 
                className="w-40 h-auto scale-150"
              />
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            {navigationLinks.map((link) => (
              <a
                key={link.name}
                href={link.path}
                className="text-white font-sans font-semibold hover:text-gray-200 transition-colors duration-200 cursor-pointer"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Sign In Button */}
          <div className="hidden md:block">
            {isLoggedIn ? (
              <button
                onClick={onLogout}
                className="bg-[#7DA9A7] border-2 border-gray-300 text-white font-sans font-semibold px-6 py-2 rounded-full hover:bg-[#6B9593] transition-colors duration-200 shadow-md"
              >
                Logout
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="bg-[#7DA9A7] border-2 border-gray-300 text-white font-sans font-semibold px-6 py-2 rounded-full hover:bg-[#6B9593] transition-colors duration-200 shadow-md"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={toggleMobileMenu}
              className="text-white hover:text-gray-200 focus:outline-none focus:text-gray-200"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 bg-[#7DA9A7] border-t border-[#6B9593]">
              {navigationLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.path}
                  className="block px-3 py-2 text-white font-sans font-semibold hover:text-gray-200 transition-colors duration-200"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <div className="pt-4">
                {isLoggedIn ? (
                  <button
                    onClick={() => {
                      onLogout?.();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full bg-[#7DA9A7] border-2 border-gray-300 text-white font-sans font-semibold px-6 py-2 rounded-full hover:bg-[#6B9593] transition-colors duration-200"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      navigate('/login');
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full bg-[#7DA9A7] border-2 border-gray-300 text-white font-sans font-semibold px-6 py-2 rounded-full hover:bg-[#6B9593] transition-colors duration-200"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
} 