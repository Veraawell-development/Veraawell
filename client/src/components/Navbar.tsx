import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { Menu, X, ChevronDown, User } from 'lucide-react';

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

  const navigationLinks: NavLink[] = [
    { name: 'Home', path: '/' },
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
    }, 300);
    setDropdownTimer(timer);
  };

  const AuthButton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

    if (isLoggedIn) {
      const handleLogout = async () => {
        await logout();
        if (isMobile) setIsMobileMenuOpen(false);
        navigate('/', { replace: true });
        window.location.href = '/';
      };

      const handleProfile = () => {
        if (isMobile) setIsMobileMenuOpen(false);
        setProfileDropdownOpen(false);
        if (user?.role === 'patient') {
          navigate('/patient-profile-setup');
        } else {
          navigate('/profile-setup');
        }
      };

      const handleDashboard = () => {
        if (isMobile) setIsMobileMenuOpen(false);
        setProfileDropdownOpen(false);
        if (admin) {
          navigate('/super-admin-dashboard');
        } else if (user?.role === 'doctor') {
          navigate('/doctor-dashboard');
        } else {
          navigate('/patient-dashboard');
        }
      };

      return (
        <div className={`flex ${isMobile ? 'flex-col' : 'flex-row'} gap-2 relative`}>
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="w-10 h-10 bg-[#0097b2] hover:bg-[#007c93] text-white rounded-full transition-colors flex items-center justify-center"
              aria-label="Profile"
            >
              <User size={20} />
            </button>
            
            {profileDropdownOpen && !isMobile && (
              <div className="absolute top-full right-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-neutral-100 py-2 z-50">
                <button
                  onClick={handleProfile}
                  className="block w-full text-left px-4 py-2 text-xs text-neutral-600 hover:text-[#0097b2] hover:bg-neutral-50 font-medium transition-colors"
                >
                  My Profile
                </button>
                <button
                  onClick={handleDashboard}
                  className="block w-full text-left px-4 py-2 text-xs text-neutral-600 hover:text-[#0097b2] hover:bg-neutral-50 font-medium transition-colors"
                >
                  My Dashboard
                </button>
              </div>
            )}
            
            {profileDropdownOpen && isMobile && (
              <div className="pl-4 space-y-1 mt-1 bg-white rounded-xl border border-neutral-100 py-2">
                <button
                  onClick={handleProfile}
                  className="block text-neutral-500 text-xs py-1.5 hover:text-[#0097b2] font-medium"
                >
                  My Profile
                </button>
                <button
                  onClick={handleDashboard}
                  className="block text-neutral-500 text-xs py-1.5 hover:text-[#0097b2] font-medium"
                >
                  My Dashboard
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white hover:bg-neutral-50 text-neutral-600 text-xs font-semibold rounded-xl border border-neutral-200 transition-colors"
          >
            Logout
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => { navigate('/login'); if (isMobile) setIsMobileMenuOpen(false); }}
        className="px-4 py-2 bg-[#0097b2] hover:bg-[#007c93] text-white text-xs font-semibold rounded-xl transition-colors"
      >
        Sign In
      </button>
    );
  };

  return (
    <nav className="w-full bg-[#fcfbfa] border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* Logo */}
          <div className="flex-shrink-0 cursor-pointer flex items-center" onClick={() => navigate('/')}>
            <img src="/logo/2.svg" alt="Veraawell Logo" className="h-8 md:h-10 w-auto" />
            <span className="ml-2 text-lg font-bold text-neutral-900 font-serif" style={{ fontFamily: 'Bree Serif, serif' }}></span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6 lg:space-x-8">
            {navigationLinks.map((link) => (
              <div
                key={link.name}
                className="relative"
                onMouseEnter={() => link.dropdown && handleDropdownEnter()}
                onMouseLeave={() => link.dropdown && handleDropdownLeave()}
              >
                {link.dropdown ? (
                  <>
                    <button className="text-neutral-600 hover:text-[#0097b2] text-xs font-semibold transition-colors flex items-center gap-1">
                      {link.name}
                      <ChevronDown size={12} className={`transition-transform ${resourcesDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {resourcesDropdownOpen && (
                      <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-xl shadow-lg border border-neutral-100 py-2 z-50">
                        {link.dropdown.map((item) => (
                          <a
                            key={item.name}
                            href={item.path}
                            className="block px-4 py-2 text-xs text-neutral-600 hover:text-[#0097b2] hover:bg-neutral-50 font-medium transition-colors"
                          >
                            {item.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a href={link.path} className="text-neutral-600 hover:text-[#0097b2] text-xs font-semibold transition-colors">
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
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-neutral-600 p-1.5 focus:outline-none">
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-neutral-100">
          <div className="px-4 pt-3 pb-4 space-y-2">
            {navigationLinks.map((link) => (
              <div key={link.name}>
                {link.dropdown ? (
                  <div>
                    <button
                      onClick={() => setResourcesDropdownOpen(!resourcesDropdownOpen)}
                      className="w-full text-left text-neutral-600 text-xs font-semibold py-2 flex items-center justify-between"
                    >
                      {link.name}
                      <ChevronDown size={12} className={`transition-transform ${resourcesDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {resourcesDropdownOpen && (
                      <div className="pl-4 space-y-1 mt-1">
                        {link.dropdown.map((item) => (
                          <a
                            key={item.name}
                            href={item.path}
                            className="block text-neutral-500 text-xs py-1.5 hover:text-[#0097b2] font-medium"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {item.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <a href={link.path} className="block text-neutral-600 text-xs font-semibold py-2 hover:text-[#0097b2]" onClick={() => setIsMobileMenuOpen(false)}>
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