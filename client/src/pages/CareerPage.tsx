import React from 'react';

const CareerPage: React.FC = () => {
  const scrollToForm = () => {
    const formElement = document.getElementById('join-us-form');
    if (formElement) {
      formElement.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  return (
    <>
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative w-full h-[500px] md:h-[971px]">
        <img 
          src="/carrer-bg.svg" 
          alt="Career Background" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h1 className="text-white font-extrabold text-[48px] md:text-[110px] mb-2 md:mb-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            Careers
          </h1>
          <div className="relative">
            <div className="h-[3px] md:h-[6px] w-[200px] md:w-[522px] bg-white mb-1 md:mb-2"></div>
            <p className="text-white text-[28px] md:text-[64px] font-normal text-center" style={{ fontFamily: 'Bree Serif, serif', textShadow: '0px 4px 4px rgba(0,0,0,0.25)' }}>
              Making You Happier
            </p>
          </div>
        </div>
      </div>

      {/* Scrolling Banner Section */}
      <div className="py-3 sm:py-4 overflow-hidden" style={{ backgroundColor: '#A8D5BA' }}>
        <div 
          className="whitespace-nowrap"
          style={{
            animation: 'scroll 20s linear infinite'
          }}
        >
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
          <span className="text-white font-medium mx-4 sm:mx-6 md:mx-8" 
                style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>
            Join us as a Mental Health Professional
          </span>
        </div>
      </div>

      {/* Main Content Section */}
      <div className="bg-white py-10 sm:py-14 md:py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="font-normal mb-6 sm:mb-8 md:mb-12 leading-relaxed text-[24px] md:text-[40px]" style={{ color: '#E07A5F', fontFamily: 'Inter, sans-serif' }}>
            Join us as a mental health professional to kickstart your practice online!
          </h2>
          <button 
            onClick={scrollToForm}
            className="text-white font-semibold rounded-2xl transition-colors duration-200 shadow-lg hover:opacity-90 px-8 py-3 text-[18px] md:text-[24px]"
            style={{ backgroundColor: '#E07A5F', fontFamily: 'Inter, sans-serif' }}
          >
            Join Now
          </button>
        </div>
      </div>

      {/* Add custom CSS for scrolling animation */}
      <style dangerouslySetInnerHTML={{
        __html: `
          html {
            scroll-behavior: smooth;
          }
          @keyframes scroll {
            0% {
              transform: translateX(100%);
            }
            100% {
              transform: translateX(-100%);
            }
          }
        `
      }} />
    </div>

    {/* Why Choose Us Section */}
    <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
      <div className="relative w-full min-h-[400px] md:h-[483px] bg-[#ABA5D1] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 flex flex-col md:flex-row">
        <div className="w-full md:w-[362px] h-[250px] md:h-[483px] rounded-[10px] overflow-hidden flex-shrink-0">
          <img src="/carrer-01.svg" alt="Mental Health Professional" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 p-6 md:p-12 flex flex-col justify-center">
          <h2 className="text-white font-extrabold text-[28px] md:text-[45px] mb-4 md:mb-8 text-left md:text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
            Why Choose Us?
          </h2>
          <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
          </div>
        </div>
      </div>
    </div>

    {/* Culture At Veraawell Section */}
    <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
      <div className="relative w-full min-h-[400px] md:h-[483px] bg-[#6DBEDF] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 flex flex-col md:flex-row">
        <div className="flex-1 p-6 md:p-12">
          <h2 className="text-white font-extrabold text-[28px] md:text-[40px] mb-4 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            Culture At Veraawell
          </h2>
          <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify space-y-2 md:space-y-4" style={{ fontFamily: 'Inter, sans-serif' }}>
            <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
          </div>
        </div>
        <div className="w-full md:w-[362px] h-[250px] md:h-[483px] rounded-[10px] overflow-hidden flex-shrink-0">
          <img src="/carrer-02.svg" alt="Culture At Veraawell" className="w-full h-full object-cover" />
        </div>
      </div>
    </div>

    {/* Benefits of Joining Section */}
    <div className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
      <div className="relative w-full min-h-[300px] bg-[#38ABAE] border border-[rgba(0,0,0,0.16)] rounded-[10px] mb-4 md:mb-8 p-6 md:p-12">
        <h2 className="text-white font-extrabold text-[32px] md:text-[45px] text-center mb-4 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
          Benefits of Joining
        </h2>
        <div className="text-white text-[16px] md:text-[26px] leading-normal text-justify max-w-6xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
          <p>We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.</p>
        </div>
      </div>
    </div>

      {/* Join Us Now Form - Centered */}
      <div id="join-us-form" className="w-full bg-white px-4 md:px-[37px] py-4 md:py-8">
        <div className="max-w-4xl mx-auto rounded-[10px] p-6 md:p-12" style={{ backgroundColor: 'rgba(248,219,185,0.49)', border: '1px solid rgba(0,0,0,0.16)' }}>
          <h2 className="text-[#BE7959] font-extrabold text-[32px] md:text-[52px] text-center mb-6 md:mb-8" style={{ fontFamily: 'Inter, sans-serif' }}>
            Join Us Now
          </h2>
          
          {/* Tab Buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-3 md:gap-4 mb-6 md:mb-8">
            <button className="rounded-full border-2 font-medium px-6 py-2 text-[14px] md:text-[18px] hover:bg-[#C17B5C] hover:text-white transition-colors" 
                    style={{ borderColor: '#C17B5C', color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
              Partner with us
            </button>
            <button className="rounded-full border-2 font-medium px-6 py-2 text-[14px] md:text-[18px] hover:bg-[#C17B5C] hover:text-white transition-colors" 
                    style={{ borderColor: '#C17B5C', color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
              Join us as a professionals
            </button>
            <button className="rounded-full border-2 font-medium px-6 py-2 text-[14px] md:text-[18px] hover:bg-[#C17B5C] hover:text-white transition-colors" 
                    style={{ borderColor: '#C17B5C', color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
              Other queries
            </button>
          </div>

          {/* Form */}
          <form className="space-y-4 md:space-y-6">
            {/* Full Name */}
            <div>
              <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                Full Name:
              </label>
              <input 
                type="text" 
                className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
              />
            </div>

            {/* Email and Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                  E-mail:
                </label>
                <input 
                  type="email" 
                  className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                />
              </div>
              <div>
                <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                  Phone no.:
                </label>
                <input 
                  type="tel" 
                  className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                />
              </div>
            </div>

            {/* Job Role and Upload Documents */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                  Job role:
                </label>
                <select 
                  className="w-full rounded-lg border px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                >
                  <option value="">Select role</option>
                  <option value="therapist">Therapist</option>
                  <option value="psychologist">Psychologist</option>
                  <option value="counselor">Counselor</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-2 text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                  Upload Documents:
                </label>
                <div className="relative">
                  <input 
                    type="file" 
                    className="hidden" 
                    id="documents"
                    multiple
                  />
                  <label 
                    htmlFor="documents"
                    className="w-full rounded-lg border cursor-pointer flex items-center justify-between px-4 py-3 text-[14px] md:text-[16px]"
                    style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                  >
                    <span className="text-gray-500">Choose files</span>
                    <span className="rounded text-white px-3 py-1 text-[12px] md:text-[14px]" style={{ backgroundColor: '#C17B5C' }}>
                      Choose file
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* How can we help you */}
            <div>
              <label className="block font-medium mb-2 text-center text-[14px] md:text-[18px]" style={{ color: '#C17B5C', fontFamily: 'Inter, sans-serif' }}>
                How can we help you?
              </label>
              <textarea 
                rows={4}
                className="w-full rounded-lg border resize-none px-4 py-3 text-[14px] md:text-[16px] focus:outline-none focus:border-[#C17B5C]"
                style={{ borderColor: '#E5E5E5', backgroundColor: 'white', fontFamily: 'Inter, sans-serif' }}
                placeholder="Tell us how we can assist you..."
              />
            </div>

            {/* Submit Button */}
            <div className="text-center pt-4">
              <button 
                type="submit"
                className="rounded-lg text-white font-bold shadow-lg hover:opacity-90 transition-opacity px-12 py-3 text-[18px] md:text-[24px]"
                style={{ backgroundColor: '#C17B5C', fontFamily: 'Inter, sans-serif' }}
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CareerPage;
