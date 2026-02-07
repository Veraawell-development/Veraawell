import React, { useState } from 'react';
import { API_CONFIG } from '../config/api';
import logger from '../utils/logger';

interface PostSessionReportModalProps {
    isOpen: boolean;
    sessionId: string;
    patientId: string;
    patientName: string;
    sessionDate: string;
    sessionDuration: number;
    onSubmit: () => void;
    onCancel: () => void;
}

const PostSessionReportModal: React.FC<PostSessionReportModalProps> = ({
    isOpen,
    sessionId,
    patientId,
    patientName,
    sessionDate,
    sessionDuration,
    onSubmit,
    onCancel
}) => {
    const [formData, setFormData] = useState({
        reportType: '',
        mood: '',
        progress: 0,
        observations: [] as string[],
        summary: '',
        recommendations: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const summaryTemplates = {
        positive: "Patient demonstrated significant progress during today's session. Showed improved coping strategies and positive engagement. Continue current treatment approach.",
        stable: "Patient maintained stable condition. Discussed ongoing challenges. No major concerns noted. Continue monitoring progress.",
        needsSupport: "Patient experiencing increased difficulty. Discussed additional coping strategies and support options. Recommend follow-up soon.",
        assessment: "Initial assessment completed. Patient presented with concerns. Discussed treatment goals and developed preliminary plan."
    };

    const handleObservationToggle = (observation: string) => {
        setFormData(prev => ({
            ...prev,
            observations: prev.observations.includes(observation)
                ? prev.observations.filter(o => o !== observation)
                : [...prev.observations, observation]
        }));
    };

    const handleTemplateSelect = (template: string) => {
        setFormData(prev => ({ ...prev, summary: summaryTemplates[template as keyof typeof summaryTemplates] }));
    };

    const isValid = () => {
        return formData.reportType && formData.mood && formData.progress > 0;
    };

    const handleSubmit = async () => {
        if (!isValid()) {
            setError('Please fill all required fields');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            // Generate report content
            const content = `
Session Details:
- Date: ${new Date(sessionDate).toLocaleDateString()}
- Duration: ${sessionDuration} minutes
- Patient Mood: ${formData.mood}
- Progress Rating: ${formData.progress}/5

Key Observations:
${formData.observations.map(obs => `- ${obs}`).join('\n')}

Session Summary:
${formData.summary || 'No additional summary provided.'}

Recommendations:
${formData.recommendations || 'Continue current treatment plan.'}

---
Report generated from post-session assessment
`;

            const reportData = {
                sessionId,
                patientId,
                title: `${reportTypes.find(t => t.value === formData.reportType)?.label} - ${patientName} - ${new Date(sessionDate).toLocaleDateString()}`,
                reportType: formData.reportType,
                content: content.trim(),
                isSharedWithPatient: true
            };

            const response = await fetch(`${API_CONFIG.BASE_URL}/session-tools/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(reportData)
            });

            if (!response.ok) {
                throw new Error('Failed to create report');
            }

            logger.info('Post-session report created successfully');
            onSubmit();
        } catch (err) {
            logger.error('Error creating post-session report:', err);
            setError('Failed to submit report. Please try again.');
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md" style={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
                {/* Header */}
                <div className="border-b border-gray-200 px-6 py-4">
                    <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Session Report
                    </h2>
                    <p className="text-gray-500 text-sm mt-0.5" style={{ fontFamily: 'Inter, sans-serif' }}>
                        Complete to end session
                    </p>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Session Info */}
                    <div className="flex items-center justify-between text-sm text-gray-600 pb-4 border-b border-gray-100" style={{ fontFamily: 'Inter, sans-serif' }}>
                        <div>
                            <span className="font-medium text-gray-900">Patient:</span> {patientName}
                        </div>
                        <div className="text-right">
                            <span className="font-medium text-gray-900">{new Date(sessionDate).toLocaleDateString()}</span>
                            <span className="mx-2 text-gray-400">•</span>
                            <span>{sessionDuration} min</span>
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* 1. Session Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Session Type <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {reportTypes.map(type => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, reportType: type.value })}
                                    className={`px-3 py-2 rounded-lg border transition-all text-sm font-medium ${formData.reportType === type.value
                                        ? 'border-teal-600 bg-teal-600 text-white'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-white'
                                        }`}
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2. Patient's Mood */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Patient Mood <span className="text-red-500">*</span>
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                            {moods.map(mood => (
                                <button
                                    key={mood.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, mood: mood.value })}
                                    className={`px-3 py-3 rounded-lg border transition-all ${formData.mood === mood.value
                                        ? `${mood.borderColor} ${mood.bgColor} border-2`
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                        }`}
                                >
                                    <div className={`text-xs font-medium ${formData.mood === mood.value ? mood.color : 'text-gray-700'}`} style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {mood.label}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 3. Progress Rating */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Progress Rating <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, progress: star })}
                                    className="transition-all hover:scale-110 focus:outline-none"
                                >
                                    <svg className={`w-8 h-8 ${star <= formData.progress ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-200'}`} viewBox="0 0 20 20">
                                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                                    </svg>
                                </button>
                            ))}
                            <span className="ml-2 text-sm text-gray-600" style={{ fontFamily: 'Inter, sans-serif' }}>
                                {formData.progress > 0 ? `${formData.progress}/5` : 'Select rating'}
                            </span>
                        </div>
                    </div>

                    {/* 4. Key Observations */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Key Observations
                        </label>
                        <div className="space-y-1.5">
                            {observationOptions.map(observation => (
                                <label
                                    key={observation}
                                    className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={formData.observations.includes(observation)}
                                        onChange={() => handleObservationToggle(observation)}
                                        className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                                    />
                                    <span className="text-sm text-gray-700" style={{ fontFamily: 'Inter, sans-serif' }}>
                                        {observation}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 5. Session Summary */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Session Summary
                        </label>
                        <div className="mb-2">
                            <select
                                onChange={(e) => handleTemplateSelect(e.target.value)}
                                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-full"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                <option value="">Use template...</option>
                                <option value="positive">Positive Progress</option>
                                <option value="stable">Stable Condition</option>
                                <option value="needsSupport">Needs Support</option>
                                <option value="assessment">Initial Assessment</option>
                            </select>
                        </div>
                        <textarea
                            value={formData.summary}
                            onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                            rows={3}
                            maxLength={500}
                            placeholder="Session highlights, topics discussed, patient response..."
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <p className="text-xs text-gray-500 mt-1 text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {formData.summary.length}/500
                        </p>
                    </div>

                    {/* 6. Recommendations */}
                    <div>
                        <label className="block text-sm font-medium text-gray-900 mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                            Recommendations
                        </label>
                        <textarea
                            value={formData.recommendations}
                            onChange={(e) => setFormData({ ...formData, recommendations: e.target.value })}
                            rows={2}
                            maxLength={300}
                            placeholder="Next steps, follow-up plans..."
                            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-sm resize-none"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                        />
                        <p className="text-xs text-gray-500 mt-1 text-right" style={{ fontFamily: 'Inter, sans-serif' }}>
                            {formData.recommendations.length}/300
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white rounded-b-xl flex justify-end gap-3 border-t border-gray-200">
                    <button
                        onClick={onCancel}
                        disabled={submitting}
                        className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!isValid() || submitting}
                        className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                        {submitting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Submitting...
                            </>
                        ) : (
                            'Submit & End Session'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PostSessionReportModal;
