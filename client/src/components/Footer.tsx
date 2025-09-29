export default function Footer() {
  return (
    <footer className="md:w-full bg-white text-gray-800 md:py-16 ">
      {/* Top Section - Four Columns */}
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Follow Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-6">Follow</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Facebook</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Instagram</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">LinkedIn</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Twitter</a></li>
            </ul>
          </div>

          {/* Navigation Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-6">Navigation</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">About Us</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Services</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Blog</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">FAQs</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Partners</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Contact Us</a></li>
            </ul>
          </div>

          {/* Our Services Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-6">Our Services</h3>
            <ul className="space-y-3">
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Depression</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Anxiety</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Couples</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Individual</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Post-Divorce</a></li>
              <li><a href="#" className="text-gray-500 hover:text-gray-700 transition-colors text-base">Children</a></li>
            </ul>
          </div>

          {/* Book Session Column */}
          <div>
            <h3 className="font-bold text-gray-800 text-lg mb-6">Book Session</h3>
            <p className="text-gray-500 mb-6 leading-relaxed text-base max-w-xs">
              Begin your mental health journey by booking your first session with the therapist of your choice.
            </p>
            {/* <button className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105">
              Book Session
            </button> */}
          </div>
        </div>
      </div>

      {/* Bottom Section - Separator Line */}
      <div className="border-t border-gray-200 max-w-7xl mx-auto px-8">
        <div className="flex flex-col md:flex-row justify-between items-center py-8">
          
          {/* Logo */}
          <div className="mb-6 md:mb-0">
            {/* <div className="w-20 h-20 bg-amber-800 rounded-full flex items-center justify-center shadow-md"> */}
              <img 
                src="/logo.png" 
                alt="Veraawell Logo" 
                className="w-auto h-20 object-contain"
              />
            {/* </div> */}
          </div>

          {/* Payment Methods */}
          <div className="text-center md:text-right">
            <p className="text-xs text-gray-400 uppercase mb-3 tracking-wider font-medium">PAYMENT METHODS:</p>
            <div className="flex space-x-4">
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-xs font-bold text-gray-600 border border-gray-200">VISA</div>
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-xs font-bold text-gray-600 border border-gray-200">MasterCard</div>
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-xs font-bold text-gray-600 border border-gray-200">American Express</div>
              <div className="bg-gray-50 px-4 py-2 rounded-lg text-xs font-bold text-gray-600 border border-gray-200">PayPal</div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
} 