export default function HeroSection() {
  return (
    <section className="relative w-full bg-white">
      <img src="/bg.png" alt="Background" className="w-full h-auto" />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-[#E0EAEA]"></div>
      <img src="/hero-assest.svg" alt="Therapy Illustration" className="absolute bottom-0 right-8 h-auto w-1/4 max-w-xs z-10" />
    </section>
  );
} 