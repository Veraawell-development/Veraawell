import React from 'react';

const DoctorProfilePage: React.FC = () => {
  return (
    <div className="bg-white min-h-screen">
      {/* Hero Section with Background */}
      <div className="relative h-[60vh] overflow-hidden">
        <img 
          src="/profile-bg.svg" 
          alt="Veraawell clinic background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0  bg-opacity-30"></div>
      </div>

      {/* Profile Details Section */}
      <div className="relative -mt-32 max-w-5xl mx-auto px-4">
        <div className="flex items-end">
          {/* Profile Picture */}
          <div className="w-1/3">
            <div className="rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
              <img src="/doctor-01.svg" alt="Dr. Isha Sharma" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Profile Info */}
          <div className="w-2/3 pl-12 pb-4">
            <div className="flex justify-between items-center">
              <h1 className="text-5xl font-bold text-gray-800">Isha Sharma</h1>
              <div className="flex text-yellow-500">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-8 h-8 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                ))}
              </div>
            </div>
            <div className="mt-4 text-lg text-gray-700 space-y-2">
              <p><span className="font-bold">Experience:</span> 5+ years</p>
              <p><span className="font-bold">Qualification:</span> M. Phil, M. sc</p>
              <p><span className="font-bold">Specialization:</span> Depressive Disorders, Dysphoric Disorder</p>
              <p><span className="font-bold">Languages:</span> Hindi, English</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quote and About Section */}
      <div className="mt-16 py-16 px-4" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-semibold italic mb-8" style={{ color: '#38ABAE' }}>
            "Who looks outside, dreams; who looks inside, awakes"
          </h2>
          <div className="text-gray-600 text-lg leading-relaxed space-y-4">
            <p>At Veraawell, we believe mental wellness is not a luxury — it's a necessity. Our mission is simple: to make professional psychological support accessible, reliable, and timely for everyone who needs it.</p>
            <p>We connect you with highly qualified and compassionate psychologists who specialize in understanding your unique needs. Whether you're seeking help for anxiety, depression, stress, relationship issues, or personal growth, our experts are here to guide you — right when you need them.</p>
            <p>We know that mental health struggles can't always wait, so we ensure timely consultations, flexible scheduling, and a safe, judgment-free space for every individual.</p>
          </div>
        </div>
      </div>

      {/* Booking Section */}
      <div className="py-16 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Card */}
            <div className="bg-[#4DBAB2] rounded-2xl p-8 text-white shadow-2xl">
              <div className="space-y-8">
                {/* Select Mode */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Select Mode:</h3>
                  <div className="flex space-x-3">
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">Video Call</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">Voice Call</button>
                  </div>
                </div>
                {/* Select Duration */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Select Duration:</h3>
                  <div className="flex space-x-3">
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">55 Minutes</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">40 Minutes</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">25 Minutes</button>
                  </div>
                </div>
                {/* Price */}
                <div className="flex items-center">
                  <h3 className="font-bold text-xl w-1/3">Price:</h3>
                  <div className="flex space-x-3">
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">Rs. 2000</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">Rs. 1200</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">Rs. 0</button>
                  </div>
                </div>
                <p className="text-sm pt-4 font-medium">Note: The session for the duration of 25 minutes is a discovery session where you can discuss your problems and discuss the way forward.</p>
              </div>
            </div>

            {/* Right Card */}
            <div className="bg-[#4DBAB2] rounded-2xl p-8 text-white shadow-2xl">
              <div className="space-y-8">
                {/* Select Date */}
                <div>
                  <h3 className="font-bold text-xl mb-4">Select Date:</h3>
                  <div className="flex space-x-3 overflow-x-auto pb-2">
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner"><div>05 Sep</div><div className="font-bold">SUN</div></button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner"><div>06 Sep</div><div className="font-bold">MON</div></button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner"><div>07 Sep</div><div className="font-bold">TUE</div></button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-4 rounded-lg text-center flex-shrink-0 shadow-inner"><div>08 Sep</div><div className="font-bold">WED</div></button>
                  </div>
                </div>
                {/* Select Slot */}
                <div>
                  <h3 className="font-bold text-xl mb-4">Select Slot:</h3>
                  <div className="flex space-x-3">
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">09:00 A.M</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">11:00 A.M</button>
                    <button className="bg-[#E0F7FA] text-[#38ABAE] font-semibold py-2 px-5 rounded-full shadow-inner">03:00 P.M</button>
                  </div>
                </div>
                <div className="text-center pt-4">
                  <button className="bg-[#E0F7FA] text-[#38ABAE] font-bold py-3 px-10 rounded-full shadow-md text-xl">Book Now</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reviews Section */}
      <div className="py-16" style={{ backgroundColor: '#E3F0F0' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex overflow-x-auto space-x-8 pb-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md flex-shrink-0 w-80">
                <h3 className="text-2xl font-bold mb-2" style={{ color: '#38ABAE' }}>
                  {index % 2 === 0 ? 'Neha' : 'Karan'}
                </h3>
                <div className="flex text-yellow-500 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-6 h-6 fill-current" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
                  ))}
                </div>
                <p className="text-gray-600 italic leading-relaxed">
                  "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience."
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorProfilePage;
