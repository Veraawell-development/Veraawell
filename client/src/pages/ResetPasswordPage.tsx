import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_BASE_URL } from '../config/api';
import LeafDecor from '../components/ui/LeafDecor';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const token = searchParams.get('token');
  const [isGoogleUser, setIsGoogleUser] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      if (res.ok) {
        setMessage('Password reset successful! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        let errorMsg = 'Password reset failed';
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorMsg;
          if (errorMsg.toLowerCase().includes('google')) {
            setIsGoogleUser(true);
          }
        } catch {}
        setError(errorMsg);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

    if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-2)] relative overflow-hidden px-4">
        {/* Background Decor */}
        <LeafDecor 
            style={{ 
                position: 'absolute', 
                top: '-10%', 
                right: '-5%', 
                width: '600px', 
                height: '600px', 
                opacity: 0.3, 
                transform: 'rotate(15deg) scaleX(-1)', 
                zIndex: 0 
            }} 
        />
        <div 
            className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] pointer-events-none z-0" 
            style={{ background: 'radial-gradient(circle, rgba(0, 151, 178, 0.15), transparent 60%)' }} 
        />
        <div className="w-full max-w-md relative z-10">
          <div className="rounded-[32px] p-8 sm:p-10 shadow-2xl relative overflow-hidden text-center"
            style={{ 
              background: 'rgba(255, 255, 255, 0.75)', 
              border: '1px solid rgba(255, 255, 255, 1)', 
              backdropFilter: 'blur(20px)',
              boxShadow: '0 24px 60px rgba(0,151,178,0.08)'
            }}
          >
            <h2 className="text-3xl font-normal mb-3 tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
              Invalid Link
            </h2>
            <p className="text-[15px] mb-8 leading-relaxed" style={{ color: 'var(--text-2)' }}>
              {error || 'This password reset link is invalid or has expired.'}
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-4 rounded-full font-bold transition-all text-[15px] hover:-translate-y-0.5"
              style={{ background: 'var(--teal)', color: 'white', boxShadow: '0 8px 20px rgba(0,151,178,0.25)' }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-2)] relative overflow-hidden px-4">
      {/* Background Decor */}
      <LeafDecor 
          style={{ 
              position: 'absolute', 
              top: '-10%', 
              right: '-5%', 
              width: '600px', 
              height: '600px', 
              opacity: 0.3, 
              transform: 'rotate(15deg) scaleX(-1)', 
              zIndex: 0 
          }} 
      />
      <div 
          className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] pointer-events-none z-0" 
          style={{ background: 'radial-gradient(circle, rgba(0, 151, 178, 0.15), transparent 60%)' }} 
      />

      <div className="w-full max-w-md relative z-10">
        <button 
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-sm font-medium mb-6 transition-colors opacity-70 hover:opacity-100"
          style={{ color: 'var(--teal-dark)' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Login
        </button>

        <div className="rounded-[32px] p-8 sm:p-10 shadow-2xl relative overflow-hidden"
          style={{ 
            background: 'rgba(255, 255, 255, 0.75)', 
            border: '1px solid rgba(255, 255, 255, 1)', 
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 60px rgba(0,151,178,0.08)'
          }}
        >
          <h2 className="text-3xl font-normal mb-3 tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
            Reset Password
          </h2>
          
          <p className="text-[15px] mb-8 leading-relaxed" style={{ color: 'var(--text-2)' }}>
            Create a new password for your account. Make sure it's at least 6 characters long.
          </p>

          {message && (
            <div className="text-center text-sm mb-6 p-4 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              {message}
            </div>
          )}
          
          {error && (
            <div className="text-center text-sm mb-6 p-4 rounded-2xl" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#DC2626', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {error}
            </div>
          )}
          
          {isGoogleUser ? (
            <div className="text-center text-sm mb-6 p-4 rounded-2xl" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#CA8A04', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
              You signed up with Google. Please use Google Sign-In to log in. Password reset is not available for Google accounts.
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="New Password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-5 py-4 bg-white/70 border border-white focus:bg-white text-[15px] rounded-2xl focus:outline-none transition-all duration-300"
                  style={{ color: 'var(--text)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                  disabled={loading}
                  autoFocus
                />
                <button 
                  type="button" 
                  tabIndex={-1} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity" 
                  style={{ color: 'var(--text-3)' }}
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-5 py-4 bg-white/70 border border-white focus:bg-white text-[15px] rounded-2xl focus:outline-none transition-all duration-300"
                  style={{ color: 'var(--text)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                  disabled={loading}
                />
                <button 
                  type="button" 
                  tabIndex={-1} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity" 
                  style={{ color: 'var(--text-3)' }}
                  onClick={() => setShowConfirmPassword(v => !v)}
                >
                  {showConfirmPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <button 
                type="submit" 
                className="w-full py-4 rounded-full font-bold transition-all disabled:opacity-50 text-[15px] flex items-center justify-center hover:-translate-y-0.5" 
                style={{ background: 'var(--teal)', color: 'white', boxShadow: '0 8px 20px rgba(0,151,178,0.25)' }}
                disabled={loading}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
} 