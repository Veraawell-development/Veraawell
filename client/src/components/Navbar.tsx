import { useNavigate } from 'react-router-dom';

export default function Navbar({ isBackendConnected, isLoggedIn, onLogout }: { isBackendConnected: boolean, isLoggedIn: boolean, onLogout?: () => void }) {
  const navigate = useNavigate();
  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 bg-black text-white shadow-sm">
      <div className="flex items-center gap-2 font-bold text-xl cursor-pointer" onClick={() => navigate('/') }>
        VeroCare
      </div>
      <div className="flex gap-2">
        {isLoggedIn ? (
          <button
            className="flex items-center gap-1 bg-green-500 text-black px-4 py-2 rounded-3xl text-sm font-semibold hover:bg-green-400 transition border border-green-500"
            onClick={onLogout}
          >
            Logout
          </button>
        ) : (
          isBackendConnected && (
            <>
              <button
                className="flex items-center gap-1 bg-white text-black px-4 py-2 rounded-3xl text-sm hover:bg-gray-200 transition border border-black"
                onClick={() => navigate('/login')}
              >
                Login
              </button>
              <button
                className="flex items-center gap-1 border border-white text-white px-4 py-2 rounded-3xl text-sm hover:bg-gray-900 transition"
                onClick={() => navigate('/signup')}
              >
                Signup
              </button>
            </>
          )
        )}
      </div>
    </nav>
  );
} 