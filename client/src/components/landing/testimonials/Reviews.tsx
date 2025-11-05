import React from 'react';

export default function Reviews() {
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
    },
    {
      name: "Amit",
      rating: 5,
      text: "I appreciate the confidentiality and ease of booking sessions. Veraawell is a blessing!",
      bgColor: "bg-[#A594C4]"
    },
    {
      name: "Neha",
      rating: 4,
      text: "Therapy at Veraawell has helped me regain my confidence and peace of mind.",
      bgColor: "bg-[#7BC3E8]"
    },
    {
      name: "Karan",
      rating: 5,
      text: "The therapists are knowledgeable and truly care about your progress.",
      bgColor: "bg-[#9BC49A]"
    },
    {
      name: "Simran",
      rating: 5,
      text: "The best mental health platform I've used so far. Highly recommend!",
      bgColor: "bg-[#F4B87A]"
    }
  ];

  // For scrolling
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const scrollByCard = () => {
    if (!scrollRef.current) return 0;
    const card = scrollRef.current.querySelector('div[data-testimonial-card]');
    return card ? (card as HTMLElement).offsetWidth + 32 : 350; // 32 = gap-8
  };
  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -scrollByCard(), behavior: 'smooth' });
    }
  };
  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: scrollByCard(), behavior: 'smooth' });
    }
  };

  return (
    <section className="w-full bg-[#E0EAEA] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Illustration */}
        <div className="relative flex justify-center mb-16">
          <div className="absolute md:-top-16 left-1/2 transform -translate-x-1/2 z-20 sm:-top-16 ">
            <img 
              src="/2453876 1.svg" 
              alt="People illustration"
              className="w-80 h-auto mt-3"
            />
          </div>
          <div className="bg-[#C17B5C] rounded-[40px] px-20 py-2 shadow-[0_8px_16px_rgba(0,0,0,0.2)] mt-32 relative z-10">
            <h2 className="text-white text-[36px] font-bold text-center font-serif">
              Reviews
            </h2>
          </div>
        </div>
        {/* Horizontal Scrollable Testimonials */}
        <div className="relative">
          <button
            onClick={scrollLeft}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full w-12 h-12 items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            aria-label="Scroll left"
            style={{transform: 'translate(-50%, -50%)'}}
          >
            <span className="text-[#C17B5C] text-3xl font-bold">&#8249;</span>
          </button>
          <div
            ref={scrollRef}
            className="flex gap-4 sm:gap-6 md:gap-8 overflow-x-auto scroll-smooth pb-4 hide-scrollbar"
            style={{scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'}}
          >
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                data-testimonial-card
                className={`
                  ${testimonial.bgColor}
                  min-w-[85vw] max-w-[95vw] sm:min-w-[340px] sm:max-w-[370px] md:min-w-[320px] md:max-w-[350px]
                  rounded-[10px] border border-[rgba(0,0,0,0.16)] shadow-xl flex flex-col h-full p-5 sm:p-8 flex-shrink-0
                `}
              >
                <h3 className="text-white font-bold text-[22px] sm:text-[26px] md:text-[30px] font-bowlby mb-2 leading-tight">
                  {testimonial.name}
                </h3>
                <div className="flex items-center mb-4">
                  {Array.from({ length: 5 }, (_, starIndex) => (
                    <span
                      key={starIndex}
                      className={`text-[24px] sm:text-[28px] md:text-[32px] mr-1 ${starIndex < testimonial.rating ? 'text-[#FFB800]' : 'text-white/40'}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-white font-bree text-[15px] sm:text-[18px] md:text-[22px] leading-snug">
                  "{testimonial.text}"
                </p>
              </div>
            ))}
          </div>
          <button
            onClick={scrollRight}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white rounded-full w-12 h-12 items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50"
            aria-label="Scroll right"
            style={{transform: 'translate(50%, -50%)'}}
          >
            <span className="text-[#C17B5C] text-3xl font-bold">&#8250;</span>
          </button>
        </div>
      </div>
    </section>
  );
}
