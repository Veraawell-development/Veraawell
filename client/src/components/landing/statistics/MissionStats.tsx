import React, { useState, useEffect, useRef } from 'react';

const CountUp: React.FC<{ end: number; duration: number }> = ({ end, duration }) => {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.1 } // Trigger early for better UX
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    let start = 0;
    const increment = end / (duration / 16); // 16ms per frame
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [hasStarted, end, duration]);

  return <span ref={elementRef}>{count}+</span>;
};

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
            
            <div className="bg-[#7EBCBA] rounded-full px-12 py-3 shadow-lg shadow-black/10 mb-6 sm:mb-9 md:mb-12">
              <h2 className="text-white text-[16px] sm:text-[22px] md:text-[28px] font-bold text-center leading-tight font-sans">
                We've made your mental health our mission.
              </h2>
            </div>
          </div>
          
          {/* Description Text */}
          <div className="text-center max-w-4xl mx-auto mb-12 sm:mb-16 md:mb-20">
            <p className="text-[#5A7A7A] text-sm sm:text-lg md:text-xl leading-relaxed font-medium px-2 sm:px-4 md:px-0 font-sans">
              At Veraawell, we've built a diverse team of 50+ experts from the fields of therapy, psychiatry, technology, and business — each bringing unique skills and perspectives to support your mental wellness journey.
            </p>
          </div>
        </div>

        {/* Statistics Section */}
        <div className="grid grid-cols-3 gap-4 sm:gap-8 md:gap-12">
          
          {/* Sessions Conducted */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4 font-sans">
              <CountUp end={500} duration={1500} />
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight font-sans">
              Sessions<br />
              Conducted on<br />
              Our Platform
            </h3>
          </div>

          {/* Monthly Active Users */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4 font-sans">
              <CountUp end={1000} duration={1500} />
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight font-sans">
              Monthly Active<br />
              Users on Our<br />
              Platform
            </h3>
          </div>

          {/* Partnerships */}
          <div className="text-center">
            <div className="text-[#5A7A7A] text-[32px] sm:text-[48px] md:text-[64px] font-bold mb-2 sm:mb-3 md:mb-4 font-sans">
              <CountUp end={50} duration={1500} />
            </div>
            <h3 className="text-[#5A7A7A] text-[10px] sm:text-[16px] md:text-[20px] font-semibold leading-tight font-sans">
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
