import React from 'react';
import LeafDecor from '../components/ui/LeafDecor';
import SparkDecor from '../components/ui/SparkDecor';
import { useScrollReveal } from '../hooks/useScrollReveal';

const AboutPage: React.FC = () => {
  const headerRef = useScrollReveal<HTMLDivElement>();
  const heroImageRef = useScrollReveal<HTMLDivElement>();
  const card1Ref = useScrollReveal<HTMLDivElement>();
  const card2Ref = useScrollReveal<HTMLDivElement>();
  const card3Ref = useScrollReveal<HTMLDivElement>();
  const card4Ref = useScrollReveal<HTMLDivElement>();
  const founderRef = useScrollReveal<HTMLDivElement>();

  return (
    <div className="bg-[var(--bg)] min-h-screen relative overflow-hidden font-sans">
      
      {/* ── Background Immersive Gradients & Decor ── */}
      <div 
        className="absolute top-[-10%] left-[-20%] w-[80vw] h-[80vw] rounded-full mix-blend-multiply filter blur-[120px] opacity-40 z-0"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.12) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 z-0"
        style={{ background: 'radial-gradient(circle, rgba(244,164,172,0.15) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
      />

      <div className="absolute top-0 right-0 pointer-events-none z-0">
        <LeafDecor
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '380px',
            height: '380px',
            transform: 'rotate(45deg)',
            opacity: 0.6,
            animation: 'float-card 10s ease-in-out infinite alternate'
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
        
        {/* ── Premium Hero Section ── */}
        <div ref={headerRef} data-reveal className="text-center max-w-4xl mx-auto mb-10 relative">
          <div className="absolute top-[10%] -left-8 md:-left-16 lg:-left-24 pointer-events-none z-0 hidden sm:block">
            <SparkDecor
              color="#FCE588"
              style={{
                width: '120px',
                height: '120px',
                opacity: 0.5,
                animation: 'float-card 8s ease-in-out infinite alternate-reverse'
              }}
            />
          </div>

          <span className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            — Our Story
          </span>
          <h1 className="leading-tight mb-2" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            About Us
          </h1>
        </div>

        {/* Hero Image - Perfectly Sized & Uncropped */}
        <div className="relative mb-24">
          <div ref={heroImageRef} data-reveal data-delay="1" className="relative w-full max-w-4xl mx-auto group rounded-[32px] overflow-hidden shadow-xl border border-[var(--border)]">
            <img
              src="/aboutpage.png"
              alt="About Veraawell"
              className="w-full h-auto object-contain transform group-hover:scale-[1.03] transition-transform duration-1000 ease-out"
            />
          </div>
          {/* Overlapping Coral Spark tying the poster to the page */}
          <div className="absolute -bottom-8 -right-4 md:right-[15%] pointer-events-none z-20 hidden sm:block">
            <SparkDecor color="rgba(244,164,172,0.8)" style={{ width: '100px', height: '100px', animation: 'float-card 6s ease-in-out infinite alternate' }} />
          </div>
        </div>

        {/* ── Content Sections (Bento-style alternating layout) ── */}
        <div className="flex flex-col gap-8 md:gap-12 mb-24">
          
          {/* About Us Card */}
          <div ref={card1Ref} data-reveal className="flex flex-col md:flex-row bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                01
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Who We Are
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
                <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
                <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[#FFF9E6] relative overflow-hidden min-h-[300px]">
               <img src="/about-01.svg" alt="About illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>

          {/* Our Mission Card */}
          <div ref={card2Ref} data-reveal data-delay="1" className="flex flex-col md:flex-row-reverse bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                02
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Our Mission
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth.</p>
                <p>However, mental health is neither talked about nor healthy mental health practices are prevalent in India. With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[#FDECEE] relative overflow-hidden min-h-[300px]">
               <img src="/about-02.svg" alt="Mission illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>

          {/* Our Vision Card */}
          <div ref={card3Ref} data-reveal data-delay="2" className="flex flex-col md:flex-row bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                03
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Our Vision
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man.</p>
                <p>Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[#EAF1F8] relative overflow-hidden min-h-[300px]">
               <img src="/about-03.svg" alt="Vision illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>

          {/* Our Values Card */}
          <div ref={card4Ref} data-reveal data-delay="3" className="flex flex-col md:flex-row-reverse bg-[var(--surface)] border border-[var(--border)] rounded-[32px] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className="flex-1 p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <span className="text-xs font-bold tracking-[0.2em] mb-6" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                04
              </span>
              <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                Our Values
              </h2>
              <div className="text-[16px] leading-relaxed space-y-4" style={{ color: 'var(--text-2)' }}>
                <p>Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile.</p>
                <p>These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.</p>
              </div>
            </div>
            <div className="w-full md:w-[45%] bg-[var(--bg-3)] relative overflow-hidden min-h-[300px]">
               <img src="/about-04.svg" alt="Values illustration" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-90 group-hover:scale-105 transition-transform duration-700" />
            </div>
          </div>
        </div>

        {/* ── Founder's Message Section ── */}
        <div ref={founderRef} data-reveal className="bg-[var(--surface)] border border-[var(--border)] rounded-[32px] shadow-sm flex flex-col md:flex-row items-center p-8 md:p-12 lg:p-16 gap-10 md:gap-16 relative overflow-hidden">
          {/* Subtle background flair */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--teal-muted)] rounded-full filter blur-3xl opacity-50 z-0"></div>
          
          {/* Founder Image */}
          <div className="relative flex-shrink-0 z-10">
            <div className="w-[200px] md:w-[240px] h-[260px] md:h-[320px] rounded-[24px] overflow-hidden bg-gray-200 shadow-md">
              <img 
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=800&auto=format&fit=crop" 
                alt="Harris Chaudhary" 
                className="w-full h-full object-cover object-top"
              />
            </div>
            {/* Overlapping Name Card */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[220px] bg-white rounded-[16px] shadow-lg py-4 px-3 text-center border border-gray-100">
              <p className="text-[var(--text)] font-bold text-[16px] mb-1" style={{ fontFamily: 'var(--font-display)' }}>
                Harris Chaudhary
              </p>
              <p className="text-[var(--text-2)] font-medium text-[12px] leading-tight uppercase tracking-wide">
                IIM Shillong - MBA'28<br/>IIM Rohtak
              </p>
            </div>
          </div>
          
          {/* Founder Content */}
          <div className="flex-1 text-center md:text-left mt-10 md:mt-0 z-10">
            <h2 className="text-[32px] md:text-[40px] font-bold mb-6" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
              Founder's Vision
            </h2>
            
            <div className="text-[18px] md:text-[20px] leading-relaxed space-y-6" style={{ color: 'var(--text-2)', fontFamily: 'serif' }}>
              <p className="italic">
                "Mental wellness shouldn't be a privilege—it must be a fundamental right. At Veraawell, we are driven to democratize access to quality psychological support across India."
              </p>
              <p className="italic">
                "We are building more than a platform; we are creating a seamless, judgment-free ecosystem. Our goal is to break the stigma and ensure that anyone, anywhere can find a safe space to be heard when they need it most."
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

export default AboutPage;
