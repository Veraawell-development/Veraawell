import React from 'react';

const FeaturesSection: React.FC = () => {
  const features = [
    {
      text: "PROGRESS-TRACKING DASHBOARD",
      backgroundColor: "#9F8FC2"
    },
    {
      text: "NETWORK OF HIGH-QUALITY PSYCHOLOGISTS",
      backgroundColor: "#8BC9E8"
    },
    {
      text: "SESSION-WISE REPORT",
      backgroundColor: "#3CA8A8"
    },
    {
      text: "ON DEMAND THERAPY SESSIONS",
      backgroundColor: "#F6CBA5"
    },
    {
      text: "FLEXIBLE PRICING MODEL",
      backgroundColor: "#9AD2BE"
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
                className="h-36 sm:h-40 md:h-44 lg:h-48 xl:h-52 rounded-lg md:rounded-xl shadow-xl flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 relative"
                style={{ backgroundColor: features[0].backgroundColor }}
              >
                <h3 className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase"
                     style={{ 
                       fontFamily: 'Bowlby One SC, serif',
                       WebkitTextStroke: '0.1px #6B5B8A',
                       WebkitTextFillColor: 'white',
                       color: 'white'
                     }}>
                  PROGRESS-<br />TRACKING<br />DASHBOARD
                </h3>
                {/* Star decoration - bottom left */}
                <div className="absolute -bottom-6 -left-4 sm:-bottom-8 sm:-left-6 md:-bottom-10 md:-left-8 lg:-bottom-12 lg:-left-10">
                  <img 
                    src="/star.svg" 
                    alt="Star decoration" 
                    className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 xl:w-20 xl:h-20 object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Card 2: NETWORK OF HIGH-QUALITY PSYCHOLOGISTS */}
            <div className="w-[65%]">
              <div 
                className="h-36 sm:h-40 md:h-44 lg:h-48 xl:h-52 rounded-lg md:rounded-xl shadow-xl flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7 relative"
                style={{ backgroundColor: features[1].backgroundColor }}
              >
                <h3 className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase"
                     style={{ 
                       fontFamily: 'Bowlby One SC, serif',
                       WebkitTextStroke: '0.5px #5A9BC4',
                       WebkitTextFillColor: 'white',
                       color: 'white'
                     }}>
                  NETWORK OF<br />HIGH-QUALITY<br />PSYCHOLOGISTS
                </h3>
                {/* Star decoration - top right */}
                <div className="absolute -top-4 -right-4 sm:-top-6 sm:-right-6 md:-top-8 md:-right-8">
                  <img 
                    src="/star.svg" 
                    alt="Star decoration" 
                    className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-16 lg:h-16 xl:w-20 xl:h-20 object-contain"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row - 3 Cards */}
          <div className="flex gap-3 sm:gap-4 md:gap-6">
            {/* Card 3: SESSION-WISE REPORT */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-xl flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7"
                style={{ backgroundColor: features[2].backgroundColor }}
              >
                <h3 className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase"
                     style={{ 
                       fontFamily: 'Bowlby One SC, serif',
                       WebkitTextStroke: '0.5px #2A7A7A',
                       WebkitTextFillColor: 'white',
                       color: 'white'
                     }}>
                  SESSION-<br />WISE<br />REPORT
                </h3>
              </div>
            </div>

            {/* Card 4: ON DEMAND THERAPY SESSIONS */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-xl flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7"
                style={{ backgroundColor: features[3].backgroundColor }}
              >
                <h3 className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase"
                     style={{ 
                       fontFamily: 'Bowlby One SC, serif',
                       WebkitTextStroke: '0.5px #D4A87A',
                       WebkitTextFillColor: 'white',
                       color: 'white'
                     }}>
                  ON DEMAND<br />THERAPY<br />SESSIONS
                </h3>
              </div>
            </div>

            {/* Card 5: FLEXIBLE PRICING MODEL */}
            <div className="w-[32%]">
              <div 
                className="h-40 sm:h-44 md:h-48 lg:h-52 xl:h-56 rounded-lg md:rounded-xl shadow-xl flex items-center justify-start p-4 sm:p-5 md:p-6 lg:p-7"
                style={{ backgroundColor: features[4].backgroundColor }}
              >
                <h3 className="text-white font-bold text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-left leading-[110%] tracking-[0%] uppercase"
                     style={{ 
                       fontFamily: 'Bowlby One SC, serif',
                       WebkitTextStroke: '0.5px #6BA08A',
                       WebkitTextFillColor: 'white',
                       color: 'white'
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
