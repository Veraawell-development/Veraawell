import React, { useState } from 'react';
import ServiceCard from '../components/ServiceCard';
import BookingPreferenceModal from '../components/BookingPreferenceModal';
import LeafDecor from '../components/ui/LeafDecor';
import SparkDecor from '../components/ui/SparkDecor';
import { useScrollReveal } from '../hooks/useScrollReveal';

const services = [
  {
    title: 'Depression',
    description: 'Specialized therapy to help you overcome depressive episodes, manage symptoms, and rediscover joy and motivation in your daily life.',
    accent: 'var(--blue)'
  },
  {
    title: 'Anxiety',
    description: 'Learn effective coping mechanisms and cognitive strategies to manage generalized anxiety, panic attacks, and social anxiety.',
    accent: 'var(--teal)'
  },
  {
    title: 'Trauma',
    description: 'A safe, supportive environment to process past traumatic experiences using evidence-based approaches like EMDR and TF-CBT.',
    accent: 'var(--purple)'
  },
  {
    title: 'Student Wellbeing',
    description: 'Navigate academic pressure, transition anxiety, and social challenges with specialized support designed specifically for students.',
    accent: 'var(--teal)'
  },
  {
    title: 'Marriage & Couples',
    description: 'Strengthen communication, rebuild trust, and resolve conflicts through guided couple therapy and relationship counseling.',
    accent: 'var(--purple)'
  },
  {
    title: 'Child Therapy',
    description: 'Child-friendly therapeutic approaches to help younger patients process emotions, manage behavior, and build resilience.',
    accent: 'var(--blue)'
  },
  {
    title: 'Gender & Identity',
    description: 'Affirming care and support for exploring gender identity, sexual orientation, and navigating social transitions.',
    accent: 'var(--purple)'
  },
  {
    title: 'Relationship',
    description: 'Individual counseling focused on attachment patterns, boundary setting, and building healthier interpersonal connections.',
    accent: 'var(--blue)'
  },
  {
    title: 'Addiction Recovery',
    description: 'Compassionate, non-judgmental support to understand triggers and develop sustainable strategies for long-term recovery.',
    accent: 'var(--teal)'
  }
];

const ServicesPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('General');
  const headerRef = useScrollReveal<HTMLDivElement>();
  const gridRef = useScrollReveal<HTMLDivElement>();

  const handleViewTherapist = (serviceType: string) => {
    setSelectedService(serviceType);
    setIsModalOpen(true);
  };

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
          <span className="text-xs font-medium tracking-widest uppercase block mb-4" style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            — Expertise & Specialties
          </span>
          <h1 className="leading-tight mb-6" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 5vw, 64px)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Find the right support for <em style={{ color: 'var(--teal)' }}>your journey.</em>
          </h1>
          <p className="text-lg md:text-xl" style={{ color: 'var(--text-2)' }}>
            Our network of verified professionals specializes in a wide range of therapeutic areas, providing personalized care designed around you.
          </p>
        </div>

        {/* Services Bento-style Grid */}
        <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {services.map((service, index) => (
            <ServiceCard
              key={index}
              index={index}
              title={service.title}
              description={service.description}
              accent={service.accent}
              onClick={() => handleViewTherapist(service.title)}
            />
          ))}
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
