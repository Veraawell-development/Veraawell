import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdmin } from '../context/AdminContext';
import { Menu, X, ChevronDown, User } from 'lucide-react';

export default function Navbar() {
  const { isLoggedIn, user, logout } = useAuth();
  const { admin } = useAdmin();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownTimer, setDropdownTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  /* ── Scroll detection ── */
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /* ── Scroll progress bar ── */
  useEffect(() => {
    const bar = document.getElementById('scroll-progress-bar');
    if (!bar) return;
    const handleScroll = () => {
      const scrolled = window.scrollY;
      const total = document.body.scrollHeight - window.innerHeight;
      bar.style.width = total > 0 ? `${(scrolled / total) * 100}%` : '0%';
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About Us', path: '/about' },
    { name: 'Services', path: '/services' },
    {
      name: 'Resources',
      path: '/resources',
      dropdown: [
        { name: 'Articles', path: '/resources/articles' },
        { name: 'Videos', path: '/resources/videos' },
      ],
    },
    { name: 'FAQ', path: '/faq' },
    { name: 'Careers', path: '/careers' },
  ];

  const handleDropdownEnter = () => {
    if (dropdownTimer) clearTimeout(dropdownTimer);
    setResourcesOpen(true);
  };
  const handleDropdownLeave = () => {
    const t = setTimeout(() => setResourcesOpen(false), 250);
    setDropdownTimer(t);
  };

  /* ── Auth Buttons ── */
  const AuthButtons: React.FC<{ mobile?: boolean }> = ({ mobile }) => {
    const [profileOpen, setProfileOpen] = useState(false);

    if (isLoggedIn) {
      const handleLogout = async () => {
        await logout();
        if (mobile) setIsMobileMenuOpen(false);
        navigate('/');
        window.location.href = '/';
      };
      const handleProfile = () => {
        setProfileOpen(false);
        if (mobile) setIsMobileMenuOpen(false);
        navigate(user?.role === 'patient' ? '/patient-profile-setup' : '/profile-setup');
      };
      const handleDashboard = () => {
        setProfileOpen(false);
        if (mobile) setIsMobileMenuOpen(false);
        if (admin) navigate('/super-admin-dashboard');
        else if (user?.role === 'doctor') navigate('/doctor-dashboard');
        else navigate('/patient-dashboard');
      };

      return (
        <div className={`flex ${mobile ? 'flex-col' : 'flex-row'} gap-2 relative`}>
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-all duration-200"
              style={{ background: 'var(--teal)' }}
              aria-label="Profile"
            >
              <User size={16} />
            </button>

            {profileOpen && !mobile && (
              <div
                className="absolute top-full right-0 mt-2 w-44 rounded-2xl py-2 z-50"
                style={{
                  background: 'rgba(250,250,248,0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                {[
                  { label: 'My Profile', action: handleProfile },
                  { label: 'My Dashboard', action: handleDashboard },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="block w-full text-left px-4 py-2.5 text-sm font-medium transition-colors duration-150"
                    style={{ color: 'var(--text-2)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--teal)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200"
            style={{
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              background: 'transparent',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)';
            }}
          >
            Logout
          </button>
        </div>
      );
    }

    return (
      <div className={`flex ${mobile ? 'flex-col' : 'flex-row'} gap-2`}>
        <button
          onClick={() => { navigate('/login'); if (mobile) setIsMobileMenuOpen(false); }}
          className="px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200"
          style={{
            color: 'var(--text)',
            border: '1px solid var(--border)',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--teal-glow)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--teal)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
          }}
        >
          Sign In
        </button>
        <button
          onClick={() => { navigate('/signup'); if (mobile) setIsMobileMenuOpen(false); }}
          className="btn-shimmer px-5 py-2 text-sm font-semibold rounded-full text-white transition-all duration-200"
          style={{
            background: 'var(--teal)',
            boxShadow: scrolled ? '0 4px 14px rgba(0,151,178,0.2)' : 'none',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal-dark)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--teal)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          Get Started
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Scroll progress bar */}
      <div className="scroll-progress" id="scroll-progress-bar" style={{ width: '0%' }} />

      <nav
        className={scrolled ? 'navbar-scrolled' : ''}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          background: scrolled ? undefined : 'transparent',
          borderBottom: scrolled ? undefined : 'none',
          transition: 'background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">

            {/* Logo */}
            <div
              className="flex-shrink-0 cursor-pointer flex items-center gap-2"
              onClick={() => navigate('/')}
            >
              <img src="/logo/2.svg" alt="Veraawell" className="h-8 md:h-10 w-auto" />
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              {navLinks.map((link) => (
                <div
                  key={link.name}
                  className="relative"
                  onMouseEnter={() => link.dropdown && handleDropdownEnter()}
                  onMouseLeave={() => link.dropdown && handleDropdownLeave()}
                >
                  {link.dropdown ? (
                    <>
                      <button
                        className="flex items-center gap-1 text-sm font-medium transition-colors duration-200"
                        style={{ color: 'var(--text-2)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-2)')}
                      >
                        {link.name}
                        <ChevronDown
                          size={12}
                          style={{
                            transform: resourcesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s ease',
                          }}
                        />
                      </button>

                      {resourcesOpen && (
                        <div
                          className="absolute top-full left-0 mt-2 w-40 rounded-2xl py-2 z-50"
                          style={{
                            background: 'rgba(250,250,248,0.96)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid var(--border)',
                            boxShadow: 'var(--shadow-lg)',
                            animation: 'fade-up 0.15s var(--ease-spring)',
                          }}
                        >
                          {link.dropdown.map((item) => (
                            <a
                              key={item.name}
                              href={item.path}
                              className="block px-4 py-2.5 text-sm font-medium transition-colors duration-150"
                              style={{ color: 'var(--text-2)', textDecoration: 'none' }}
                              onMouseEnter={e =>
                                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--teal)')
                              }
                              onMouseLeave={e =>
                                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)')
                              }
                            >
                              {item.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <a
                      href={link.path}
                      className="text-sm font-medium transition-colors duration-200"
                      style={{ color: 'var(--text-2)', textDecoration: 'none' }}
                      onMouseEnter={e =>
                        ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text)')
                      }
                      onMouseLeave={e =>
                        ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-2)')
                      }
                    >
                      {link.name}
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Auth */}
            <div className="hidden md:block">
              <AuthButtons />
            </div>

            {/* Mobile Hamburger */}
            <button
              className="md:hidden p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text)' }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div
            className="md:hidden"
            style={{
              background: 'rgba(250,250,248,0.97)',
              backdropFilter: 'blur(20px)',
              borderTop: '1px solid var(--border)',
              animation: 'fade-up 0.2s var(--ease-spring)',
            }}
          >
            <div className="px-4 pt-4 pb-6 space-y-1">
              {navLinks.map((link) => (
                <div key={link.name}>
                  {link.dropdown ? (
                    <div>
                      <button
                        className="w-full text-left text-sm font-medium py-2.5 flex items-center justify-between"
                        style={{ color: 'var(--text)' }}
                        onClick={() => setResourcesOpen(!resourcesOpen)}
                      >
                        {link.name}
                        <ChevronDown
                          size={12}
                          style={{
                            transform: resourcesOpen ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s',
                          }}
                        />
                      </button>
                      {resourcesOpen && (
                        <div className="pl-4 mt-1 space-y-1">
                          {link.dropdown.map((item) => (
                            <a
                              key={item.name}
                              href={item.path}
                              className="block text-sm py-2"
                              style={{ color: 'var(--text-2)', textDecoration: 'none' }}
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              {item.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <a
                      href={link.path}
                      className="block text-sm font-medium py-2.5"
                      style={{ color: 'var(--text)', textDecoration: 'none' }}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.name}
                    </a>
                  )}
                </div>
              ))}

              <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <AuthButtons mobile />
              </div>
            </div>
          </div>
        )}
      </nav>
    </>
  );
}