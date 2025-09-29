export default function MissionStats() {
  return (
    <section className="w-full bg-[#E0EAEA] py-12 sm:py-16 md:py-20 px-2 sm:px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* Header Section with Illustration */}
        <div className="flex flex-col items-center mb-12 sm:mb-16 md:mb-20">
          {/* Mission Statement Header with Illustration */}
          <div className="relative">
            {/* Illustration positioned at right corner touching header */}
            <div className="absolute -top-15 sm:-top-6 md:-top-30 right-7 sm:-right-6 md:right-8 z-10">
              <img 
                src="/assest01.svg" 
                alt="Mental health professional illustration"
                className="w-16 h-16 sm:w-24 sm:h-24 md:w-32 md:h-32 object-contain"
              />
            </div>
            
            <div className="bg-[#7EBCBA] rounded-[20px] sm:rounded-[30px] md:rounded-[40px] px-6 sm:px-12 md:px-16 py-2 sm:py-3 md:py-4 shadow-lg shadow-black/10 mb-6 sm:mb-9 md:mb-12">
              <h2 className="text-white text-[16px] sm:text-[22px] md:text-[28px] font-bold text-center leading-tight" style={{fontFamily: 'Bree Serif, serif'}}>
                We've made your mental health our mission.
              </h2>
            </div>
          </div>
          
          {/* Description Text */}
          <div className="text-center max-w-4xl mx-auto mb-12 sm:mb-16 md:mb-20">
            <p className="text-[#5A7A7A] text-sm sm:text-lg md:text-xl leading-relaxed font-medium px-2 sm:px-4 md:px-0" style={{fontFamily: 'Bree Serif, serif'}}>
              At Veraawell, we've built a diverse team of 50+ experts from the fields of therapy, psychiatry, technology, and business — each bringing unique skills and perspectives to support your mental wellness journey.
            </p>
          </div>
        </div>

        {/* Statistics Section */}
        <div className="grid grid-cols-3 gap-4 sm:gap-8 md:gap-12">
          
          {/* Sessions Conducted */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4" style={{fontFamily: 'Bree Serif, serif'}}>
              500+
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight" style={{fontFamily: 'Bree Serif, serif'}}>
              Sessions<br />
              Conducted on<br />
              Our Platform
            </h3>
          </div>

          {/* Monthly Active Users */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4" style={{fontFamily: 'Bree Serif, serif'}}>
              1000+
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight" style={{fontFamily: 'Bree Serif, serif'}}>
              Monthly Active<br />
              Users on Our<br />
              Platform
            </h3>
          </div>

          {/* Partnerships */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4" style={{fontFamily: 'Bree Serif, serif'}}>
              50+
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight" style={{fontFamily: 'Bree Serif, serif'}}>
              Partnerships<br />
              with Leading<br />
              Organizations
            </h3>
          </div>

        </div>
      </div>
    </section>
  );
}
