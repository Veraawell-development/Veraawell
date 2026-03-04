import React, { useState } from 'react';
import { API_CONFIG } from '../config/api';
import { PDFDownloadLink } from '@react-pdf/renderer';
import HospitalReportTemplate from './HospitalReportTemplate';
import logger from '../utils/logger';

interface PostSessionReportModalProps {
    isOpen: boolean;
    sessionId: string;
    patientId: string;
    patientName: string;
    doctorName: string;
    sessionDuration: number;
    onSubmit: () => void;
    onCancel: () => void;
}

const PostSessionReportModal: React.FC<PostSessionReportModalProps> = ({
    isOpen,
    sessionId,
    patientId,
    patientName,
    doctorName,
    sessionDuration,
    onSubmit,
    onCancel
}) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        reportType: 'progress',
        mood: '',
        progress: 0,
        observations: [] as string[],
        summary: '',
        recommendations: '',
        diagnosis: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const reportTypes = [
        { value: 'assessment', label: 'Assessment' },
        { value: 'progress', label: 'Progress' },
        { value: 'treatment-plan', label: 'Treatment Plan' },
        { value: 'diagnosis', label: 'Diagnosis' },
        { value: 'other', label: 'Follow-up' }
    ];

    const moods = [
        { value: 'positive', label: 'Positive', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-500' },
        { value: 'neutral', label: 'Neutral', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-500' },
        { value: 'low', label: 'Low', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-500' },
        { value: 'anxious', label: 'Anxious', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-500' },
        { value: 'agitated', label: 'Agitated', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-500' }
    ];

    const observationOptions = [
        'Good engagement',
        'Showing improvement',
        'Needs additional support',
        'Medication adjustment needed',
        'Follow-up recommended',
        'Crisis intervention needed',
        'Referral suggested'
    ];

    const handleObservationToggle = (observation: string) => {
        setFormData(prev => ({
            ...prev,
            observations: prev.observations.includes(observation)
                ? prev.observations.filter(o => o !== observation)
                : [...prev.observations, observation]
        }));
    };

    const nextStep = () => {
        if (step === 1 && (!formData.reportType || !formData.mood || formData.progress === 0)) {
            setError('Please complete all fields in this step');
            return;
        }
        setError(null);
        setStep(prev => prev + 1);
    };

    const prevStep = () => setStep(prev => prev - 1);

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            const reportData = {
                sessionId,
                patientId,
                title: `${reportTypes.find(t => t.value === formData.reportType)?.label} - ${patientName} - ${new Date().toLocaleDateString()}`,
                reportType: formData.reportType,
                content: JSON.stringify(formData), // Save structured data
                isSharedWithPatient: true
            };

            const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(reportData)
            });

            if (!response.ok) throw new Error('Failed to create report');

            setIsSubmitted(true);
            logger.info('Post-session report created successfully');
        } catch (err) {
            logger.error('Error creating post-session report:', err);
            setError('Failed to submit report. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-6">
                            <p className="text-teal-800 text-sm font-medium">Step 1: Primary Assessment</p>
                            <p className="text-teal-600 text-xs">Define the report type and patient's current state.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Session Context</label>
                            <div className="grid grid-cols-2 gap-2">
                                {reportTypes.map(type => (
                                    <button
                                        key={type.value}
                                        onClick={() => setFormData({ ...formData, reportType: type.value })}
                                        className={`px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left flex items-center justify-between ${formData.reportType === type.value
                                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                                            : 'border-gray-100 hover:border-gray-200 text-gray-500 bg-gray-50/50'
                                            }`}
                                    >
                                        {type.label}
                                        {formData.reportType === type.value && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Patient Presentation</label>
                            <div className="grid grid-cols-5 gap-2">
                                {moods.map(mood => (
                                    <button
                                        key={mood.value}
                                        onClick={() => setFormData({ ...formData, mood: mood.value })}
                                        className={`p-3 rounded-xl border-2 transition-all text-center ${formData.mood === mood.value
                                            ? `${mood.borderColor} ${mood.bgColor}`
                                            : 'border-gray-50 hover:border-gray-100 bg-gray-50/30'
                                            }`}
                                    >
                                        <div className={`text-[10px] font-bold uppercase tracking-tighter ${formData.mood === mood.value ? mood.color : 'text-gray-400'}`}>
                                            {mood.label}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Overall Progress (1-5)</label>
                            <div className="flex items-center gap-3">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        onClick={() => setFormData({ ...formData, progress: star })}
                                        className="transition-transform hover:scale-125 focus:outline-none"
                                    >
                                        <svg className={`w-10 h-10 ${star <= formData.progress ? 'fill-amber-400' : 'fill-gray-100'}`} viewBox="0 0 20 20">
                                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-6">
                            <p className="text-teal-800 text-sm font-medium">Step 2: Observations & Summary</p>
                            <p className="text-teal-600 text-xs">Record your clinical observations and a brief summary.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Clinical Indicators</label>
                            <div className="flex flex-wrap gap-2">
                                {observationOptions.map(observation => (
                                    <button
                                        key={observation}
                                        onClick={() => handleObservationToggle(observation)}
                                        className={`px-4 py-2 rounded-full border text-xs font-medium transition-all ${formData.observations.includes(observation)
                                            ? 'bg-teal-600 border-teal-600 text-white shadow-md'
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-teal-300'
                                            }`}
                                    >
                                        {observation}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Detailed Summary</label>
                            <textarea
                                value={formData.summary}
                                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                                rows={6}
                                placeholder="Write your clinical summary here..."
                                className="w-full px-4 py-3 border-2 border-gray-50 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50/50 text-sm"
                            />
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-6">
                            <p className="text-teal-800 text-sm font-medium">Step 3: Treatment Plan</p>
                            <p className="text-teal-600 text-xs">Define diagnosis and provide actionable recommendations.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Primary Diagnosis / Focus Area</label>
                            <input
                                value={formData.diagnosis}
                                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                                placeholder="e.g. Generalized Anxiety Disorder"
                                className="w-full px-4 py-3 border-2 border-gray-50 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50/50 text-sm font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-800 mb-3">Recommendations & Next Steps</label>
                            <textarea
                                value={formData.recommendations}
                                onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                                rows={6}
                                placeholder="Actionable steps for the patient..."
                                className="w-full px-4 py-3 border-2 border-gray-50 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-gray-50/50 text-sm"
                            />
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-6 animate-fadeIn text-center py-8">
                        {isSubmitted ? (
                            <div className="space-y-6">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                    <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">Report Finalized</h3>
                                    <p className="text-gray-500 mt-2">The session records have been updated successfully.</p>
                                </div>
                                <div className="pt-6">
                                    <PDFDownloadLink
                                        document={
                                            <HospitalReportTemplate
                                                data={{
                                                    ...formData,
                                                    patientName,
                                                    doctorName,
                                                    date: new Date().toLocaleDateString(),
                                                    duration: sessionDuration.toString(),
                                                    sessionId
                                                }}
                                            />
                                        }
                                        fileName={`Report_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`}
                                        className="inline-flex items-center gap-2 px-8 py-4 bg-teal-600 text-white rounded-2xl font-bold shadow-lg hover:bg-teal-700 transition-all hover:-translate-y-1"
                                    >
                                        {({ loading }) => (
                                            <>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                {loading ? 'Preparing PDF...' : 'Download PDF Prescription'}
                                            </>
                                        )}
                                    </PDFDownloadLink>
                                </div>
                                <button
                                    onClick={onSubmit}
                                    className="text-gray-400 font-medium hover:text-gray-600 transition-colors text-sm"
                                >
                                    Done, Close Portal
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto">
                                    <svg className="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Ready to Submit?</h3>
                                    <p className="text-gray-500">Please review all data. Once submitted, an official hospital-style PDF will be generated.</p>
                                </div>
                                <div className="pt-4 space-y-3">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold shadow-lg hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : 'Submit Report & Generate PDF'}
                                    </button>
                                    <button
                                        onClick={prevStep}
                                        className="w-full py-3 text-gray-500 font-medium hover:bg-gray-50 rounded-xl transition-all"
                                    >
                                        Review Again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xl">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Progress Bar */}
                <div className="h-1.5 w-full bg-gray-100">
                    <div
                        className="h-full bg-teal-500 transition-all duration-500"
                        style={{ width: `${(step / 4) * 100}%` }}
                    />
                </div>

                <div className="p-8 flex-1 overflow-y-auto">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Clinical Session Report
                            </h2>
                            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mt-1">
                                Session ID: {sessionId.substring(0, 8)} • Patient: {patientName}
                            </p>
                        </div>
                        {!isSubmitted && (
                            <button onClick={onCancel} className="text-gray-300 hover:text-red-500 transition-colors">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        )}
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {error}
                        </div>
                    )}

                    {renderStep()}
                </div>

                {/* Footer Actions */}
                {!isSubmitted && (
                    <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
                        <div>
                            {step > 1 && (
                                <button
                                    onClick={prevStep}
                                    className="px-6 py-2 text-gray-400 hover:text-gray-900 font-bold transition-colors"
                                >
                                    Back
                                </button>
                            )}
                        </div>
                        <div className="flex gap-3">
                            {step < 4 ? (
                                <button
                                    onClick={nextStep}
                                    className="px-10 py-3 bg-gray-900 text-white rounded-2xl font-bold shadow-xl hover:bg-gray-800 transition-all hover:-translate-y-0.5"
                                >
                                    Continue
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PostSessionReportModal;
