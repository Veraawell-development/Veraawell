export default function HeroSection({ username, userRole, onLogout }: {
  username?: string;
  userRole?: string;
  onLogout?: () => void;
}) {
  if (username) {
    return (
      <section className="flex flex-col items-center justify-center min-h-[60vh] px-4 bg-white">
        <div className="bg-gray-100 rounded-3xl shadow-xl p-8 border border-gray-200 flex flex-col items-center">
          <h2 className="text-2xl font-bold text-green-600 mb-4">Successfully logged in</h2>
          <p className="text-base mb-2 text-gray-700">Hello <span className="font-semibold text-gray-900">{username}</span>!</p>
          <p className="text-sm mb-6 text-gray-500">You are logged in as a <span className="font-semibold text-green-600">{userRole}</span></p>
          <button
            className="bg-green-500 text-white py-2 px-6 rounded-3xl hover:bg-green-600 transition text-sm font-semibold"
            onClick={onLogout}
          >Logout</button>
        </div>
      </section>
    );
  }

  return (
    <section className="relative w-full overflow-hidden bg-white">
      {/* Background Image - sized to fit content exactly */}
      <img 
        src="/bg.png" 
        alt="Background" 
        className="w-full h-auto object-contain block"
      />
      
      {/* Overlay elements positioned absolutely over the image */}
      <div className="absolute inset-0">
        {/* Main Content Container */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
        </div>

        {/* Bottom Grey Strip - positioned relative to image */}
        <div className="absolute bottom-0 left-0 right-0 h-[2%] sm:h-[3%] md:h-[4%] bg-[#E0EAEA]"></div>
        
        {/* Illustration positioned responsively - touching bottom */}
        <div className="absolute bottom-[1%] right-[3%] sm:bottom-[3%] sm:right-[4%] md:bottom-[4%] md:right-[5%] lg:bottom-[4%] lg:right-[6%] z-20">
          <img 
            src="/hero-assest.svg" 
            alt="Therapy Session Illustration"
            className="w-[25vw] min-w-[100px] max-w-[150px] sm:w-[20vw] sm:max-w-[180px] md:w-[18vw] md:max-w-[220px] lg:w-[16vw] lg:max-w-[280px] xl:w-[14vw] xl:max-w-[320px] h-auto object-contain"
          />
        </div>
      </div>
    </section>
  );
} 