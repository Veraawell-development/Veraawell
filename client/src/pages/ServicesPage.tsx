import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCloudRain, FiWind, FiShield, FiBookOpen, FiHeart,
  FiSmile, FiUsers, FiLink, FiUnlock
} from 'react-icons/fi';
import ServiceCard from '../components/ServiceCard';
import BookingPreferenceModal from '../components/BookingPreferenceModal';
import LeafDecor from '../components/ui/LeafDecor';
import SparkDecor from '../components/ui/SparkDecor';
import ArchDecor from '../components/ui/ArchDecor';
import RippleDecor from '../components/ui/RippleDecor';
import WaveDecor from '../components/ui/WaveDecor';
import { useScrollReveal } from '../hooks/useScrollReveal';

const CATEGORIES = ['All', 'Emotional Health', 'Relationships', 'Life Stages', 'Identity & Growth'] as const;
type Category = typeof CATEGORIES[number];

const services: { title: string; description: string; accent: string; icon: React.ReactNode; category: Exclude<Category, 'All'> }[] = [
  {
    title: 'Depression',
    description: 'Specialized therapy to help you overcome depressive episodes, manage symptoms, and rediscover joy and motivation in your daily life.',
    accent: 'var(--sage)',
    icon: <FiCloudRain size={20} />,
    category: 'Emotional Health',
  },
  {
    title: 'Anxiety',
    description: 'Learn effective coping mechanisms and cognitive strategies to manage generalized anxiety, panic attacks, and social anxiety.',
    accent: 'var(--teal)',
    icon: <FiWind size={20} />,
    category: 'Emotional Health',
  },
  {
    title: 'Trauma',
    description: 'A safe, supportive environment to process past traumatic experiences using evidence-based approaches like EMDR and TF-CBT.',
    accent: 'var(--warm)',
    icon: <FiShield size={20} />,
    category: 'Emotional Health',
  },
  {
    title: 'Student Wellbeing',
    description: 'Navigate academic pressure, transition anxiety, and social challenges with specialized support designed specifically for students.',
    accent: 'var(--teal)',
    icon: <FiBookOpen size={20} />,
    category: 'Life Stages',
  },
  {
    title: 'Marriage & Couples',
    description: 'Strengthen communication, rebuild trust, and resolve conflicts through guided couple therapy and relationship counseling.',
    accent: 'var(--warm)',
    icon: <FiHeart size={20} />,
    category: 'Relationships',
  },
  {
    title: 'Child Therapy',
    description: 'Child-friendly therapeutic approaches to help younger patients process emotions, manage behavior, and build resilience.',
    accent: 'var(--sage)',
    icon: <FiSmile size={20} />,
    category: 'Life Stages',
  },
  {
    title: 'Gender & Identity',
    description: 'Affirming care and support for exploring gender identity, sexual orientation, and navigating social transitions.',
    accent: 'var(--warm)',
    icon: <FiUsers size={20} />,
    category: 'Identity & Growth',
  },
  {
    title: 'Relationship',
    description: 'Individual counseling focused on attachment patterns, boundary setting, and building healthier interpersonal connections.',
    accent: 'var(--sage)',
    icon: <FiLink size={20} />,
    category: 'Relationships',
  },
  {
    title: 'Addiction Recovery',
    description: 'Compassionate, non-judgmental support to understand triggers and develop sustainable strategies for long-term recovery.',
    accent: 'var(--teal)',
    icon: <FiUnlock size={20} />,
    category: 'Identity & Growth',
  }
];

const ServicesPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('General');
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const headerRef = useScrollReveal<HTMLDivElement>();
  const gridRef = useScrollReveal<HTMLDivElement>();

  const handleViewTherapist = (serviceType: string) => {
    setSelectedService(serviceType);
    setIsModalOpen(true);
  };

  const filteredServices = useMemo(
    () => activeCategory === 'All' ? services : services.filter(s => s.category === activeCategory),
    [activeCategory]
  );

  return (
    <div className="bg-[var(--bg)] min-h-screen relative overflow-hidden font-sans">
      
      {/* Soft, warm, immersive background gradients */}
      <div 
        className="absolute top-[-10%] left-[-20%] w-[80vw] h-[80vw] rounded-full mix-blend-multiply filter blur-[120px] opacity-50 z-0"
        style={{ background: 'radial-gradient(circle, rgba(0,151,178,0.12) 0%, transparent 70%)', animation: 'blob-drift 25s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute bottom-[-10%] right-[-10%] w-[70vw] h-[70vw] rounded-full mix-blend-multiply filter blur-[100px] opacity-50 z-0"
        style={{ background: 'radial-gradient(circle, rgba(107,168,136,0.12) 0%, transparent 70%)', animation: 'blob-drift-2 20s ease-in-out infinite alternate' }}
      />
      <div 
        className="absolute top-[40%] right-[10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[90px] opacity-40 z-0"
        style={{ background: 'radial-gradient(circle, rgba(196,168,130,0.12) 0%, transparent 70%)', animation: 'blob-drift 30s ease-in-out infinite alternate-reverse' }}
      />

      {/* ── NEW Premium Reusable Decor Elements ── */}
      
      {/* Decorative organic solid blobs (LeafDecor) */}
      <div className="absolute top-0 right-0 pointer-events-none z-0">
        <LeafDecor
          style={{
            position: 'absolute',
            top: '-60px',
            right: '-60px',
            width: '380px',
            height: '380px',
            transform: 'rotate(45deg)',
            opacity: 0.8,
            animation: 'float-card 10s ease-in-out infinite alternate'
          }}
        />
      </div>


      {/* 3. Bottom Left Leaf (flipped) - moved up */}
      <div className="absolute bottom-[20%] left-0 pointer-events-none z-0">
        <LeafDecor
          style={{
            position: 'absolute',
            bottom: '0px',
            left: '-60px',
            width: '280px',
            height: '280px',
            transform: 'rotate(-25deg) scaleX(-1)',
            opacity: 0.6,
            animation: 'float-card 12s ease-in-out infinite alternate-reverse'
          }}
        />
      </div>

      {/* 4. Ripple, opposite the hero sparkle, echoing "reaching out for support" */}
      <div className="absolute top-[6%] right-[4%] pointer-events-none z-0 hidden md:block">
        <RippleDecor
          color="var(--sage)"
          style={{
            width: '160px',
            height: '160px',
            opacity: 0.35,
            animation: 'float-card 9s ease-in-out infinite alternate'
          }}
        />
      </div>

      {/* 5. Arch, grounding the bottom of the page like a doorway into care */}
      <div className="absolute bottom-[2%] left-[8%] pointer-events-none z-0 hidden lg:block">
        <ArchDecor
          color="var(--warm)"
          style={{
            width: '140px',
            height: '140px',
            opacity: 0.3,
            animation: 'float-card 11s ease-in-out infinite alternate-reverse'
          }}
        />
      </div>

      {/* 7. Wave, drifting along the right margin next to the grid */}
      <div className="absolute top-[58%] right-[2%] pointer-events-none z-0 hidden lg:block">
        <WaveDecor
          color="var(--sage)"
          style={{
            width: '170px',
            height: '170px',
            opacity: 0.35,
            transform: 'rotate(-8deg)',
            animation: 'float-card 14s ease-in-out infinite alternate-reverse'
          }}
        />
      </div>

      {/* 8. Second sparkle, bottom-right — bookends the bottom-left arch */}
      <div className="absolute bottom-[4%] right-[6%] pointer-events-none z-0 hidden md:block">
        <SparkDecor
          color="var(--teal)"
          style={{
            width: '90px',
            height: '90px',
            opacity: 0.4,
            animation: 'float-card 10s ease-in-out infinite alternate'
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 relative z-10">
        
        {/* Premium Typographic Hero */}
        <div ref={headerRef} className="text-center max-w-3xl mx-auto mb-20 relative">
          
          {/* Responsive Sparkle anchored to text */}
          <div className="absolute top-[10%] -left-8 md:-left-16 lg:-left-24 pointer-events-none z-0 hidden sm:block">
            <SparkDecor
              color="var(--gold)"
              style={{
                width: '120px',
                height: '120px',
                opacity: 0.6,
                animation: 'float-card 8s ease-in-out infinite alternate-reverse'
              }}
            />
          </div>
          <span data-reveal className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            — Expertise & Specialties
          </span>
          <h1 data-reveal data-delay="1" className="leading-tight mb-6" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Find the right support for <em style={{ color: 'var(--teal)' }}>your journey.</em>
          </h1>
          <p data-reveal data-delay="2" className="text-lg md:text-xl" style={{ color: 'var(--text-2)' }}>
            Our network of verified professionals specializes in a wide range of therapeutic areas, providing personalized care designed around you.
          </p>
        </div>

        {/* Specialties Marquee — minimal, matches About/Career pages */}
        <div className="relative w-full overflow-hidden mb-14" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
          <div className="absolute inset-y-0 left-0 w-16 sm:w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, var(--bg), transparent)' }} />
          <div className="absolute inset-y-0 right-0 w-16 sm:w-32 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, var(--bg), transparent)' }} />
          <div className="marquee-track">
            {[...services, ...services].map((s, i) => (
              <div key={i} className="flex items-center gap-4 sm:gap-6 py-4 flex-none">
                <span
                  className="uppercase whitespace-nowrap"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(13px, 1.4vw, 16px)', letterSpacing: '0.14em', color: 'var(--text-2)', fontWeight: 500 }}
                >
                  {s.title}
                </span>
                <span aria-hidden style={{ color: s.accent, fontSize: 15, lineHeight: 1 }}>✦</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-col items-center gap-4 mb-14">
          <div className="flex flex-wrap justify-center gap-2 md:gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="px-5 py-2.5 rounded-full font-medium text-[14px] transition-all duration-300"
                style={
                  activeCategory === cat
                    ? { background: 'var(--teal)', color: '#fff', boxShadow: 'var(--shadow-teal)' }
                    : { background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)' }
                }
              >
                {cat}
              </button>
            ))}
          </div>
          <span
            key={filteredServices.length}
            className="text-xs font-medium tracking-widest uppercase"
            style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', animation: 'fade-up 0.35s var(--ease-spring)' }}
          >
            {filteredServices.length} {filteredServices.length === 1 ? 'specialty' : 'specialties'}
            {activeCategory !== 'All' ? ` in ${activeCategory}` : ' available'}
          </span>
        </div>

        {/* Services Bento-style Grid — animated on filter change */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          <AnimatePresence mode="popLayout">
            {filteredServices.map((service, index) => (
              <motion.div
                key={service.title}
                layout
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -8 }}
                transition={{ duration: 0.35, delay: (index % 6) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <ServiceCard
                  index={index}
                  title={service.title}
                  description={service.description}
                  accent={service.accent}
                  icon={service.icon}
                  reveal={false}
                  onClick={() => handleViewTherapist(service.title)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

      </div>

      {/* Booking Preference Modal */}
      <BookingPreferenceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        serviceType={selectedService}
      />
    </div>
  );
};

export default ServicesPage;
