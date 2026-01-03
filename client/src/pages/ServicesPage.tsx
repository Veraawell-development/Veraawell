import React, { useState } from 'react';
import ServiceCard from '../components/ServiceCard';
import BookingPreferenceModal from '../components/BookingPreferenceModal';

const services = [
  {
    title: 'DEPRESSION',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-01.svg',
    color: '#6DBEDF' // Blue
  },
  {
    title: 'ANXIETY',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-02.svg',
    color: '#38ABAE' // Teal
  },
  {
    title: 'TRAUMA',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-03.svg',
    color: '#ABA5D1' // Purple
  },
  {
    title: 'STUDENT',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-04.svg',
    color: '#38ABAE' // Teal
  },
  {
    title: 'MARRIAGE',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-05.svg',
    color: '#ABA5D1' // Purple
  },
  {
    title: 'CHILD THERAPY',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-07.svg',
    color: '#6DBEDF' // Blue
  },
  {
    title: 'GENDER-RELATED',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-08.svg',
    color: '#ABA5D1' // Purple
  },
  {
    title: 'RELATIONSHIP',
    description: 'Addiction is a condition where a person becomes dependent on a substance or behavior despite its harmful effects. It often impacts mental',
    image: '/service-06.svg',
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
      <div
        className="relative min-h-[55vh] bg-cover bg-center flex items-center justify-center text-white"
        style={{ backgroundImage: 'url(/service-bg.svg)' }}
      >
        <div className="text-center drop-shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
          <h1 className="text-5xl md:text-7xl font-extrabold">Our Services</h1>
          <div className="mt-2 h-1 w-40 md:w-56 bg-white/80 mx-auto rounded-full" />
          <p className="text-xl md:text-2xl mt-4 font-semibold">Making You Happier</p>
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
