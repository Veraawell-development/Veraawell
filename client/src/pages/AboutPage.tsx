import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import SparkDecor from '../components/ui/SparkDecor';
import RippleDecor from '../components/ui/RippleDecor';
import ArchDecor from '../components/ui/ArchDecor';
import { useScrollReveal } from '../hooks/useScrollReveal';

/* Same figures already used on the homepage's mission-stats section, kept
   consistent here rather than inventing new numbers. */
const stats = [
  { end: 500, label: 'Sessions Conducted', sublabel: 'on our platform', accent: 'var(--teal)' },
  { end: 1000, label: 'Monthly Active Users', sublabel: 'and growing every day', accent: 'var(--sage)' },
  { end: 50, label: 'Partner Organisations', sublabel: 'across India', accent: 'var(--gold)' },
];

const CountUp: React.FC<{ end: number; duration?: number }> = ({ end, duration = 1500 }) => {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !hasStarted) setHasStarted(true); },
      { threshold: 0.2 }
    );
    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [hasStarted, end, duration]);

  return <span ref={elementRef}>{count.toLocaleString()}+</span>;
};

const VALUES = [
  'Compassion',
  'Accessibility',
  'Confidentiality',
  'Evidence-Based Care',
  'Judgment-Free Space',
  'Verified Experts',
  'Timely Support',
  'Personalized Care',
];

const approach = [
  {
    title: 'Verified Experts',
    description: 'Every professional on Veraawell is credential-checked before they can take a single session.',
    accent: 'var(--teal)',
  },
  {
    title: 'Personalized Matching',
    description: "Tell us what you're navigating, and we point you to the specialist suited to it — not a generic queue.",
    accent: 'var(--sage)',
  },
  {
    title: 'Ongoing Care',
    description: 'Progress notes, session history, and check-ins carry forward, so care compounds instead of restarting.',
    accent: 'var(--gold)',
  },
];

const AboutPage: React.FC = () => {
  const navigate = useNavigate();
  const headerRef = useScrollReveal<HTMLDivElement>();
  const card1Ref = useScrollReveal<HTMLDivElement>();
  const card2Ref = useScrollReveal<HTMLDivElement>();
  const card3Ref = useScrollReveal<HTMLDivElement>();
  const card4Ref = useScrollReveal<HTMLDivElement>();
  const statsRef = useScrollReveal<HTMLDivElement>();
  const approachRef = useScrollReveal<HTMLDivElement>();
  const founderRef = useScrollReveal<HTMLDivElement>();
  const ctaRef = useScrollReveal<HTMLDivElement>();

  const sections = [
    {
      ref: card1Ref, num: '01', title: 'Who We Are', accent: 'var(--teal)',
      img: '/about-01.svg', imgAlt: 'About illustration', imgBg: '#FFF9E680',
      paragraphs: [
        "At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.",
        "We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.",
        "We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.",
      ],
    },
    {
      ref: card2Ref, num: '02', title: 'Our Mission', accent: 'var(--warm)',
      img: '/about-02.svg', imgAlt: 'Mission illustration', imgBg: '#FDECEE80',
      paragraphs: [
        'Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth.',
        "However, mental health is neither talked about nor healthy mental health practices are prevalent in India. With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.",
      ],
    },
    {
      ref: card3Ref, num: '03', title: 'Our Vision', accent: 'var(--sage)',
      img: '/about-03.svg', imgAlt: 'Vision illustration', imgBg: '#EAF1F880',
      paragraphs: [
        'Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man.',
        "Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.",
      ],
    },
    {
      ref: card4Ref, num: '04', title: 'Our Values', accent: 'var(--gold)',
      img: '/about-04.svg', imgAlt: 'Values illustration', imgBg: '#F5F5F4',
      paragraphs: [
        'Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile.',
        'These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.',
      ],
    },
  ];

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

      {/* Additional decor variety, spread down the page rather than clustered in the hero */}
      <div className="absolute top-[8%] right-[4%] pointer-events-none z-0 hidden lg:block">
        <RippleDecor
          color="var(--teal)"
          style={{ width: '150px', height: '150px', opacity: 0.3, animation: 'float-card 9s ease-in-out infinite alternate' }}
        />
      </div>
      <div className="absolute top-[48%] left-[2%] pointer-events-none z-0 hidden lg:block">
        <ArchDecor
          color="var(--sage)"
          style={{ width: '130px', height: '130px', opacity: 0.28, animation: 'float-card 12s ease-in-out infinite alternate-reverse' }}
        />
      </div>
      <div className="absolute bottom-[8%] right-[6%] pointer-events-none z-0 hidden md:block">
        <SparkDecor
          color="var(--gold)"
          style={{ width: '90px', height: '90px', opacity: 0.35, animation: 'float-card 10s ease-in-out infinite alternate' }}
        />
      </div>

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

        {/* ── Values Marquee — a running strip of what we stand for ── */}
        <div className="relative w-full overflow-hidden mb-32" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="absolute inset-y-0 left-0 w-16 sm:w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, var(--bg), transparent)' }} />
          <div className="absolute inset-y-0 right-0 w-16 sm:w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--bg), transparent)' }} />
          <div className="marquee-track">
            {[...VALUES, ...VALUES].map((v, i) => (
              <div key={i} className="flex items-center gap-4 sm:gap-6 py-5 flex-none">
                <span
                  className="uppercase whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(13px, 1.4vw, 16px)', letterSpacing: '0.14em', color: 'var(--text-2)', fontWeight: 500 }}
                >
                  {v}
                </span>
                <span aria-hidden style={{ color: 'var(--teal)', fontSize: 16, lineHeight: 1 }}>✦</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Content Sections (varied editorial rows, one accent per idea) ── */}
        {/*
          md:min-h-[420px] gives every card the same height. They are stacked
          full-width rows, not a grid, so there is no shared row track to
          equalise them — height was purely a function of body copy (card 01
          has three paragraphs, the rest two, and 03's are the longest). The
          image column was already uniform at md:w-[42%] aspect-[16/10].
          items-center keeps the shorter cards' content optically centred.

          Mirrored in AboutPage.tsx and CareerPage.tsx, which carry identical
          copies of this block.
        */}
        <div className="flex flex-col gap-14 md:gap-16 mb-40">
          {sections.map((s, i) => (
            <div
              key={s.num}
              ref={s.ref}
              data-reveal
              className={`group relative overflow-hidden flex flex-col md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''} items-center gap-8 md:gap-14 rounded-[20px] p-6 md:p-9 border transition-all duration-500 hover:-translate-y-1 md:min-h-[420px]`}
              style={{ background: `linear-gradient(135deg, ${s.accent}0C, transparent 60%)`, borderColor: `${s.accent}22`, boxShadow: '0 4px 24px rgba(0,0,0,0.03)' }}
            >
              {/* Top accent line */}
              <div
                className="absolute top-0 left-8 right-8 md:left-10 md:right-10 h-[2px] rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)` }}
              />

              <div className="flex-1 order-2 md:order-1">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold flex-none transition-transform duration-500 group-hover:scale-110"
                    style={{ background: `${s.accent}18`, color: s.accent, fontFamily: 'var(--font-display)' }}
                  >
                    {s.num}
                  </div>
                  <span aria-hidden style={{ color: s.accent, fontSize: 14 }}>✦</span>
                </div>
                <h2 className="text-[30px] md:text-[38px] font-normal mb-5 leading-tight tracking-tight" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  {s.title}
                </h2>
                <div className="text-[16.5px] leading-relaxed space-y-4 text-gray-600">
                  {s.paragraphs.map((p, pi) => <p key={pi}>{p}</p>)}
                </div>
              </div>

              <div
                className="w-full md:w-[42%] flex-none order-1 md:order-2 rounded-[18px] aspect-[16/10] relative overflow-hidden"
                style={{ background: s.imgBg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' }}
              >
                <img src={s.img} alt={s.imgAlt} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]" />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `linear-gradient(to top, ${s.accent}26, transparent 45%)` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* ── By The Numbers ── */}
        <div ref={statsRef} className="mb-40">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-sm font-semibold tracking-widest uppercase block mb-4 text-teal-600">
              By The Numbers
            </span>
            <h2 className="leading-tight font-normal tracking-tight" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 44px)', color: 'var(--text)' }}>
              A growing community of care.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {stats.map((stat, i) => (
              <div
                key={i}
                data-reveal="scale"
                data-delay={i + 1}
                className="group relative rounded-[28px] p-8 text-center bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.06)] hover:-translate-y-1.5 transition-all duration-300 overflow-hidden"
              >
                {/* Hover tint wash, matching the homepage stat cards */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `${stat.accent}08` }}
                />
                <div
                  className="w-2.5 h-2.5 rounded-full mx-auto mb-5 relative z-10"
                  style={{ background: stat.accent }}
                />
                <div
                  className="leading-none mb-3 relative z-10"
                  style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(44px, 5vw, 60px)', color: stat.accent }}
                >
                  <CountUp end={stat.end} />
                </div>
                <p className="font-semibold text-[16px] mb-1 relative z-10" style={{ color: 'var(--text)' }}>{stat.label}</p>
                <p className="text-sm text-gray-400 relative z-10">{stat.sublabel}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Our Approach (numbered process, echoing "How It Works") ── */}
        <div ref={approachRef} className="mb-40">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-sm font-semibold tracking-widest uppercase block mb-4 text-teal-600">
              How We Work
            </span>
            <h2 className="leading-tight font-normal tracking-tight" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 44px)', color: 'var(--text)' }}>
              Care, built the right way around.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {approach.map((step, i) => (
              <div
                key={i}
                data-reveal="scale"
                data-delay={i + 1}
                className="group relative rounded-[28px] p-8 text-center bg-white border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.06)] hover:-translate-y-1.5 transition-all duration-300 overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `${step.accent}08` }}
                />
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-6 relative z-10 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `${step.accent}14`, color: step.accent, fontFamily: 'var(--font-display)' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-[20px] font-bold mb-3 relative z-10" style={{ color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
                  {step.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-gray-500 max-w-xs mx-auto relative z-10">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Founder's Message (Editorial Style) ── */}
        <div ref={founderRef} data-reveal className="max-w-5xl mx-auto border-t border-gray-100 pt-20">
          <div className="relative bg-gradient-to-br from-[#FAFAFA] via-white to-[#F0F7F7] rounded-[36px] p-8 md:p-14 border border-gray-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col md:flex-row items-center gap-10 md:gap-14">
            {/* Background Decorative Accent */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#2E8A99]/10 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-[#005B5C]/10 to-transparent rounded-full blur-2xl pointer-events-none -ml-16 -mb-16"></div>

            {/* Founder Image with Premium Frame */}
            <div className="relative flex-shrink-0 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#2E8A99] to-[#005B5C] rounded-[26px] blur-sm opacity-30 group-hover:opacity-60 transition duration-700"></div>
              <div className="relative w-[200px] h-[250px] md:w-[220px] md:h-[280px] rounded-[24px] overflow-hidden shadow-2xl border-[3px] border-white bg-white">
                <img 
                  src="/profile-main.jpg" 
                  alt="Harris Chaudhary" 
                  className="w-full h-full object-cover object-top scale-[1.20] transition-transform duration-700 group-hover:scale-[1.25]"
                />
              </div>
              <div className="absolute -bottom-3 -right-3 bg-[#005B5C] text-white px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-md border border-white/20 z-20">
                Founder
              </div>
            </div>
            
            {/* Founder Content */}
            <div className="flex-1 text-center md:text-left relative z-10">
              {/* Oversized Quote Mark */}
              <div className="text-[#2E8A99]/15 text-[80px] md:text-[100px] font-serif leading-none absolute -top-8 -left-6 md:-left-8 select-none pointer-events-none">
                “
              </div>
              
              <div className="relative text-[22px] md:text-[30px] leading-relaxed text-gray-900 font-medium mb-8" style={{ fontFamily: 'var(--font-display)' }}>
                <p className="italic">
                  "Mental wellness shouldn't be a privilege, it must be a fundamental right."
                </p>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between border-t border-gray-200/60 pt-6 gap-4">
                <div>
                  <p className="text-gray-900 font-bold text-[20px] tracking-tight mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>
                    Harris Chaudhary
                  </p>
                  <p className="text-[#2E8A99] font-semibold text-[12px] uppercase tracking-[0.2em]">
                    Founder & CEO, Veraawell
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <span className="w-12 h-[1px] bg-[#2E8A99]/40"></span>
                  <span className="text-[13px] font-serif italic text-gray-500">A vision for accessible care</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Closing CTA ── */}
        <div ref={ctaRef} data-reveal className="max-w-3xl mx-auto text-center mt-32">
          <h2 className="leading-tight mb-6 font-normal tracking-tight" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 48px)', color: 'var(--text)' }}>
            Ready to begin <em style={{ color: 'var(--teal)' }}>your journey?</em>
          </h2>
          <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">
            Talk to a verified therapist today — no waitlists, no judgment, just support when you need it.
          </p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="inline-flex items-center gap-2 px-9 py-4 rounded-full text-white font-semibold text-[16px] shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            style={{ background: 'var(--teal)', boxShadow: 'var(--shadow-teal)' }}
          >
            Find Your Therapist
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
};

export default AboutPage;
