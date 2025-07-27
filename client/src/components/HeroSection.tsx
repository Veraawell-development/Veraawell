import { FaUserPlus, FaSignInAlt } from 'react-icons/fa';

export default function HeroSection({ onLogin, onSignup, username, onLogout }: {
  onLogin: () => void;
  onSignup: () => void;
  username?: string;
  onLogout?: () => void;
}) {
  if (username) {
    return (
      <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 bg-black">
        <div className="bg-gray-900 rounded-3xl shadow-xl p-8 border border-gray-800 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-green-400 mb-4">Successfully logged in</h2>
          <p className="text-base mb-6 text-gray-200">Hello <span className="font-semibold text-white">{username}</span>!</p>
          <button
            className="bg-green-500 text-black py-2 px-6 rounded-3xl hover:bg-green-400 transition text-sm font-semibold"
            onClick={onLogout}
          >Logout</button>
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 bg-black">
      <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 text-center mt-44">Welcome to Veraawell</h1>
      <p className="text-gray-300 text-base md:text-lg mb-8 text-center max-w-xl">
        Your modern, minimal, and secure platform for authentication. Sign up or log in to get started.
      </p>
      <div className="flex gap-4">
        <button
          className="flex items-center gap-2 bg-green-500 text-black px-4 py-2 rounded-3xl text-sm font-semibold hover:bg-green-400 transition"
          onClick={onSignup}
        >
          <FaUserPlus className="text-base" /> Signup
        </button>
        <button
          className="flex items-center gap-2 border border-green-500 text-green-400 px-4 py-2 rounded-3xl text-sm font-semibold hover:bg-gray-800 transition"
          onClick={onLogin}
        >
          <FaSignInAlt className="text-base" /> Login
        </button>
      </div>
    </section>
  );
} 