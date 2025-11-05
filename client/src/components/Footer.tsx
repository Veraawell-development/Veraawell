export default function Footer() {
  return (
    <footer className="w-full bg-white text-gray-800 py-8 md:py-16">
      {/* Top Section - Four Columns */}
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-12 mb-8 md:mb-16">
          
          {/* Follow Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-sm md:text-lg mb-3 md:mb-6">Follow</h3>
            <ul className="space-y-2 md:space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Facebook</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Instagram</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">LinkedIn</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Twitter</a></li>
            </ul>
          </div>

          {/* Navigation Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-sm md:text-lg mb-3 md:mb-6">Navigation</h3>
            <ul className="space-y-2 md:space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">About Us</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Services</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Blog</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">FAQs</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Partners</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Contact Us</a></li>
            </ul>
          </div>

          {/* Our Services Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-sm md:text-lg mb-3 md:mb-6">Our Services</h3>
            <ul className="space-y-2 md:space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Depression</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Anxiety</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Couples</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Individual</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Post-Divorce</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-xs md:text-base">Children</a></li>
            </ul>
          </div>

          {/* Book Session Column */}
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-gray-800 text-sm md:text-lg mb-3 md:mb-6">Book Session</h3>
            <p className="text-gray-500 mb-4 md:mb-6 leading-relaxed text-xs md:text-base max-w-xs">
              Begin your mental health journey by booking your first session with the therapist of your choice.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Section - Separator Line */}
      <div className="border-t border-gray-200 max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center py-6 md:py-8 gap-6">
          
          {/* Logo */}
          <div className="flex-shrink-0">
            <img 
              src="/logo.png" 
              alt="Veraawell Logo" 
              className="w-auto h-12 md:h-20 object-contain"
            />
          </div>

          {/* Payment Methods */}
          <div className="text-center md:text-right w-full md:w-auto">
            <p className="text-[10px] md:text-xs text-gray-400 uppercase mb-2 md:mb-3 tracking-wider font-medium">PAYMENT METHODS:</p>
            <div className="flex flex-wrap justify-center md:justify-end gap-2 md:gap-4">
              <div className="bg-gray-50 px-2 md:px-4 py-1 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-gray-600 border border-gray-200">VISA</div>
              <div className="bg-gray-50 px-2 md:px-4 py-1 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-gray-600 border border-gray-200">MasterCard</div>
              <div className="bg-gray-50 px-2 md:px-4 py-1 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-gray-600 border border-gray-200">Amex</div>
              <div className="bg-gray-50 px-2 md:px-4 py-1 md:py-2 rounded-lg text-[10px] md:text-xs font-bold text-gray-600 border border-gray-200">PayPal</div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 