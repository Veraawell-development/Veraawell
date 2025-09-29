import React from 'react';
import { Link } from 'react-router-dom';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white" style={{ transform: 'scale(clamp(0.6, 1vw + 0.5, 1))', transformOrigin: 'top center' }}>
      {/* Hero Section */}
      <div className="relative h-screen w-full overflow-hidden">
        <img 
          src="/about.svg" 
          alt="About Us Background" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-8xl font-bold mb-4 tracking-tight">
              About Us
            </h1>
            <p className="text-4xl font-light tracking-wide">
              Making You Happier
            </p>
          </div>
        </div>
      </div>

      <div className="w-full bg-white px-4 space-y-8 py-8">
        {/* About Us Card */}
        <div className="w-full rounded-3xl h-[40vh] overflow-hidden flex" style={{ backgroundColor: '#B8A7E8' }}>
          <div className="w-[70%] p-8"> {/* Adjust padding here to control card height */}
            <h2 className="text-4xl font-bold text-white mb-8">About Us</h2>
            <div className="space-y-6 text-white text-lg leading-relaxed">
              <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
              <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
              <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
            </div>
          </div>
          <div className="w-[30%]">
            <img src="/about-01.svg" alt="About illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Mission Card */}
        <div className="w-full rounded-3xl h-[40vh] overflow-hidden flex" style={{ backgroundColor: '#7BC3E8' }}>
          <div className="w-[30%]">
            <img src="/about-02.svg" alt="Mission illustration" className="w-full h-full object-cover" />
          </div>
          <div className="w-[70%] p-8"> {/* Adjust padding here to control card height */}
            <h2 className="text-4xl font-bold text-white mb-8">Our Mission</h2>
            <div className="space-y-6 text-white text-lg leading-relaxed">
              <p>Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth. However, mental health is neither talked about nor healthy mental health practices are prevalent in India.</p>
              <p>With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.</p>
            </div>
          </div>
        </div>

        {/* Our Vision Card */}
        <div className="w-full rounded-3xl h-[40vh] overflow-hidden flex" style={{ backgroundColor: '#5DADE2' }}>
          <div className="w-[70%] p-8"> {/* Adjust padding here to control card height */}
            <h2 className="text-4xl font-bold text-white mb-8">Our Vision</h2>
            <div className="space-y-6 text-white text-lg leading-relaxed">
              <p>Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man. At Veraawell, we believe mental wellness is not a luxury — it's a necessity.</p>
              <p>Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.</p>
            </div>
          </div>
          <div className="w-[30%]">
            <img src="/about-03.svg" alt="Vision illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Values Card */}
        <div className="w-full rounded-3xl h-[40vh] overflow-hidden flex" style={{ backgroundColor: '#9AD2BE' }}>
          <div className="w-[30%]">
            <img src="/about-04.svg" alt="Values illustration" className="w-full h-full object-cover" />
          </div>
          <div className="w-[70%] p-8"> {/* Adjust padding here to control card height */}
            <h2 className="text-4xl font-bold text-white mb-8">Our Values</h2>
            <div className="space-y-6 text-white text-lg leading-relaxed">
              <p>Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile.</p>
              <p>These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Our Team Section */}
      <div className="w-full bg-white px-4 py-8">
        <div className="w-full rounded-3xl p-12" style={{ backgroundColor: '#FDF2E3' }}>
          <h2 className="text-5xl font-bold text-center mb-12" style={{ color: '#C17B5C' }}>
            Our Team
          </h2>
          <div className="grid grid-cols-4 gap-8">
            {/* Team Member 1 */}
            <Link to="/doctor-profile" className="text-center block transition-transform transform hover:scale-105">
              <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
                <img src="/doctor-01.svg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-bold">Dr. Riya Gupta</h3>
                <p className="text-gray-600">Lead psychologist</p>
              </div>
            </Link>

            {/* Team Member 2 */}
            <Link to="/doctor-profile" className="text-center block transition-transform transform hover:scale-105">
              <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
                <img src="/doctor-02.svg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-bold">Dr. Riya Gupta</h3>
                <p className="text-gray-600">Lead psychologist</p>
              </div>
            </Link>

            {/* Team Member 3 */}
            <Link to="/doctor-profile" className="text-center block transition-transform transform hover:scale-105">
              <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
                <img src="/doctor-03.svg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-bold">Dr. Riya Gupta</h3>
                <p className="text-gray-600">Lead psychologist</p>
              </div>
            </Link>

            {/* Team Member 4 */}
            <Link to="/doctor-profile" className="text-center block transition-transform transform hover:scale-105">
              <div className="rounded-2xl overflow-hidden shadow-lg mb-4">
                <img src="/doctor-04.svg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-lg p-4 shadow-md">
                <h3 className="text-xl font-bold">Dr. Riya Gupta</h3>
                <p className="text-gray-600">Lead psychologist</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
