import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

interface AuthPageProps {
  mode?: 'login' | 'signup';
  onSuccess?: (username: string, role: string) => void;
}

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5001/api' 
  : 'https://veraawell-backend.onrender.com/api';

export default function AuthPage({ mode, onSuccess }: AuthPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registerMode, setRegisterMode] = useState(mode === 'signup');
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
  const [selectedRole, setSelectedRole] = useState<'patient' | 'doctor'>('patient');
  const [isAdminMode, setIsAdminMode] = useState(false);
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
        body: JSON.stringify({ 
          username, 
          password,
          role: isAdminMode ? 'admin' : selectedRole 
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setError('');
        if (onSuccess) onSuccess(username, data.user.role);
        navigate('/', { state: { success: true, username, role: data.user.role } });
      } else {
        // Check if it's a role mismatch error
        if (data.correctRole) {
          setError(data.message);
          // Auto-switch to correct role
          setSelectedRole(data.correctRole as 'patient' | 'doctor');
          // Auto-fill password
          setPassword(password);
          // Show helper message
          setTimeout(() => {
            setError('Role updated. Please try logging in again.');
          }, 2000);
        } else {
          setError(data.message || 'Login failed');
        }
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
      onSuccess(savedUsername, localStorage.getItem('role') || 'patient');
      navigate('/', { state: { success: true, username: savedUsername, role: localStorage.getItem('role') || 'patient' } });
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
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          username: email,
          password: registerPassword,
          role: selectedRole
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
                  if (onSuccess) onSuccess(email, data.role || selectedRole);
                  navigate('/', { state: { success: true, username: email, role: data.role || selectedRole } });
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

  const handleGoogleAuth = () => {
    console.log('Redirecting to Google OAuth:', `${API_BASE_URL}/auth/google`);
    window.location.href = `${API_BASE_URL}/auth/google?role=${selectedRole}`;
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-black p-2 sm:p-4">
      <div className="w-full max-w-md sm:max-w-md bg-gray-900 rounded-3xl shadow-xl p-4 sm:p-8 border border-gray-800">
        {!isAdminMode && (
          <div className="mb-6">
            <div className="flex rounded-3xl overflow-hidden border border-gray-700 mb-4">
              <button
                className={`flex-1 py-2 text-sm font-medium transition ${selectedRole === 'patient' ? 'bg-green-500 text-black' : 'bg-transparent text-gray-400 hover:bg-gray-800'}`}
                onClick={() => setSelectedRole('patient')}
                disabled={loading}
              >
                Patient
              </button>
              <button
                className={`flex-1 py-2 text-sm font-medium transition ${selectedRole === 'doctor' ? 'bg-green-500 text-black' : 'bg-transparent text-gray-400 hover:bg-gray-800'}`}
                onClick={() => setSelectedRole('doctor')}
                disabled={loading}
              >
                Doctor
              </button>
            </div>
          </div>
        )}
        
        <h2 className="text-lg sm:text-xl font-bold text-center mb-6 text-white tracking-tight">
          {isAdminMode 
            ? 'Admin Portal' 
            : (registerMode ? `Create your ${selectedRole} account` : `Sign in as ${selectedRole}`)}
        </h2>

        {registerMode && !isAdminMode ? (
          <>
            <div className="flex flex-col items-center mb-4">
              <button 
                type="button" 
                className="w-full flex items-center justify-center gap-2 border border-green-500 text-black bg-white py-2 rounded-3xl font-semibold hover:bg-gray-100 transition mb-4 text-base" 
                onClick={handleGoogleAuth}
              >
                <FcGoogle className="text-xl" />
                Sign up with Google as {selectedRole}
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
            {!isAdminMode && (
              <div className="flex flex-col items-center mb-4">
                <button 
                  type="button" 
                  className="w-full flex items-center justify-center gap-2 border border-green-500 text-black bg-white py-2 rounded-3xl font-semibold hover:bg-gray-100 transition mb-4 text-base" 
                  onClick={handleGoogleAuth}
                >
                  <FcGoogle className="text-xl" />
                  Sign in with Google as {selectedRole}
                </button>
                <span className="text-gray-400 text-sm mb-2">or</span>
              </div>
            )}
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="text"
                placeholder={isAdminMode ? "Admin Username" : "Email"}
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
                <button 
                  type="button" 
                  tabIndex={-1} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" 
                  onClick={() => setShowPassword(v => !v)}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              {!isAdminMode && (
                <div className="flex justify-end">
                  <button 
                    type="button" 
                    className="text-green-400 text-xs hover:underline focus:outline-none" 
                    onClick={() => navigate('/forgot-password')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <button 
                type="submit" 
                className={`w-full py-2 rounded-3xl hover:opacity-90 transition disabled:opacity-50 text-base font-semibold ${
                  isAdminMode 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-green-500 hover:bg-green-400 text-black'
                }`} 
                disabled={loading}
              >
                {isAdminMode ? 'Admin Login' : 'Login'}
              </button>
            </form>
            {!isAdminMode && (
              <button 
                type="button" 
                className="w-full border border-green-500 text-green-400 py-2 rounded-3xl hover:bg-gray-800 transition disabled:opacity-50 mt-4 text-base font-semibold" 
                onClick={() => { setRegisterMode(true); setRegisterMsg(''); }} 
                disabled={loading}
              >
                Create New Account
              </button>
            )}
            {error && <div className="text-center text-red-400 mt-4">{error}</div>}
          </>
        )}

        {/* Admin portal link */}
        <div className="mt-6 text-center">
          <button
            type="button"
            className={`text-xs text-gray-500 hover:text-gray-400 transition ${isAdminMode ? 'text-red-400 hover:text-red-300' : ''}`}
            onClick={() => {
              setIsAdminMode(!isAdminMode);
              setError('');
              setRegisterMsg('');
              setUsername('');
              setPassword('');
              setRegisterMode(false);
            }}
          >
            {isAdminMode ? '← Back to User Login' : 'Admin Portal'}
          </button>
        </div>
      </div>
    </div>
  );
} 