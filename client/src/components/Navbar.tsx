import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuth();
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [resourcesDropdownOpen, setResourcesDropdownOpen] = useState(false);

  interface NavLink {
    name: string;
    path: string;
    dropdown?: { name: string; path: string; }[];
  }

  const getHomeLink = (): NavLink => {
    // Check Admin Context first
    if (admin) {
      return { name: 'Home', path: '/admin-dashboard' };
    }

    // Check User Context
    if (isLoggedIn && user) {
      if (user.role === 'doctor') {
        return { name: 'Home', path: '/doctor-dashboard' };
      }
      return { name: 'Home', path: '/patient-dashboard' };
    }

    // Default guest
    return { name: 'Home', path: '/' };
  };

  const navigationLinks: NavLink[] = [
    getHomeLink(),
    { name: 'About Us', path: '/about' },
    { name: 'Services', path: '/services' },
    {
      name: 'Resources',
      path: '/resources',
      dropdown: [
        { name: 'Articles', path: '/resources/articles' },
        { name: 'Videos', path: '/resources/videos' }
      ]
    },
    { name: 'FAQ', path: '/faq' },
    { name: 'Partner', path: '/partner' },
    { name: 'Careers', path: '/careers' },
  ];

  const [dropdownTimer, setDropdownTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleDropdownEnter = () => {
    if (dropdownTimer) {
      clearTimeout(dropdownTimer);
      setDropdownTimer(null);
    }
    setResourcesDropdownOpen(true);
  };

  const handleDropdownLeave = () => {
    const timer = setTimeout(() => {
      setResourcesDropdownOpen(false);
    }, 300); // 300ms delay before hiding
    setDropdownTimer(timer);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const AuthButton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
    const commonClasses = isMobile
      ? 'font-bree-serif font-semibold px-4 py-2 rounded-full transition-colors duration-300 text-sm'
      : 'font-bree-serif font-semibold px-6 py-2 rounded-full transition-colors duration-300';
    const mobileClasses = isMobile ? 'w-full' : '';

    if (isLoggedIn) {
      const handleLogout = async () => {
        await logout();
        if (isMobile) setIsMobileMenuOpen(false);
        navigate('/', { replace: true });
        window.location.href = '/';
      };

      const handleProfile = () => {
        if (isMobile) setIsMobileMenuOpen(false);
        // Redirect based on user role
        if (user?.role === 'patient') {
          navigate('/patient-profile-setup');
        } else {
          navigate('/profile-setup');
        }
      };

      return (
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-2`}>
          <button
            onClick={handleProfile}
            className={`${commonClasses} ${mobileClasses} bg-white text-[#7DA9A7] hover:bg-gray-200`}
          >
            My Profile
          </button>
          <button
            onClick={handleLogout}
            className={`${commonClasses} ${mobileClasses} bg-transparent border-2 border-white text-white hover:bg-white hover:text-[#7DA9A7]`}
          >
            Logout
          </button>
        </div>
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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <div className="flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logo.png" alt="Veraawell Logo" className="h-14 md:h-24 w-auto" />
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6 lg:space-x-10">
            {navigationLinks.map((link) => (
              <div
                key={link.name}
                className="relative"
                onMouseEnter={() => link.dropdown && handleDropdownEnter()}
                onMouseLeave={() => link.dropdown && handleDropdownLeave()}
              >
                {link.dropdown ? (
                  <>
                    <button className="text-white text-base lg:text-lg hover:text-gray-200 transition-colors flex items-center gap-1">
                      {link.name}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {resourcesDropdownOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
                        {link.dropdown.map((item) => (
                          <a
                            key={item.name}
                            href={item.path}
                            className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            {item.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a href={link.path} className="text-white text-base lg:text-lg hover:text-gray-200 transition-colors">
                    {link.name}
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* Desktop Auth Button */}
          <div className="hidden md:block">
            <AuthButton />
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button onClick={toggleMobileMenu} className="text-white p-1.5 rounded-md focus:outline-none">
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
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-3 pt-3 pb-4 space-y-2">
            {navigationLinks.map((link) => (
              <div key={link.name}>
                {link.dropdown ? (
                  <div>
                    <button
                      onClick={() => setResourcesDropdownOpen(!resourcesDropdownOpen)}
                      className="w-full text-left text-white text-sm py-2 hover:text-gray-200 flex items-center justify-between"
                    >
                      {link.name}
                      <svg className={`w-4 h-4 transition-transform ${resourcesDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {resourcesDropdownOpen && (
                      <div className="pl-4 space-y-1 mt-1">
                        {link.dropdown.map((item) => (
                          <a
                            key={item.name}
                            href={item.path}
                            className="block text-white/80 text-sm py-1.5 hover:text-white"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {item.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <a href={link.path} className="block text-white text-sm py-2 hover:text-gray-200" onClick={() => setIsMobileMenuOpen(false)}>
                    {link.name}
                  </a>
                )}
              </div>
            ))}
            <div className="pt-2">
              <AuthButton isMobile />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}