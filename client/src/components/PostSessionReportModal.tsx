import React, { useState } from 'react';
import { API_CONFIG } from '../config/api';
import { PDFDownloadLink } from '@react-pdf/renderer';
import HospitalReportTemplate from './HospitalReportTemplate';
import logger from '../utils/logger';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
    const [error, setError] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    
    const queryClient = useQueryClient();

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

    const submitReportMutation = useMutation({
        mutationFn: async (reportData: any) => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(reportData)
            });
            if (!response.ok) throw new Error('Failed to create report');
            return response.json();
        },
        onSuccess: () => {
            setIsSubmitted(true);
            logger.info('Post-session report created successfully');
            queryClient.invalidateQueries({ queryKey: ['doctor', 'reports'] });
            queryClient.invalidateQueries({ queryKey: ['doctor', 'stats'] });
        },
        onError: (err) => {
            logger.error('Error creating post-session report:', err);
            setError('Failed to submit report. Please try again.');
        }
    });

    const handleSubmit = () => {
        setError(null);

        const reportData = {
            sessionId,
            patientId,
            title: `${reportTypes.find(t => t.value === formData.reportType)?.label} - ${patientName} - ${new Date().toLocaleDateString()}`,
            reportType: formData.reportType,
            content: JSON.stringify(formData), // Save structured data
            isSharedWithPatient: true
        };

        submitReportMutation.mutate(reportData);
    };

    const submitting = submitReportMutation.isPending;

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
                    <div className="space-y-6 animate-fadeIn text-center py-4">
                        {isSubmitted ? (
                            <div className="space-y-6">
                                <div className="flex justify-center mb-4 relative">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-16 h-16 bg-green-50 rounded-full animate-ping opacity-60"></div>
                                    </div>
                                    <div className="relative w-12 h-12 bg-green-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <h3 className="text-[18px] font-bold text-gray-800 tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Report Finalized</h3>
                                    <p className="text-[13px] text-gray-500" style={{ fontFamily: 'Inter, sans-serif' }}>The session records have been updated successfully.</p>
                                </div>
                                <div className="pt-2">
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
                                        className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-[14px]"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                    >
                                        {({ loading }) => (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                {loading ? 'Preparing PDF...' : 'Download PDF Prescription'}
                                            </>
                                        )}
                                    </PDFDownloadLink>
                                </div>
                                <button
                                    onClick={onSubmit}
                                    className="w-full bg-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-700 font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    Done, Close Portal
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-center mb-4 relative">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-16 h-16 bg-teal-50 rounded-full animate-ping opacity-60"></div>
                                    </div>
                                    <div className="relative w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
                                        <svg className="w-5 h-5 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="mb-6">
                                    <h3 className="text-[18px] font-bold text-gray-800 tracking-tight mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>Ready to Submit?</h3>
                                    <p className="text-[13px] text-gray-500 max-w-[80%] mx-auto leading-relaxed" style={{ fontFamily: 'Inter, sans-serif' }}>Please review all data. Once submitted, an official hospital-style PDF will be generated.</p>
                                </div>
                                <div className="pt-2 flex flex-col gap-2">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-[14px]"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                    >
                                        {submitting ? (
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : 'Submit Report & Generate PDF'}
                                    </button>
                                    <button
                                        onClick={() => setStep(5)}
                                        className="w-full bg-transparent hover:bg-gray-50 text-gray-500 hover:text-gray-700 font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 text-[13px]"
                                        style={{ fontFamily: 'Inter, sans-serif' }}
                                    >
                                        Review Again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 5:
                return (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="bg-teal-50 p-4 rounded-xl border border-teal-100 mb-4">
                            <p className="text-teal-800 text-sm font-medium">Review Session Report</p>
                            <p className="text-teal-600 text-xs">Please review all information before submitting. This view is read-only.</p>
                        </div>

                        <div className="space-y-4 text-sm">
                            {/* Section 1: Assessment */}
                            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30 space-y-3">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Primary Assessment</h4>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="bg-white p-2 rounded-lg border border-gray-100">
                                        <p className="text-gray-400">Report Type</p>
                                        <p className="font-semibold text-gray-800 capitalize mt-0.5">
                                            {reportTypes.find(t => t.value === formData.reportType)?.label || formData.reportType}
                                        </p>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-gray-100">
                                        <p className="text-gray-400">Patient Presentation</p>
                                        <p className="font-semibold text-gray-800 capitalize mt-0.5">
                                            {moods.find(m => m.value === formData.mood)?.label || formData.mood}
                                        </p>
                                    </div>
                                    <div className="bg-white p-2 rounded-lg border border-gray-100">
                                        <p className="text-gray-400">Overall Progress</p>
                                        <div className="flex items-center gap-0.5 mt-0.5">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <svg 
                                                    key={star} 
                                                    className={`w-3.5 h-3.5 ${star <= formData.progress ? 'fill-amber-400' : 'fill-gray-200'}`} 
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                                </svg>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Clinical Indicators */}
                            {formData.observations.length > 0 && (
                                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30 space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Clinical Indicators</h4>
                                    <div className="flex flex-wrap gap-1.5">
                                        {formData.observations.map(obs => (
                                            <span key={obs} className="px-2.5 py-1 bg-teal-50 border border-teal-100 text-teal-700 text-xs font-medium rounded-full">
                                                {obs}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 3: Summary */}
                            {formData.summary && (
                                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30 space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detailed Summary</h4>
                                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-xs bg-white p-3 rounded-lg border border-gray-100">
                                        {formData.summary}
                                    </p>
                                </div>
                            )}

                            {/* Section 4: Diagnosis & Recommendations */}
                            {(formData.diagnosis || formData.recommendations) && (
                                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/30 space-y-3">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Treatment Plan</h4>
                                    {formData.diagnosis && (
                                        <div className="bg-white p-3 rounded-lg border border-gray-100">
                                            <p className="text-xs text-gray-400">Diagnosis / Focus Area</p>
                                            <p className="font-semibold text-gray-800 text-xs mt-0.5">{formData.diagnosis}</p>
                                        </div>
                                    )}
                                    {formData.recommendations && (
                                        <div className="bg-white p-3 rounded-lg border border-gray-100">
                                            <p className="text-xs text-gray-400 mb-1">Recommendations & Next Steps</p>
                                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed text-xs">
                                                {formData.recommendations}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-gray-500/20 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in">
            <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 transform transition-all duration-300 animate-in zoom-in-95 relative">
                {/* Progress Bar */}
                <div className="h-1 w-full bg-gray-50">
                    <div
                        className="h-full bg-teal-500 transition-all duration-500"
                        style={{ width: `${(Math.min(step, 4) / 4) * 100}%` }}
                    />
                </div>

                <div className="p-7 flex-1 overflow-y-auto">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-[18px] font-bold text-gray-800 tracking-tight" style={{ fontFamily: 'Inter, sans-serif' }}>
                                Clinical Session Report
                            </h2>
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
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
                    <div className="p-6 bg-white border-t border-gray-50 flex justify-between items-center">
                        <div>
                            {step > 1 && (
                                <button
                                    onClick={prevStep}
                                    className="px-4 py-2 text-gray-400 hover:text-gray-700 font-medium transition-colors text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    Back
                                </button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {step < 4 ? (
                                <button
                                    onClick={nextStep}
                                    className="px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-sm transition-colors text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    Continue
                                </button>
                            ) : step === 5 ? (
                                <button
                                    onClick={() => setStep(4)}
                                    className="px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-sm transition-colors text-[13px]"
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    Back to Submit
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
