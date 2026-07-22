import React from 'react';
import SparkDecor from '../components/ui/SparkDecor';
import { useScrollReveal } from '../hooks/useScrollReveal';

const AboutPage: React.FC = () => {
  const headerRef = useScrollReveal<HTMLDivElement>();
  const card1Ref = useScrollReveal<HTMLDivElement>();
  const card2Ref = useScrollReveal<HTMLDivElement>();
  const card3Ref = useScrollReveal<HTMLDivElement>();
  const card4Ref = useScrollReveal<HTMLDivElement>();
  const founderRef = useScrollReveal<HTMLDivElement>();

  return (
    <div className="bg-[var(--bg)] min-h-screen relative overflow-hidden font-sans">
      
      {/* ── Minimal Background Decor ── */}
      <div 
        className="absolute top-0 left-[-10%] w-[60vw] h-[60vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-20 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.1) 0%, transparent 70%)' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-20 z-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(244,164,172,0.1) 0%, transparent 70%)' }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-40 pb-32 relative z-10">
        
        {/* ── Editorial Hero Section ── */}
        <div ref={headerRef} data-reveal className="text-center max-w-3xl mx-auto mb-32 relative">
          {/* Decorative Stars */}
          <div className="absolute top-[-20%] left-[-10%] pointer-events-none z-0 hidden sm:block">
            <SparkDecor
              color="#FCE588"
              style={{
                width: '80px',
                height: '80px',
                opacity: 0.6,
                animation: 'float-card 8s ease-in-out infinite alternate-reverse'
              }}
            />
          </div>
          <div className="absolute bottom-[-40%] right-[-15%] pointer-events-none z-0 hidden sm:block">
            <SparkDecor
              color="rgba(244,164,172,0.8)"
              style={{
                width: '100px',
                height: '100px',
                opacity: 0.5,
                animation: 'float-card 6s ease-in-out infinite alternate'
              }}
            />
          </div>

          <span className="text-sm font-semibold tracking-widest uppercase block mb-6 text-teal-600 relative z-10">
            Our Story
          </span>
          <h1 className="leading-[1.1] mb-8 font-normal tracking-tight" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(48px, 6vw, 72px)', color: 'var(--text)' }}>
            Democratising mental healthcare for India.
          </h1>
          <p className="text-lg md:text-xl leading-relaxed text-gray-500 font-medium">
            We are building a seamless, judgment-free ecosystem to ensure that anyone, anywhere can find a safe space to be heard.
          </p>
        </div>

        {/* ── Content Sections (Minimal Alternating Rows) ── */}
        <div className="flex flex-col gap-24 md:gap-32 mb-40">
          
          {/* Who We Are */}
          <div ref={card1Ref} data-reveal className="flex flex-col md:flex-row items-center gap-12 md:gap-20 bg-white border border-gray-100 rounded-[32px] p-6 md:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex-1 order-2 md:order-1">
              <span className="text-sm font-bold tracking-[0.2em] mb-4 block text-gray-400">
                01
              </span>
              <h2 className="text-[32px] md:text-[40px] font-normal mb-6 leading-tight tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Who We Are
              </h2>
              <div className="text-[17px] leading-relaxed space-y-5 text-gray-600">
                <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
                <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
                <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
              </div>
            </div>
            <div className="w-full md:w-1/2 order-1 md:order-2 bg-[#FFF9E6]/50 rounded-[32px] p-8 md:p-12 aspect-square flex items-center justify-center relative overflow-hidden group">
               <img src="/about-01.svg" alt="About illustration" className="w-full h-full object-cover mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
            </div>
          </div>

          {/* Our Mission */}
          <div ref={card2Ref} data-reveal className="flex flex-col md:flex-row-reverse items-center gap-12 md:gap-20 bg-white border border-gray-100 rounded-[32px] p-6 md:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex-1 order-2 md:order-1">
              <span className="text-sm font-bold tracking-[0.2em] mb-4 block text-gray-400">
                02
              </span>
              <h2 className="text-[32px] md:text-[40px] font-normal mb-6 leading-tight tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Our Mission
              </h2>
              <div className="text-[17px] leading-relaxed space-y-5 text-gray-600">
                <p>Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth.</p>
                <p>However, mental health is neither talked about nor healthy mental health practices are prevalent in India. With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.</p>
              </div>
            </div>
            <div className="w-full md:w-1/2 order-1 md:order-2 bg-[#FDECEE]/50 rounded-[32px] p-8 md:p-12 aspect-square flex items-center justify-center relative overflow-hidden group">
               <img src="/about-02.svg" alt="Mission illustration" className="w-full h-full object-cover mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
            </div>
          </div>

          {/* Our Vision */}
          <div ref={card3Ref} data-reveal className="flex flex-col md:flex-row items-center gap-12 md:gap-20 bg-white border border-gray-100 rounded-[32px] p-6 md:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex-1 order-2 md:order-1">
              <span className="text-sm font-bold tracking-[0.2em] mb-4 block text-gray-400">
                03
              </span>
              <h2 className="text-[32px] md:text-[40px] font-normal mb-6 leading-tight tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Our Vision
              </h2>
              <div className="text-[17px] leading-relaxed space-y-5 text-gray-600">
                <p>Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man.</p>
                <p>Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.</p>
              </div>
            </div>
            <div className="w-full md:w-1/2 order-1 md:order-2 bg-[#EAF1F8]/50 rounded-[32px] p-8 md:p-12 aspect-square flex items-center justify-center relative overflow-hidden group">
               <img src="/about-03.svg" alt="Vision illustration" className="w-full h-full object-cover mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
            </div>
          </div>

          {/* Our Values */}
          <div ref={card4Ref} data-reveal className="flex flex-col md:flex-row-reverse items-center gap-12 md:gap-20 bg-white border border-gray-100 rounded-[32px] p-6 md:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-500">
            <div className="flex-1 order-2 md:order-1">
              <span className="text-sm font-bold tracking-[0.2em] mb-4 block text-gray-400">
                04
              </span>
              <h2 className="text-[32px] md:text-[40px] font-normal mb-6 leading-tight tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                Our Values
              </h2>
              <div className="text-[17px] leading-relaxed space-y-5 text-gray-600">
                <p>Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile.</p>
                <p>These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.</p>
              </div>
            </div>
            <div className="w-full md:w-1/2 order-1 md:order-2 bg-[#F5F5F4] rounded-[32px] p-8 md:p-12 aspect-square flex items-center justify-center relative overflow-hidden group">
               <img src="/about-04.svg" alt="Values illustration" className="w-full h-full object-cover mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
            </div>
          </div>
        </div>

        {/* ── Founder's Message (Editorial Style) ── */}
        <div ref={founderRef} data-reveal className="max-w-4xl mx-auto border-t border-gray-100 pt-20 flex flex-col md:flex-row items-center gap-12">
          {/* Founder Image */}
          <div className="relative flex-shrink-0">
            <div className="w-[180px] h-[220px] rounded-2xl overflow-hidden shadow-xl filter grayscale hover:grayscale-0 transition-all duration-700">
              <img 
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=800&auto=format&fit=crop" 
                alt="Harris Chaudhary" 
                className="w-full h-full object-cover object-top"
              />
            </div>
          </div>
          
          {/* Founder Content */}
          <div className="flex-1 text-center md:text-left">
            <div className="text-[22px] md:text-[28px] leading-snug space-y-6 text-gray-800 mb-8" style={{ fontFamily: 'var(--font-display)' }}>
              <p>
                "Mental wellness shouldn't be a privilege — it must be a fundamental right."
              </p>
            </div>
            <div>
              <p className="text-[var(--text)] font-bold text-[18px] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                Harris Chaudhary
              </p>
              <p className="text-gray-400 font-medium text-[12px] uppercase tracking-widest">
                Founder, Veraawell
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default AboutPage;
