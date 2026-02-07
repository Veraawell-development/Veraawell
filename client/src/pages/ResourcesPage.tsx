import React from 'react';
import { useNavigate } from 'react-router-dom';

const ResourcesPage: React.FC = () => {
  const navigate = useNavigate();

  const resourceCategories = [
    {
      title: 'Articles',
      description: 'Expert-written articles on mental health topics',
      path: '/resources/articles',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      title: 'Videos',
      description: 'Educational videos and expert insights',
      path: '/resources/videos',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6' }}>
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
            <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-700">
              Home
            </button>
            <svg className="w-4 h-4 mx-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-900 font-medium">Resources</span>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
            Resources
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl" style={{ fontFamily: 'Inter, sans-serif' }}>
            Explore our collection of mental health resources designed to support your wellness journey
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* All Resources Card */}
        <div
          className="bg-white rounded-2xl p-8 mb-12 cursor-pointer hover:shadow-lg transition-all border border-gray-200"
          onClick={() => navigate('/resources/articles')}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                All Resources
              </h2>
              <p className="text-lg text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                Clinically vetted resources on a range of mental health topics.
              </p>
            </div>
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Resources Section */}
        <div className="mb-8">
          <h3 className="text-2xl font-bold text-gray-700 mb-6 uppercase tracking-wide" style={{ fontFamily: 'Inter, sans-serif' }}>
            Resources
          </h3>

          <div className="space-y-4">
            {resourceCategories.map((category) => (
              <button
                key={category.title}
                onClick={() => navigate(category.path)}
                className="w-full bg-white rounded-xl p-6 text-left hover:shadow-md transition-all border border-gray-200 hover:border-teal-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-teal-100 rounded-lg flex items-center justify-center text-teal-600 flex-shrink-0">
                    {category.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xl font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {category.title}
                    </h4>
                    <p className="text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {category.description}
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-10 text-center text-white mt-16">
          <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
            Need Professional Support?
          </h2>
          <p className="text-lg mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
            Connect with qualified mental health professionals who can provide personalized guidance and support.
          </p>
          <button
            onClick={() => navigate('/choose-professional')}
            className="px-8 py-3 bg-white text-teal-600 rounded-lg font-semibold hover:shadow-lg transition-all"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Find a Therapist
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResourcesPage;
