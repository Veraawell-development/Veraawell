import React, { useState } from 'react';
import ServiceCard from '../components/ServiceCard';
import BookingPreferenceModal from '../components/BookingPreferenceModal';

const services = [
  {
    title: 'DEPRESSION',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-01.svg',
    imageClassName: 'w-32 md:w-40 lg:w-48 -bottom-3 -left-4',
    color: '#6DBEDF' // Blue
  },
  {
    title: 'ANXIETY',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-02.svg',
    imageClassName: 'w-24 md:w-32 lg:w-36 -bottom-0 left-0 drop-shadow-[0_8px_12px_rgba(0,0,0,0.3)]',
    color: '#38ABAE' // Teal
  },
  {
    title: 'TRAUMA',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-03.svg',
    imageClassName: 'w-28 md:w-32 lg:w-40 -bottom-2 -left-4',
    color: '#ABA5D1' // Purple
  },
  {
    title: 'STUDENT',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-04.svg',
    imageClassName: 'w-32 md:w-40 lg:w-48 bottom-0 -left-2', // Hard bottom edge
    color: '#38ABAE' // Teal
  },
  {
    title: 'MARRIAGE',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-05.svg',
    imageClassName: 'w-32 md:w-40 lg:w-48 -bottom-2 left-0',
    color: '#ABA5D1' // Purple
  },
  {
    title: 'CHILD THERAPY',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-07.svg',
    imageClassName: 'w-28 md:w-36 lg:w-40 bottom-0 left-2', // Hard bottom edge portrait
    color: '#6DBEDF' // Blue
  },
  {
    title: 'GENDER-RELATED',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-08.svg',
    imageClassName: 'w-24 md:w-28 lg:w-32 bottom-0 left-4', // Hard bottom edge standing
    color: '#ABA5D1' // Purple
  },
  {
    title: 'RELATIONSHIP',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-06.svg',
    imageClassName: 'w-32 md:w-40 lg:w-44 bottom-0 -left-2', // Hard bottom edge
    color: '#6DBEDF' // Blue
  },
  {
    title: 'ADDICTION',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    color: '#38ABAE' // Teal
    // No image property
  }
];

const ServicesPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('General');

  const handleViewTherapist = (serviceType: string) => {
    setSelectedService(serviceType);
    setIsModalOpen(true);
  };

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative w-full h-[450px] md:h-[650px] lg:h-[750px] overflow-hidden">
        <img
          src="/service-bg.svg"
          alt="Our Services Background"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h1 className="text-white font-extrabold text-[48px] md:text-[110px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Our Services
          </h1>
          <div className="relative">
            <div className="h-[3px] md:h-[6px] w-[200px] md:w-[522px] bg-white mx-auto mb-1 md:mb-2"></div>
            <p className="text-white text-[28px] md:text-[64px] font-normal text-center" style={{ fontFamily: 'Bree Serif, serif', textShadow: '0px 4px 4px rgba(0,0,0,0.25)' }}>
              Making You Happier
            </p>
          </div>
        </div>
      </div>

      {/* Services Grid */}
      <div className="py-12 px-4 md:px-8 lg:px-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <ServiceCard
              key={index}
              title={service.title}
              description={service.description}
              imageSrc={service.image}
              imageClassName={service.imageClassName}
              bgColor={service.color}
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
