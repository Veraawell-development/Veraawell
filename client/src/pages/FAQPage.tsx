import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LeafDecor from '../components/ui/LeafDecor';
import { Layers, Info, Calendar, CreditCard, Monitor, FileText, User as UserIcon } from 'lucide-react';

interface FAQItem {
    question: string;
    answer: string;
    category: string;
}

const FAQPage: React.FC = () => {
    const navigate = useNavigate();
    const [openIndex, setOpenIndex] = useState<number | null>(0);
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
        {
            category: 'payments',
            question: 'Is my payment information secure?',
            answer: 'Payments are securely processed through Razorpay. Veraawell does not store users\' debit card, credit card, UPI, net banking, or other payment credentials. Payment information is handled by our payment gateway partner in accordance with applicable security standards.'
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
        { id: 'all', label: 'All Questions', icon: <Layers size={18} /> },
        { id: 'general', label: 'General', icon: <Info size={18} /> },
        { id: 'booking', label: 'Booking & Sessions', icon: <Calendar size={18} /> },
        { id: 'payments', label: 'Payments', icon: <CreditCard size={18} /> },
        { id: 'technical', label: 'Technical', icon: <Monitor size={18} /> },
        { id: 'assessments', label: 'Assessments', icon: <FileText size={18} /> },
        { id: 'therapists', label: 'For Therapists', icon: <UserIcon size={18} /> }
    ];

    const filteredFAQs = selectedCategory === 'all'
        ? faqs
        : faqs.filter(faq => faq.category === selectedCategory);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="min-h-screen pt-[80px] bg-[var(--bg-2)] relative overflow-hidden flex flex-col">
            {/* Background Ornaments */}
            <LeafDecor 
                style={{ 
                    position: 'absolute', 
                    top: '-5%', 
                    right: '-5%', 
                    width: '500px', 
                    height: '500px', 
                    opacity: 0.25, 
                    transform: 'rotate(15deg) scaleX(-1)', 
                    zIndex: 0 
                }} 
            />
            <div 
                className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none z-0" 
                style={{ background: 'radial-gradient(circle, rgba(0, 151, 178, 0.12), transparent 70%)' }} 
            />

            {/* Hero Section */}
            <div className="relative z-10 pt-16 pb-12 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-normal mb-4 tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                        Frequently Asked Questions
                    </h1>
                    <p className="text-[17px] max-w-2xl mx-auto" style={{ color: 'var(--text-2)' }}>
                        Everything you need to know about Veerawell, all in one place.
                    </p>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="relative z-20 max-w-6xl mx-auto px-4 w-full mb-20 flex flex-col md:flex-row gap-8 lg:gap-12">
                
                {/* Left Sidebar - Categories */}
                <div className="w-full md:w-64 lg:w-72 shrink-0">
                    <div className="sticky top-[100px] flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-4 md:pb-0 scrollbar-hide">
                        {categories.map((category) => {
                            const isActive = selectedCategory === category.id;
                            return (
                                <button
                                    key={category.id}
                                    onClick={() => { setSelectedCategory(category.id); setOpenIndex(0); }}
                                    className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl font-semibold text-[14px] transition-all duration-300 shrink-0 md:shrink border border-transparent ${
                                        isActive 
                                        ? 'shadow-md scale-[1.02]' 
                                        : 'opacity-70 hover:opacity-100 hover:bg-white/40'
                                    }`}
                                    style={{ 
                                        color: isActive ? '#fff' : 'var(--text)',
                                        background: isActive ? 'var(--teal)' : 'transparent',
                                        borderColor: isActive ? 'transparent' : 'rgba(255,255,255,0.4)'
                                    }}
                                >
                                    <span style={{ color: isActive ? '#fff' : 'var(--teal)' }}>
                                        {category.icon}
                                    </span>
                                    {category.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right Area - FAQ Accordion */}
                <div className="flex-1 space-y-3 pb-10">
                    {filteredFAQs.map((faq, index) => {
                        const isOpen = openIndex === index;
                        return (
                            <div
                                key={index}
                                className="rounded-2xl transition-all duration-300 overflow-hidden group"
                                style={{ 
                                    background: isOpen ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', 
                                    border: '1px solid rgba(255,255,255,0.8)', 
                                    backdropFilter: 'blur(12px)',
                                    boxShadow: isOpen ? '0 12px 40px rgba(0,151,178,0.08)' : '0 2px 10px rgba(0,0,0,0.02)'
                                }}
                            >
                                <button
                                    onClick={() => toggleFAQ(index)}
                                    className="w-full px-6 py-4 flex items-center justify-between text-left transition-colors"
                                >
                                    <h3 className="text-[16px] font-semibold pr-4 leading-snug" style={{ color: isOpen ? 'var(--teal-dark)' : 'var(--text)' }}>
                                        {faq.question}
                                    </h3>
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transform transition-all duration-300 ${isOpen ? 'rotate-180 bg-teal-50' : 'bg-white group-hover:bg-teal-50/50 shadow-sm'}`}>
                                        <svg className="w-4 h-4" style={{ color: isOpen ? 'var(--teal)' : 'var(--text-3)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </button>

                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="px-6 pb-6 pt-1">
                                        <div className="w-10 h-1 bg-teal-100 rounded-full mb-4"></div>
                                        <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
                                            {faq.answer}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Sections */}
            <div className="relative z-10 bg-white/70 border-t border-white backdrop-blur-xl pt-16 pb-20">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center max-w-5xl mx-auto">
                        
                        {/* Contact Section */}
                        <div className="rounded-3xl p-10 text-center lg:text-left transition-all duration-300"
                            style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,1)', boxShadow: '0 8px 32px rgba(0,151,178,0.05)' }}
                        >
                            <h2 className="text-3xl font-semibold mb-3 tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
                                Still Have Questions?
                            </h2>
                            <p className="text-[15px] mb-8" style={{ color: 'var(--text-2)' }}>
                                Can't find what you're looking for? Our support team is here to help you.
                            </p>
                            <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                                <button
                                    onClick={() => navigate('/contact')}
                                    className="px-8 py-3 text-white rounded-full font-bold transition-all shadow-md hover:-translate-y-1"
                                    style={{ background: 'var(--teal)', boxShadow: '0 8px 20px rgba(0,151,178,0.2)', fontSize: '14px' }}
                                >
                                    Contact Support
                                </button>
                                <button
                                    onClick={() => navigate('/choose-professional')}
                                    className="px-8 py-3 rounded-full font-bold transition-all hover:-translate-y-1"
                                    style={{ background: 'rgba(0,151,178,0.05)', color: 'var(--teal)', border: '1px solid rgba(0,151,178,0.2)', fontSize: '14px' }}
                                >
                                    Book a Session
                                </button>
                            </div>
                        </div>

                        {/* Quick Links Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                { title: 'About Us', desc: 'Our mission', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', path: '/about' },
                                { title: 'Our Services', desc: 'What we offer', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', path: '/services' },
                                { title: 'Resources', desc: 'Mental health tools', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', path: '/resources' }
                            ].map((link, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => navigate(link.path)}
                                    className="group bg-white/70 rounded-2xl p-6 text-left transition-all duration-300 hover:bg-white hover:shadow-lg hover:-translate-y-1 relative overflow-hidden"
                                    style={{ border: '1px solid rgba(255,255,255,0.9)' }}
                                >
                                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500"
                                        style={{ background: 'radial-gradient(circle, rgba(107,168,136,0.15) 0%, transparent 70%)' }}
                                    />
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4 transition-colors bg-teal-50 group-hover:bg-teal-100">
                                        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={link.icon} />
                                        </svg>
                                    </div>
                                    <h4 className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text)' }}>
                                        {link.title}
                                    </h4>
                                    <p className="text-[13px]" style={{ color: 'var(--text-2)' }}>
                                        {link.desc}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FAQPage;
