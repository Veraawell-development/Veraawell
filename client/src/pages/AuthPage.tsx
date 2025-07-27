import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

interface AuthPageProps {
  mode?: 'login' | 'signup';
  onSuccess?: (username: string) => void;
}

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell.onrender.com/api';

export default function AuthPage({ mode, onSuccess }: AuthPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registerMode, setRegisterMode] = useState(mode === 'signup');
  // const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerMsg, setRegisterMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (mode === 'signup') setRegisterMode(true);
    if (mode === 'login') setRegisterMode(false);
  }, [mode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setError('');
        if (onSuccess) onSuccess(username);
        navigate('/', { state: { success: true, username } });
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Network error');
    }
    setLoading(false);
  };

  // Auto-login if cookie exists (handled in App.tsx now)
  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUsername = localStorage.getItem('username');
    if (token && savedUsername && onSuccess) {
      onSuccess(savedUsername);
      navigate('/', { state: { success: true, username: savedUsername } });
    }
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterMsg('');
    setError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !registerPassword.trim() || !registerConfirm.trim()) {
      setRegisterMsg('All required fields must be filled');
      return;
    }
    if (registerPassword !== registerConfirm) {
      setRegisterMsg('Passwords do not match');
      return;
    }
    if (!agree) {
      setRegisterMsg('You must agree to the Terms of Service and Privacy Policy');
      return;
    }
    setLoading(true);
    try {
      // Remove company from request
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          username: email, // for now, use email as username
          password: registerPassword
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisterMsg('Registration successful! Logging you in...');
        setUsername(email);
        setPassword(registerPassword);
        setFirstName('');
        setLastName('');
        setEmail('');
        // setRegisterUsername('');
        setRegisterPassword('');
        setRegisterConfirm('');
        setAgree(false);
        setTimeout(() => {
          setRegisterMode(false);
          setRegisterMsg('');
          setLoading(false);
          // Auto-login
          setTimeout(() => {
            setLoading(true);
            fetch(`${API_BASE_URL}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ username: email, password: registerPassword }),
            })
              .then(res => res.json().then(data => ({ ok: res.ok, data })))
              .then(({ ok, data }) => {
                if (ok) {
                  setError('');
                  if (onSuccess) onSuccess(email);
                  navigate('/', { state: { success: true, username: email } });
                } else {
                  setError(data.message || 'Login failed');
                }
                setLoading(false);
              })
              .catch(() => {
                setError('Network error');
                setLoading(false);
              });
          }, 500);
        }, 1000);
      } else {
        setRegisterMsg(data.message || 'Registration failed');
        setLoading(false);
      }
    } catch (err) {
      setRegisterMsg('Network error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-black p-2 sm:p-4">
      <div className="w-full max-w-md sm:max-w-md bg-gray-900 rounded-3xl shadow-xl p-4 sm:p-8 border border-gray-800">
        <h2 className="text-lg sm:text-xl font-bold text-center mb-6 text-white tracking-tight">
          {registerMode ? 'Create your account' : 'Sign in to Veraawell'}
        </h2>
        {registerMode ? (
          <>
            <div className="flex flex-col items-center mb-4">
              <button type="button" className="w-full flex items-center justify-center gap-2 border border-green-500 text-black bg-white py-2 rounded-3xl font-semibold hover:bg-gray-100 transition mb-4 text-base">
                <FcGoogle className="text-xl" /> Sign up with Google
              </button>
              <span className="text-gray-400 text-sm mb-2">or</span>
            </div>
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="First Name*"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  className="w-full sm:w-1/2 px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={loading}
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Last Name*"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  className="w-full sm:w-1/2 px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={loading}
                />
              </div>
              <input
                type="email"
                placeholder="Email*"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                disabled={loading}
              />
              <div className="relative">
                <input
                  type={showRegisterPassword ? 'text' : 'password'}
                  placeholder="Password*"
                  value={registerPassword}
                  onChange={e => setRegisterPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={loading}
                />
                <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowRegisterPassword(v => !v)}>
                  {showRegisterPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <div className="relative">
                <input
                  type={showRegisterConfirm ? 'text' : 'password'}
                  placeholder="Confirm Password*"
                  value={registerConfirm}
                  onChange={e => setRegisterConfirm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={loading}
                />
                <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowRegisterConfirm(v => !v)}>
                  {showRegisterConfirm ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={e => setAgree(e.target.checked)}
                  className="accent-green-500 w-4 h-4"
                  disabled={loading}
                  id="terms"
                />
                <label htmlFor="terms" className="text-gray-300 text-xs select-none">
                  I agree to the <a href="#" className="underline">Terms of Service</a> and <a href="#" className="underline">Privacy Policy</a>.
                </label>
              </div>
              <button type="submit" className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition disabled:opacity-50 text-base font-semibold mt-2" disabled={loading}>Create your account</button>
            </form>
            <button type="button" className="w-full text-green-400 py-2 rounded-3xl hover:bg-gray-800 transition disabled:opacity-50 mt-4 text-sm font-semibold" onClick={() => { setRegisterMode(false); setRegisterMsg(''); }} disabled={loading}>Sign in</button>
            {registerMsg && <div className={`text-center mt-2 ${registerMsg.startsWith('Registration successful') ? 'text-green-400' : 'text-red-400'}`}>{registerMsg}</div>}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center mb-4">
              <button type="button" className="w-full flex items-center justify-center gap-2 border border-green-500 text-black bg-white py-2 rounded-3xl font-semibold hover:bg-gray-100 transition mb-4 text-base">
                <FcGoogle className="text-xl" /> Sign in with Google
              </button>
              <span className="text-gray-400 text-sm mb-2">or</span>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                disabled={loading}
                autoFocus
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-700 bg-gray-800 text-white rounded-3xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  disabled={loading}
                />
                <button type="button" tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPassword(v => !v)}>
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <div className="flex justify-end">
                <button type="button" className="text-green-400 text-xs hover:underline focus:outline-none" onClick={() => alert('Forgot password feature coming soon!')}>
                  Forgot password?
                </button>
              </div>
              <button type="submit" className="w-full bg-green-500 text-black py-2 rounded-3xl hover:bg-green-400 transition disabled:opacity-50 text-base font-semibold" disabled={loading}>Login</button>
            </form>
            <button type="button" className="w-full border border-green-500 text-green-400 py-2 rounded-3xl hover:bg-gray-800 transition disabled:opacity-50 mt-4 text-base font-semibold" onClick={() => { setRegisterMode(true); setRegisterMsg(''); }} disabled={loading}>Go to Register</button>
            {error && <div className="text-center text-red-400 mt-4">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
} 