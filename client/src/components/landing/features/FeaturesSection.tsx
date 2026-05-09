import React from 'react';

const FeaturesSection: React.FC = () => {
  const features = [
    {
      text: "PROGRESS-TRACKING DASHBOARD",
      backgroundColor: "#ABA5D1",
    },
    {
      text: "NETWORK OF HIGH-QUALITY PSYCHOLOGISTS",
      backgroundColor: "#A6D6EA",
    },
    {
      text: "SESSION-WISE REPORT",
      backgroundColor: "#38ABAE",
    },
    {
      text: "ON DEMAND THERAPY SESSIONS",
      backgroundColor: "#F4CCA9",
    },
    {
      text: "FLEXIBLE PRICING MODEL",
      backgroundColor: "#9BD3BA",
    }
  ];

  return (
    <section className="bg-[#E0EAEA] py-20 px-4 relative overflow-hidden">
      <div className="max-w-7xl mx-auto relative">
        
        {/* Main Container with explicit widths */}
        <div className="space-y-4 sm:space-y-5 md:space-y-6 max-w-5xl mx-auto">
          
          {/* Top Row - 2 Cards */}
          <div className="flex gap-3 sm:gap-4 md:gap-6">
            {/* Card 1: PROGRESS-TRACKING DASHBOARD */}
            <div className="w-[50%]">
              <div 
                className="h-36 sm:h-40 md:h-44 lg:h-48 xl:h-52 rounded-lg md:rounded-xl shadow-lg flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 relative hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                style={{ backgroundColor: features[0].backgroundColor }}
              >
                <h3 className="font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase text-white font-sans"
                     style={{ 
                       textShadow: '0 1px 3px rgba(0,0,0,0.15)'
                     }}>
                  PROGRESS-<br />TRACKING<br />DASHBOARD
                </h3>
              </div>
            </div>

            {/* Card 2: NETWORK OF HIGH-QUALITY PSYCHOLOGISTS */}
            <div className="w-[65%]">
              <div 
                className="h-36 sm:h-40 md:h-44 lg:h-48 xl:h-52 rounded-lg md:rounded-xl shadow-lg flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 relative hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                style={{ backgroundColor: features[1].backgroundColor }}
              >
                <h3 className="font-bold text-base sm:text-lg md:text-2xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase text-white font-sans"
                     style={{ 
                       textShadow: '0 1px 3px rgba(0,0,0,0.15)'
                     }}>
                  NETWORK OF<br />HIGH-QUALITY<br />PSYCHOLOGISTS
                </h3>
              </div>
            </div>
          </div>

          {/* Bottom Row - 3 Cards */}
          <div className="flex gap-3 sm:gap-4 md:gap-6">
            {/* Card 3: SESSION-WISE REPORT */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-lg flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                style={{ backgroundColor: features[2].backgroundColor }}
              >
                <h3 className="font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase text-white font-sans"
                     style={{ 
                       textShadow: '0 1px 3px rgba(0,0,0,0.15)'
                     }}>
                  SESSION-<br />WISE<br />REPORT
                </h3>
              </div>
            </div>

            {/* Card 4: ON DEMAND THERAPY SESSIONS */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-lg flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                style={{ backgroundColor: features[3].backgroundColor }}
              >
                <h3 className="font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase text-white font-sans"
                     style={{ 
                       textShadow: '0 1px 3px rgba(0,0,0,0.15)'
                     }}>
                  ON DEMAND<br />THERAPY<br />SESSIONS
                </h3>
              </div>
            </div>

            {/* Card 5: FLEXIBLE PRICING MODEL */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-lg flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 hover:scale-[1.02] transition-all duration-300 cursor-pointer"
                style={{ backgroundColor: features[4].backgroundColor }}
              >
                <h3 className="font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase text-white font-sans"
                     style={{ 
                       textShadow: '0 1px 3px rgba(0,0,0,0.15)'
                     }}>
                  FLEXIBLE<br />PRICING MODEL
                </h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
