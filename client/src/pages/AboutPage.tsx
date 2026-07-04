import React from 'react';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero Section */}
      <div className="relative w-full h-[450px] md:h-[650px] lg:h-[750px] overflow-hidden">
        <img
          src="/about.svg"
          alt="About Us Background"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h1 className="text-white font-extrabold text-[48px] md:text-[110px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            About Us
          </h1>
          <div className="relative">
            <div className="h-[3px] md:h-[6px] w-[200px] md:w-[522px] bg-white mb-1 md:mb-2"></div>
            <p className="text-white text-[28px] md:text-[64px] font-normal text-center" style={{ fontFamily: 'Bree Serif, serif', textShadow: '0px 4px 4px rgba(0,0,0,0.25)' }}>
              Making You Happier
            </p>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="w-full max-w-7xl mx-auto bg-white px-4 md:px-[37px] py-4 md:py-8">
        {/* About Us Section */}
        <div className="relative w-full lg:w-[95%] mr-auto h-auto min-h-[180px] md:min-h-[250px] bg-[#ABA5D1] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-8 flex flex-col md:flex-row overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex-1 p-5 md:p-6 lg:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[24px] md:text-[28px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              About Us
            </h2>
            <div className="text-white text-[14px] md:text-[15px] leading-relaxed text-justify space-y-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
              <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
              <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
            </div>
          </div>
          <div className="w-full md:w-[30%] lg:w-[25%] h-[180px] md:h-auto overflow-hidden flex-shrink-0">
            <img src="/about-01.svg" alt="About illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Mission Section */}
        <div className="relative w-full lg:w-[95%] ml-auto h-auto min-h-[180px] md:min-h-[250px] bg-[#6DBEDF] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-8 flex flex-col-reverse md:flex-row overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="w-full md:w-[30%] lg:w-[25%] h-[180px] md:h-auto overflow-hidden flex-shrink-0">
            <img src="/about-02.svg" alt="Mission illustration" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-5 md:p-6 lg:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[24px] md:text-[28px] mb-2 md:mb-4 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Mission
            </h2>
            <div className="text-white text-[14px] md:text-[15px] leading-relaxed text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth. However, mental health is neither talked about nor healthy mental health practices are prevalent in India. With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.</p>
            </div>
          </div>
        </div>

        {/* Our Vision Section */}
        <div className="relative w-full lg:w-[95%] mr-auto h-auto min-h-[180px] md:min-h-[250px] bg-[#38ABAE] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-8 flex flex-col md:flex-row overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="flex-1 p-5 md:p-6 lg:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[24px] md:text-[28px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Vision
            </h2>
            <div className="text-white text-[14px] md:text-[15px] leading-relaxed text-justify space-y-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man. At Veraawell, we believe mental wellness is not a luxury — it's a necessity.</p>
              <p>Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.</p>
            </div>
          </div>
          <div className="w-full md:w-[30%] lg:w-[25%] h-[180px] md:h-auto overflow-hidden flex-shrink-0">
            <img src="/about-03.svg" alt="Vision illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Values Section */}
        <div className="relative w-full lg:w-[95%] ml-auto h-auto min-h-[180px] md:min-h-[250px] bg-[#78BE9F] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-8 flex flex-col-reverse md:flex-row overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="w-full md:w-[30%] lg:w-[25%] h-[180px] md:h-auto overflow-hidden flex-shrink-0">
            <img src="/about-04.svg" alt="Values illustration" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-5 md:p-6 lg:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[24px] md:text-[28px] mb-2 md:mb-4 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Values
            </h2>
            <div className="text-white text-[14px] md:text-[15px] leading-relaxed text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile. These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Founder's Message Section */}
      <div className="w-full max-w-7xl mx-auto bg-white px-4 md:px-[37px] pb-16 md:pb-24">
        <div className="relative w-full lg:w-[95%] mx-auto bg-[rgba(248,219,185,0.3)] border border-[rgba(0,0,0,0.1)] rounded-[20px] shadow-sm flex flex-col md:flex-row items-center p-6 md:p-8 lg:p-10 gap-8 md:gap-12">
          
          {/* Founder Card - Original Format but Smaller */}
          <div className="relative flex-shrink-0 mt-2 md:mt-0">
            <div className="w-[200px] md:w-[240px] h-[260px] md:h-[320px] rounded-[16px] overflow-hidden bg-gray-200 shadow-sm border border-white">
              <img 
                src="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=800&auto=format&fit=crop" 
                alt="Harris Chaudhary" 
                className="w-full h-full object-cover object-top"
              />
            </div>
            {/* Overlapping Name Card */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 w-[190px] md:w-[220px] bg-white rounded-[10px] shadow-md py-3 px-2 text-center border border-gray-100">
              <p className="text-[#2F180E] font-bold text-[15px] md:text-[16px] mb-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                Harris Chaudhary
              </p>
              <p className="text-[#BE7959] font-medium text-[11px] md:text-[12px] leading-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                IIM Shillong - MBA'28<br/>IIM Rohtak
              </p>
            </div>
          </div>
          
          {/* Content Side */}
          <div className="flex-1 text-center md:text-left mt-8 md:mt-0">
            <h2 className="text-[#BE7959] font-extrabold text-[24px] md:text-[30px] mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              Founder's Vision
            </h2>
            
            <div className="text-[#4A4A4A] text-[14px] md:text-[15px] leading-relaxed space-y-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>
                "Mental wellness shouldn't be a privilege—it must be a fundamental right. At Veraawell, we are driven to democratize access to quality psychological support across India."
              </p>
              <p>
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
