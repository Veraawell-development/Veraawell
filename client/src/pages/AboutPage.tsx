import React from 'react';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Hero Section */}
      <div className="relative w-full h-[500px] md:h-[971px]">
        <img
          src="/about.svg"
          alt="About Us Background"
          className="absolute inset-0 w-full h-full object-cover"
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
      <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        {/* About Us Section */}
        <div className="relative w-full h-auto md:h-[400px] bg-[#ABA5D1] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-4 md:mb-6 flex flex-col md:flex-row overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[28px] md:text-[40px] mb-3 md:mb-5" style={{ fontFamily: 'Inter, sans-serif' }}>
              About Us
            </h2>
            <div className="text-white text-[16px] md:text-[20px] leading-relaxed text-justify space-y-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
              <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
              <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
            </div>
          </div>
          <div className="w-full md:w-[40%] h-[300px] md:h-full overflow-hidden flex-shrink-0">
            <img src="/about-01.svg" alt="About illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Mission Section */}
        <div className="relative w-full h-auto md:h-[400px] bg-[#6DBEDF] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-4 md:mb-6 flex flex-col-reverse md:flex-row overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
          <div className="w-full md:w-[40%] h-[300px] md:h-full overflow-hidden flex-shrink-0">
            <img src="/about-02.svg" alt="Mission illustration" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[28px] md:text-[45px] mb-3 md:mb-5 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Mission
            </h2>
            <div className="text-white text-[16px] md:text-[20px] leading-relaxed text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our mission is to give mental health the place that it deserves in the Indian Society. We delve upon diversified topics such that of education, business, art, unemployment, politics and so on and so forth. However, mental health is neither talked about nor healthy mental health practices are prevalent in India. With respect to it, our mission constitutes the recognition of mental health not as an issue but as a regular healthy practice to be followed, just as keeping a track of your physical health.</p>
            </div>
          </div>
        </div>

        {/* Our Vision Section */}
        <div className="relative w-full h-auto md:h-[400px] bg-[#38ABAE] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-4 md:mb-6 flex flex-col md:flex-row overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[28px] md:text-[45px] mb-3 md:mb-5" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Vision
            </h2>
            <div className="text-white text-[16px] md:text-[20px] leading-relaxed text-justify space-y-3" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our vision speaks to the future of mental health. For the population of India, we want to boost accessibility to psychologists and quality mental healthcare. Subsequently, we aim to make it affordable for the common man. At Veraawell, we believe mental wellness is not a luxury — it's a necessity.</p>
              <p>Our vision runs parallel with encouraging the psychologists, current students of psychology and those interested in the field to view starting their practice online as a viable career option. We plan to induce 'ease of doing business' mindset in this field so as to encourage admission of more mental health professional in the industry.</p>
            </div>
          </div>
          <div className="w-full md:w-[40%] h-[300px] md:h-full overflow-hidden flex-shrink-0">
            <img src="/about-03.svg" alt="Vision illustration" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Our Values Section */}
        <div className="relative w-full h-auto md:h-[400px] bg-[#78BE9F] border border-[rgba(0,0,0,0.16)] rounded-[20px] mb-4 md:mb-6 flex flex-col-reverse md:flex-row overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
          <div className="w-full md:w-[40%] h-[300px] md:h-full overflow-hidden flex-shrink-0">
            <img src="/about-04.svg" alt="Values illustration" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 p-6 md:p-8 flex flex-col justify-center">
            <h2 className="text-white font-extrabold text-[28px] md:text-[45px] mb-3 md:mb-5 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
              Our Values
            </h2>
            <div className="text-white text-[16px] md:text-[20px] leading-relaxed text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
              <p>Our values are rooted in the Indian culture. Integrity, Honesty, Transparency and Compassion are pillars of Veraawell and they complement our working philosophy to the last mile. These values help us to maintain a consumer-first approach and stay on the path of righteousness and revolution.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Our Team Section */}
      <div className="w-full bg-white px-4 md:px-[37px] pb-6 md:pb-12">
        <div className="relative w-full min-h-[500px] md:h-[612px] bg-[rgba(248,219,185,0.49)] border border-[rgba(0,0,0,0.16)] rounded-[10px] p-6 md:p-12">
          <h2 className="text-[#BE7959] font-extrabold text-[32px] md:text-[52px] text-center mb-6 md:mb-12" style={{ fontFamily: 'Inter, sans-serif' }}>
            Our Team
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 justify-items-center">
            {/* Team Member 1 */}
            <div className="text-center">
              <div className="w-[150px] md:w-[294px] h-[200px] md:h-[392px] rounded-[10px] overflow-hidden mb-2 md:mb-4">
                <img src="/female.jpg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-[10px] h-[60px] md:h-[75px] flex items-center justify-center px-2">
                <div className="text-[#2F180E] text-[14px] md:text-[20px] font-medium text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p className="mb-0">Dr. Riya Gupta</p>
                  <p className="font-bold">Lead psychologist</p>
                </div>
              </div>
            </div>

            {/* Team Member 2 */}
            <div className="text-center">
              <div className="w-[150px] md:w-[294px] h-[200px] md:h-[392px] rounded-[10px] overflow-hidden mb-2 md:mb-4">
                <img src="/female.jpg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-[10px] h-[60px] md:h-[75px] flex items-center justify-center px-2">
                <div className="text-[#2F180E] text-[14px] md:text-[20px] font-medium text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p className="mb-0">Dr. Riya Gupta</p>
                  <p className="font-bold">Lead psychologist</p>
                </div>
              </div>
            </div>

            {/* Team Member 3 */}
            <div className="text-center">
              <div className="w-[150px] md:w-[294px] h-[200px] md:h-[392px] rounded-[10px] overflow-hidden mb-2 md:mb-4">
                <img src="/female.jpg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-[10px] h-[60px] md:h-[75px] flex items-center justify-center px-2">
                <div className="text-[#2F180E] text-[14px] md:text-[20px] font-medium text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p className="mb-0">Dr. Riya Gupta</p>
                  <p className="font-bold">Lead psychologist</p>
                </div>
              </div>
            </div>

            {/* Team Member 4 */}
            <div className="text-center">
              <div className="w-[150px] md:w-[294px] h-[200px] md:h-[392px] rounded-[10px] overflow-hidden mb-2 md:mb-4">
                <img src="/female.jpg" alt="Dr. Riya Gupta" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white rounded-[10px] h-[60px] md:h-[75px] flex items-center justify-center px-2">
                <div className="text-[#2F180E] text-[14px] md:text-[20px] font-medium text-center" style={{ fontFamily: 'Inter, sans-serif' }}>
                  <p className="mb-0">Dr. Riya Gupta</p>
                  <p className="font-bold">Lead psychologist</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
