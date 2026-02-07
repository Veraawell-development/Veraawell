import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface FAQItem {
    question: string;
    answer: string;
    category: string;
}

const FAQPage: React.FC = () => {
    const navigate = useNavigate();
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const faqs: FAQItem[] = [
        // General Questions
        {
            category: 'general',
            question: 'What is Veerawell?',
            answer: 'Veerawell is a comprehensive mental health platform that connects patients with qualified mental health professionals. We offer online therapy sessions, mental health assessments, journaling tools, and personalized care plans to support your mental wellness journey.'
        },
        {
            category: 'general',
            question: 'How does Veerawell work?',
            answer: 'Simply sign up as a patient, browse our verified therapists, book a session at your convenience, and connect via secure video calls. You can also take mental health assessments, maintain a journal, and track your progress over time.'
        },
        {
            category: 'general',
            question: 'Is my information confidential?',
            answer: 'Absolutely! We take your privacy seriously. All sessions are confidential, and your data is encrypted and stored securely. We comply with healthcare privacy standards to ensure your information is protected.'
        },

        // Booking & Sessions
        {
            category: 'booking',
            question: 'How do I book a session?',
            answer: 'Navigate to "Choose Professional" from your dashboard, browse available therapists, select one that fits your needs, choose a convenient time slot, and confirm your booking. You\'ll receive a confirmation with session details.'
        },
        {
            category: 'booking',
            question: 'Can I cancel or reschedule a session?',
            answer: 'Yes, you can cancel sessions up to 24 hours before the scheduled time for a full refund. To cancel, go to your dashboard, click on the session, and select "Cancel Session". For rescheduling, please cancel and book a new slot.'
        },
        {
            category: 'booking',
            question: 'What if I miss a session?',
            answer: 'If you miss a scheduled session without prior cancellation, it will be marked as a "no-show" and the payment will not be refunded. We recommend setting reminders and canceling at least 24 hours in advance if you cannot attend.'
        },
        {
            category: 'booking',
            question: 'How long are the sessions?',
            answer: 'Sessions are available in different durations: 20 minutes, 40 minutes, and 55 minutes. You can choose the duration that best fits your needs when booking. Pricing varies based on the session length and therapist.'
        },

        // Payments
        {
            category: 'payments',
            question: 'What payment methods do you accept?',
            answer: 'We accept all major credit/debit cards, UPI, net banking, and digital wallets. All payments are processed securely through our payment gateway.'
        },
        {
            category: 'payments',
            question: 'How much do sessions cost?',
            answer: 'Session costs vary by therapist and duration. Prices typically range from ₹500 to ₹2000 per session. You can view each therapist\'s pricing on their profile before booking.'
        },
        {
            category: 'payments',
            question: 'Do you offer refunds?',
            answer: 'Yes, full refunds are provided for sessions cancelled at least 24 hours in advance. Refunds are processed within 5-7 business days to your original payment method.'
        },

        // Technical
        {
            category: 'technical',
            question: 'What do I need for a video session?',
            answer: 'You need a device (computer, tablet, or smartphone) with a camera, microphone, and stable internet connection. We recommend using Chrome, Firefox, or Safari browsers for the best experience.'
        },
        {
            category: 'technical',
            question: 'What if I have technical issues during a session?',
            answer: 'If you experience technical difficulties, try refreshing your browser first. If issues persist, contact our support team immediately. We may reschedule the session at no additional cost if technical problems prevent completion.'
        },
        {
            category: 'technical',
            question: 'Can I use Veerawell on my mobile phone?',
            answer: 'Yes! Veerawell is fully responsive and works on all devices including smartphones and tablets. Simply access our website through your mobile browser.'
        },

        // Mental Health Assessments
        {
            category: 'assessments',
            question: 'What are mental health assessments?',
            answer: 'Our platform offers standardized screening tools like PHQ-9 (depression), GAD-7 (anxiety), ASRS (ADHD), and DLA-20 (disability assessment). These help you understand your mental health status and track progress over time.'
        },
        {
            category: 'assessments',
            question: 'Are the assessments a diagnosis?',
            answer: 'No, these assessments are screening tools, not clinical diagnoses. They provide insights into your mental health but should not replace professional evaluation. Always consult with a qualified therapist for proper diagnosis and treatment.'
        },
        {
            category: 'assessments',
            question: 'Can I retake assessments?',
            answer: 'Yes, you can retake assessments as many times as you like to track your progress. We recommend taking them periodically to monitor changes in your mental health over time.'
        },

        // For Therapists
        {
            category: 'therapists',
            question: 'How do I become a therapist on Veerawell?',
            answer: 'Sign up as a doctor, complete your professional profile with qualifications and experience, and submit for verification. Our team will review your credentials, and once approved, you can start accepting patients.'
        },
        {
            category: 'therapists',
            question: 'What qualifications do I need?',
            answer: 'You need to be a licensed mental health professional with valid credentials such as M.Phil, M.Sc in Clinical Psychology, Psychiatry degree, or equivalent qualifications. You must provide proof of your license and credentials during registration.'
        },
        {
            category: 'therapists',
            question: 'How do I manage my availability?',
            answer: 'Use the "Manage Calendar" feature in your dashboard to set your available time slots, block dates when you\'re unavailable, and manage your schedule. Patients can only book during your available slots.'
        }
    ];

    const categories = [
        { id: 'all', label: 'All Questions' },
        { id: 'general', label: 'General' },
        { id: 'booking', label: 'Booking & Sessions' },
        { id: 'payments', label: 'Payments' },
        { id: 'technical', label: 'Technical' },
        { id: 'assessments', label: 'Assessments' },
        { id: 'therapists', label: 'For Therapists' }
    ];

    const filteredFAQs = selectedCategory === 'all'
        ? faqs
        : faqs.filter(faq => faq.category === selectedCategory);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 py-20 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Frequently Asked Questions
                    </h1>
                    <p className="text-xl text-white/90 max-w-2xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Find answers to common questions about our platform and services
                    </p>
                </div>
            </div>

            {/* Category Filter */}
            <div className="max-w-6xl mx-auto px-4 -mt-8">
                <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                    <div className="flex flex-wrap gap-3 justify-center">
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                onClick={() => setSelectedCategory(category.id)}
                                className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${selectedCategory === category.id
                                        ? 'bg-teal-600 text-white shadow-md'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* FAQ Accordion */}
                <div className="max-w-4xl mx-auto space-y-3 pb-16">
                    {filteredFAQs.map((faq, index) => (
                        <div
                            key={index}
                            className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all border border-gray-200"
                        >
                            <button
                                onClick={() => toggleFAQ(index)}
                                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors rounded-lg"
                            >
                                <h3 className="text-lg font-semibold text-gray-900 pr-4" style={{ fontFamily: 'Inter, sans-serif' }}>
                                    {faq.question}
                                </h3>
                                <div className={`flex-shrink-0 transform transition-transform duration-200 ${openIndex === index ? 'rotate-180' : ''
                                    }`}>
                                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </button>

                            <div className={`overflow-hidden transition-all duration-300 ${openIndex === index ? 'max-h-96' : 'max-h-0'
                                }`}>
                                <div className="px-6 pb-5 pt-0">
                                    <p className="text-gray-600 leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {faq.answer}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Contact Section */}
                <div className="max-w-4xl mx-auto mb-16">
                    <div className="bg-white rounded-xl shadow-lg p-10 text-center border border-gray-200">
                        <h2 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Bree Serif, serif' }}>
                            Still Have Questions?
                        </h2>
                        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Can't find what you're looking for? Our support team is here to help you.
                        </p>
                        <div className="flex flex-wrap gap-4 justify-center">
                            <button
                                onClick={() => navigate('/contact')}
                                className="px-8 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-all shadow-md hover:shadow-lg"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Contact Support
                            </button>
                            <button
                                onClick={() => navigate('/choose-professional')}
                                className="px-8 py-3 bg-white text-teal-600 border-2 border-teal-600 rounded-lg font-semibold hover:bg-teal-50 transition-all"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                Book a Session
                            </button>
                        </div>
                    </div>
                </div>

                {/* Quick Links */}
                <div className="max-w-4xl mx-auto mb-16">
                    <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center" style={{ fontFamily: 'Bree Serif, serif' }}>
                        Explore More
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <button
                            onClick={() => navigate('/about')}
                            className="bg-white rounded-lg p-6 text-center hover:shadow-lg transition-all border border-gray-200 hover:border-teal-300"
                        >
                            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2 text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                About Us
                            </h4>
                            <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Learn more about our mission
                            </p>
                        </button>

                        <button
                            onClick={() => navigate('/services')}
                            className="bg-white rounded-lg p-6 text-center hover:shadow-lg transition-all border border-gray-200 hover:border-teal-300"
                        >
                            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2 text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Our Services
                            </h4>
                            <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Explore what we offer
                            </p>
                        </button>

                        <button
                            onClick={() => navigate('/resources')}
                            className="bg-white rounded-lg p-6 text-center hover:shadow-lg transition-all border border-gray-200 hover:border-teal-300"
                        >
                            <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                </svg>
                            </div>
                            <h4 className="text-lg font-semibold mb-2 text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Resources
                            </h4>
                            <p className="text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Mental health resources
                            </p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FAQPage;
