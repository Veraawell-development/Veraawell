import React from 'react';
import { useNavigate } from 'react-router-dom';
import DoctorCard from '../components/DoctorCard';

const ChooseProfessionalPage: React.FC = () => {
  const navigate = useNavigate();

  const handleBookSession = () => {
    navigate('/doctor-profile');
  };

  const doctors = [
    {
      name: "Ishan Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#ABA5D1"
    },
    {
      name: "Aprajita Singh",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-02.svg",
      bgColor: "#6DBEDF"
    },
    {
      name: "Isha Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#38ABAE"
    },
    {
      name: "Ishan Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#38ABAE"
    },
    {
      name: "Aprajita Singh",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-02.svg",
      bgColor: "#ABA5D1"
    },
    {
      name: "Isha Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#6DBEDF"
    },
    {
      name: "Ishan Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#6DBEDF"
    },
    {
      name: "Aprajita Singh",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-02.svg",
      bgColor: "#38ABAE"
    },
    {
      name: "Isha Sharma",
      experience: "5 years",
      qualification: "MPhil., BSC(Psy)",
      pricing: "500rs - 1500rs",
      language: "English, Hindi",
      treatsFor: "Depressive disorders, ADHD, OCD",
      imageSrc: "/doctor-01.svg",
      bgColor: "#ABA5D1"
    }
  ];

  return (
    <div className="bg-white min-h-screen">
      {/* Main Content Section */}
      <div className="py-20 px-10" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-4xl mx-auto text-center">
          {/* Main Heading */}
          <h1 className="text-4xl md:text-5xl font-semibold mb-8 font-serif" style={{ color: '#38ABAE' }}>
            Choose the Right Professional for Yourself
          </h1>
          
          {/* Description Paragraph */}
          <p className="text-lg md:text-xl text-gray-700 leading-relaxed mb-12 max-w-3xl mx-auto font-serif font-medium">
            Therapy is far more than a doctor-patient relationship. It is a partnership that alleviates 
            you every step of the way. That is why, you need to choose your psychologist carefully 
            and find someone with whom you are comfortable.
          </p>
          
          {/* Free Discovery Session Heading */}
          <h2 className="text-3xl md:text-4xl font-semibold mb-8 font-serif" style={{ color: '#38ABAE' }}>
            Free Discovery session !
          </h2>
          
          {/* Discovery Session Description */}
          <p className="text-lg md:text-xl text-gray-700 leading-relaxed max-w-3xl mx-auto font-serif font-medium">
            If confused, begin with a Discovery Session to get to know your therapist and an initial 
            experience of how everything works.
          </p>
        </div>
      </div>

      {/* Doctors Section */}
      <div className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {doctors.map((doctor, index) => (
              <DoctorCard
                key={index}
                name={doctor.name}
                experience={doctor.experience}
                qualification={doctor.qualification}
                pricing={doctor.pricing}
                language={doctor.language}
                treatsFor={doctor.treatsFor}
                imageSrc={doctor.imageSrc}
                bgColor={doctor.bgColor}
                onBookSession={handleBookSession}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChooseProfessionalPage;
