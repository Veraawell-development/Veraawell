import { useState } from 'react';

export default function Reviews() {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const testimonials = [
    {
      name: "Isha",
      rating: 5,
      text: "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.",
      bgColor: "bg-[#A594C4]"
    },
    {
      name: "Isha",
      rating: 5,
      text: "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.",
      bgColor: "bg-[#7BC3E8]"
    },
    {
      name: "Isha",
      rating: 5,
      text: "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.",
      bgColor: "bg-[#9BC49A]"
    },
    {
      name: "Isha",
      rating: 3,
      text: "I came in feeling lost, and today I feel stronger and more in control of my life. Thank you, Veraawell, for your guidance and patience.",
      bgColor: "bg-[#F4B87A]"
    },
    {
      name: "Rahul",
      rating: 5,
      text: "Veraawell has been a game-changer for my mental health journey. The therapists are compassionate and understanding.",
      bgColor: "bg-[#E89B9B]"
    },
    {
      name: "Priya",
      rating: 4,
      text: "The platform is user-friendly and the sessions have helped me develop better coping strategies for stress and anxiety.",
      bgColor: "bg-[#B8A9E8]"
    },
    {
      name: "Arjun",
      rating: 5,
      text: "Professional service with genuine care. I've seen significant improvement in my mental wellness since joining.",
      bgColor: "bg-[#A8D8A8]"
    },
    {
      name: "Sneha",
      rating: 4,
      text: "The flexibility to schedule sessions at my convenience has made therapy accessible for my busy lifestyle.",
      bgColor: "bg-[#F4C87A]"
    }
  ];

  const cardsPerView = 4;
  const maxIndex = Math.max(0, testimonials.length - cardsPerView);

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
  };


  return (
    <section className="w-full bg-[#E0EAEA] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Illustration */}
        <div className="relative flex justify-center mb-16">
          {/* People Illustration */}
          <div className="absolute md:-top-16 left-1/2 transform -translate-x-1/2 z-20 sm:-top-16 ">
            <img 
              src="/2453876 1.svg" 
              alt="People illustration"
              className="w-80 h-auto mt-3"
            />
          </div>
          
          {/* Reviews Header */}
          <div className="bg-[#C17B5C] rounded-[40px] px-20 py-2 shadow-[0_8px_16px_rgba(0,0,0,0.2)] mt-32 relative z-10">
            <h2 className="text-white text-[36px] font-bold text-center font-serif">
              Reviews
            </h2>
          </div>
        </div>

        {/* Slider Container */}
        <div className="relative">
          {/* Navigation Buttons */}
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-2 sm:-translate-x-3 md:-translate-x-4 z-10 bg-white rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-[#C17B5C] text-sm sm:text-lg md:text-xl font-bold">‹</span>
          </button>

          <button
            onClick={handleNext}
            disabled={currentIndex >= maxIndex}
            className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-2 sm:translate-x-3 md:translate-x-4 z-10 bg-white rounded-full w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-[#C17B5C] text-sm sm:text-lg md:text-xl font-bold">›</span>
          </button>

          {/* Testimonials Slider */}
          <div className="overflow-hidden">
            <div 
              className="flex transition-transform duration-500 ease-in-out gap-2 sm:gap-4 md:gap-6"
              style={{ transform: `translateX(-${currentIndex * (100 / cardsPerView)}%)` }}
            >
              {testimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className={`${testimonial.bgColor} rounded-[15px] sm:rounded-[18px] md:rounded-[20px] p-3 sm:p-4 md:p-6 shadow-[0_4px_8px_rgba(0,0,0,0.1)] flex-shrink-0 h-32 sm:h-40 md:h-auto min-h-[180px]`}
                  style={{ width: `calc(${100 / cardsPerView}% - 8px)` }}
                >
                  {/* Name */}
                  <h3 className="text-white text-[12px] sm:text-[16px] md:text-[18px] font-bold mb-1 sm:mb-2 font-sans">
                    {testimonial.name}
                  </h3>
                  
                  {/* Star Rating */}
                  <div className="flex mb-2 sm:mb-3 md:mb-4">
                    <div className="flex space-x-0.5">
                      {Array.from({ length: 5 }, (_, starIndex) => (
                        <span
                          key={starIndex}
                          className={`text-[10px] sm:text-[14px] md:text-[16px] ${
                            starIndex < testimonial.rating ? 'text-[#FFB800]' : 'text-gray-300'
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  {/* Testimonial Text */}
                  <p className="text-white text-[8px] sm:text-[11px] md:text-[14px] leading-[1.3] sm:leading-[1.4] md:leading-[1.5] font-sans overflow-hidden">
                    "{testimonial.text}"
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Dots Indicator */}
          <div className="flex justify-center mt-8 space-x-2">
            {Array.from({ length: maxIndex + 1 }, (_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  currentIndex === index ? 'bg-[#C17B5C]' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
