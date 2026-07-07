import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import LeafDecor from '../components/ui/LeafDecor';
import { ArrowLeft, Mail } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const forgotMutation = useMutation({
    mutationFn: async (emailStr: string) => {
      const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailStr }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to send reset email');
      }
      return data;
    },
    onSuccess: (data) => {
      setMessage(data.resetUrl ? `${data.message} (For testing: ${data.resetUrl})` : data.message);
    },
    onError: (err: any) => {
      let errorMsg = err.message || 'Failed to send reset email';
      if (errorMsg.toLowerCase().includes('google login')) {
        setError('This account uses Google login. Please use Google Sign-In.');
      } else {
        setError(errorMsg);
      }
    }
  });

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError('');
    setMessage('');
    forgotMutation.mutate(email.trim());
  };

  const loading = forgotMutation.isPending;

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
          <ArrowLeft size={16} /> Back to Login
        </button>

        <div className="rounded-[32px] p-8 sm:p-10 shadow-2xl relative overflow-hidden"
          style={{ 
            background: 'rgba(255, 255, 255, 0.75)', 
            border: '1px solid rgba(255, 255, 255, 1)', 
            backdropFilter: 'blur(20px)',
            boxShadow: '0 24px 60px rgba(0,151,178,0.08)'
          }}
        >
          <div className="w-14 h-14 rounded-full bg-teal-50 flex items-center justify-center mb-6" style={{ color: 'var(--teal)' }}>
            <Mail size={24} />
          </div>

          <h2 className="text-3xl font-normal mb-3 tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
            Forgot Password?
          </h2>
          
          <p className="text-[15px] mb-8 leading-relaxed" style={{ color: 'var(--text-2)' }}>
            No worries, we'll send you reset instructions. Enter the email address associated with your account.
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
          {error && error.toLowerCase().includes('no account found') && (
            <button
              type="button"
              className="w-full py-3.5 rounded-full font-bold transition-all mb-4"
              style={{ background: 'var(--teal)', color: 'white', boxShadow: '0 8px 20px rgba(0,151,178,0.2)' }}
              onClick={() => navigate('/signup')}
            >
              Create Account
            </button>
          )}

          <form onSubmit={handleForgotPassword} className="space-y-5">
            <div>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-white/70 border border-white focus:bg-white text-[15px] rounded-2xl focus:outline-none transition-all duration-300"
                style={{ color: 'var(--text)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                disabled={loading}
                autoFocus
              />
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
                'Send Reset Link'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
} 