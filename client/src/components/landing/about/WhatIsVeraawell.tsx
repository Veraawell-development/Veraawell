export default function WhatIsVeraawell() {
  return (
    <section className="w-full bg-[#E0EAEA] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Main Container */}
        <div className="bg-transparent p-6 rounded-2xl">
          
          {/* Text Content */}
          <div className="space-y-4">
            {/* Title Box */}
            <div className="flex justify-center">
              <div className="bg-[#B55D35] opacity-[80%] rounded-3xl px-15 py-4">
                <h2 className="text-white text-xl font-semibold leading-7" style={{fontFamily: 'Bree Serif, serif'}}>
                  What is Veraawell?
                </h2>
              </div>
            </div>

            {/* Container with Illustration and Description */}
            <div className="relative">
              {/* Illustration positioned outside - Hidden on mobile/tablet, visible on laptop+ */}
              <div className="hidden lg:block absolute left-15 -top-30 z-10">
                <div className="w-auto h-32 bg-[#F3F2FF] rounded-full flex items-center justify-center p-1">
                  <img 
                    src="/assest02.svg" 
                    alt="Veraawell illustration" 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
              
              {/* Description Box */}
              <div className="bg-[#ECE3D2] rounded-3xl p-6 lg:ml-12 mt-10 shadow-lg shadow-black/20">
                <p className="text-[#B55D35] text-xl leading-6" style={{fontFamily: 'Bree Serif, serif'}}>
                  <span className="">Veraawell</span> is a platform aimed at revolutionizing the culture of mental health in India. We bridge the gap between people who seek professional help and psychologists. We give the user freedom to operate at their own pace and track their mental health journey as their own.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action Section */}
        <div className="text-center mt-12 sm:mt-14 md:mt-16 lg:mt-16">
          <h3 className="text-[#C17B5C] text-[20px] sm:text-[24px] md:text-[28px] lg:text-[28px] font-bold leading-[1.4] mb-8 sm:mb-10 md:mb-12 lg:mb-12 max-w-3xl sm:max-w-3xl md:max-w-4xl lg:max-w-4xl mx-auto font-serif px-4 sm:px-6 md:px-0 lg:px-0">
            Let's get you started with your mental health journey 
            with the first step of all, finding the perfect 
            therapist for you.
          </h3>
          
          <button className="bg-[#E6847A]  text-[#FFFDE9] text-[16px] sm:text-[18px] md:text-[20px] lg:text-[20px] font-bold px-10 sm:px-8 md:px-10 lg:px-20 py-2 sm:py-3 md:py-4 lg:py-3 rounded-3xl shadow-[0_4px_8px_rgba(0,0,0,0.15)] transition-all duration-300 transform hover:scale-105 hover:shadow-xl font-sans">
            View Therapist
          </button>
        </div>
      </div>
    </section>
  );
}
