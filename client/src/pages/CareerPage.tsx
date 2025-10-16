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
      <div className="relative h-screen w-full overflow-hidden">
        {/* Background Image */}
        <img 
          src="/carrer-bg.svg" 
          alt="Career Background" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Text Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold mb-4 tracking-tight">
              Careers
            </h1>
            <p className="text-2xl md:text-3xl lg:text-4xl font-light tracking-wide">
              Making You Happier
            </p>
          </div>
        </div>
      </div>

      {/* Scrolling Banner Section */}
      <div className="py-4 mt-10 overflow-hidden" style={{ backgroundColor: '#A8D5BA' }}>
        <div 
          className="whitespace-nowrap"
          style={{
            animation: 'scroll 20s linear infinite'
          }}
        >
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
          <span className="text-white text-lg font-medium mx-8">
            Join us as a Mental Health Professional
          </span>
        </div>
      </div>

      {/* Main Content Section */}
      <div className="bg-gray-50 py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-normal mb-12 leading-relaxed" style={{ color: '#E07A5F' }}>
            Join us as a mental health professional to kickstart your practice online !
          </h2>
          
          <button 
            onClick={scrollToForm}
            className="text-white font-semibold py-4 px-12 rounded-2xl text-lg transition-colors duration-200 shadow-lg hover:opacity-90"
            style={{ backgroundColor: '#E07A5F' }}
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
    <div className="w-full bg-white py-8 px-2">
      <div className="w-full flex flex-col md:flex-row">
        {/* Image Section */}
        <div className="w-full md:w-80 flex-shrink-0 mr-10">
          <img 
            src="/carrer-01.svg" 
            alt="Mental Health Professional" 
            className="w-full h-96 md:h-80 object-cover rounded-2xl"
          />
        </div>
        
        {/* Text Box Section */}
        <div className="flex-1 p-8 h-96 md:h-80 rounded-2xl flex flex-col justify-center" style={{ backgroundColor: '#b5a7e7' }}>
          <h3 className="text-3xl font-bold mb-4 text-white text-right">
            Why Choose Us?
          </h3>
          <p className="text-white leading-relaxed text-xl text-right">
            We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.
          </p>
        </div>
      </div>
    </div>

    {/* Culture At Veraawell Section */}
    <div className="w-full bg-white py-12 px-2">
      <div className="w-full flex flex-col md:flex-row">
        {/* Text Box Section */}
        <div className="flex-1 p-8 h-96 md:h-80 rounded-2xl flex flex-col justify-center mr-10" style={{ backgroundColor: '#5DADE2' }}>
          <h3 className="text-3xl font-bold mb-4 text-white text-left">
            Culture At Veraawell
          </h3>
          <p className="text-white leading-relaxed text-xl text-left">
            We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.
          </p>
        </div>
        
        {/* Image Section */}
        <div className="w-full md:w-80 flex-shrink-0">
          <img 
            src="/carrer-02.svg" 
            alt="Culture At Veraawell" 
            className="w-full h-96 md:h-80 object-cover rounded-2xl"
          />
        </div>
      </div>
    </div>

    {/* Benefits of Joining Section */}
    <div className="w-full bg-white py-16">
      {/* Benefits Box - Full Width */}
      <div className="w-full px-4 mb-12">
        <div className="rounded-2xl py-12 px-8" style={{ backgroundColor: '#7BC3C3' }}>
          <h2 className="text-3xl font-bold text-white text-center mb-6">
            Benefits of Joining
          </h2>
          <p className="text-white text-lg leading-relaxed text-justify max-w-6xl mx-auto">
            We provide a comprehensive mental wellness platform designed to make therapy accessible, transparent, and effective. With a flexible pricing model, individuals can choose plans that suit their needs without financial strain. Our progress-tracking dashboard and session-wise reports ensure complete clarity on personal growth and improvement. Offering on-demand therapy sessions and a strong network of highly qualified psychologists, we bring expert support right when it's needed the most.
          </p>
        </div>
      </div>

      {/* Join Us Now Form - Centered */}
      <div id="join-us-form" className="max-w-4xl mx-auto px-4">
        <div className="rounded-2xl p-8" style={{ backgroundColor: '#F5E6D3' }}>
          <h2 className="text-3xl font-bold text-center mb-8" style={{ color: '#C17B5C' }}>
            Join Us Now
          </h2>
          
          {/* Tab Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button className="px-6 py-2 rounded-full border-2 text-lg font-medium" style={{ borderColor: '#C17B5C', color: '#C17B5C' }}>
              Partner with us
            </button>
            <button className="px-6 py-2 rounded-full border-2 text-lg font-medium" style={{ borderColor: '#C17B5C', color: '#C17B5C' }}>
              Join us as a professionals
            </button>
            <button className="px-6 py-2 rounded-full border-2 text-lg font-medium" style={{ borderColor: '#C17B5C', color: '#C17B5C' }}>
              Other queries
            </button>
          </div>

          {/* Form */}
          <form className="space-y-6">
            {/* Full Name */}
            <div>
              <label className="block text-lg font-medium mb-2" style={{ color: '#C17B5C' }}>
                Full Name:
              </label>
              <input 
                type="text" 
                className="w-full px-4 py-3 rounded-lg border-2 text-lg"
                style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
              />
            </div>

            {/* Email and Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-lg font-medium mb-2" style={{ color: '#C17B5C' }}>
                  E-mail:
                </label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 rounded-lg border-2 text-lg"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
                />
              </div>
              <div>
                <label className="block text-lg font-medium mb-2" style={{ color: '#C17B5C' }}>
                  Phone no.:
                </label>
                <input 
                  type="tel" 
                  className="w-full px-4 py-3 rounded-lg border-2 text-lg"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
                />
              </div>
            </div>

            {/* Job Role and Upload Documents */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-lg font-medium mb-2" style={{ color: '#C17B5C' }}>
                  Job role:
                </label>
                <select 
                  className="w-full px-4 py-3 rounded-lg border-2 text-lg"
                  style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
                >
                  <option value="">Select role</option>
                  <option value="therapist">Therapist</option>
                  <option value="psychologist">Psychologist</option>
                  <option value="counselor">Counselor</option>
                </select>
              </div>
              <div>
                <label className="block text-lg font-medium mb-2" style={{ color: '#C17B5C' }}>
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
                    className="w-full px-4 py-3 rounded-lg border-2 text-lg cursor-pointer flex items-center justify-between"
                    style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
                  >
                    <span>Choose files</span>
                    <span className="px-3 py-1 rounded text-white text-sm" style={{ backgroundColor: '#C17B5C' }}>
                      Choose file
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* How can we help you */}
            <div>
              <label className="block text-lg font-medium mb-2 text-center" style={{ color: '#C17B5C' }}>
                How can we help you?
              </label>
              <textarea 
                rows={4}
                className="w-full px-4 py-3 rounded-lg border-2 text-lg resize-none"
                style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}
                placeholder="Tell us how we can assist you..."
              />
            </div>

            {/* Submit Button */}
            <div className="text-center">
              <button 
                type="submit"
                className="px-12 py-3 rounded-lg text-white text-xl font-bold shadow-lg hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#C17B5C' }}
              >
                Submit
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    </>

    
  );
};

export default CareerPage;
