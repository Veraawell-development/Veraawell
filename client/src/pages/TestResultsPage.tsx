import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { MENTAL_HEALTH_TESTS, maxScoreFor } from '../data/mentalHealthTests';
import { API_CONFIG } from '../config/api';
import { FiArrowLeft, FiRefreshCw, FiList, FiAlertCircle, FiCloudOff } from 'react-icons/fi';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CrisisSupportCard from '../components/CrisisSupportCard';
import { crisisReason } from '../utils/crisisSupport';
import { severityLabel, severityStyle } from '../utils/severityStyle';
import { formatPlatformDate } from '../utils/dateUtils';

const FONT = { fontFamily: 'Inter, sans-serif' };

type Answer = { questionId: number; answer: number };

/** A load that failed, told apart from "not found" so the page can say which. */
class ResultNotFound extends Error {}

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen pt-[64px] md:pt-[80px] bg-[#FAFAFA] font-sans flex flex-col pb-12 box-border">
        <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8 md:py-10">{children}</div>
    </div>
);

const TestResultsPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const isPreview = id === 'preview';

    const { data: fetchedAssessment = null, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['assessment', id],
        queryFn: async () => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments/${id}`, {
                credentials: 'include'
            });
            if (response.status === 404) throw new ResultNotFound('Not found');
            if (!response.ok) throw new Error('Failed to fetch assessment');
            const data = await response.json();
            return data.assessment;
        },
        enabled: !!id && !isPreview,
        retry: (count, err) => !(err instanceof ResultNotFound) && count < 2
    });

    // A result shown because saving failed (MentalHealthTestPage navigates
    // here with the answers in router state). Only exists for this visit: a
    // reload of /test-results/preview has no state and says so below.
    const state = location.state as { testType?: string; responses?: Answer[]; scores?: any } | null;
    const previewAssessment = isPreview && state?.testType ? {
        testType: state.testType,
        responses: state.responses,
        scores: state.scores,
        completedAt: new Date(),
    } : null;

    // "Try saving again" for a preview: the same POST the test page makes.
    const saveAgain = useMutation({
        mutationFn: async () => {
            const response = await fetch(`${API_CONFIG.BASE_URL}/assessments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ testType: state?.testType, responses: state?.responses, scores: state?.scores })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || 'Still could not save. Please try again in a moment.');
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['patient', 'assessments'] });
            if (data?.assessment?._id) navigate(`/test-results/${data.assessment._id}`, { replace: true });
        }
    });

    const assessment = previewAssessment || fetchedAssessment;

    if (!isPreview && isLoading) {
        return (
            <div className="min-h-screen pt-[64px] md:pt-[80px] flex items-center justify-center bg-[#FAFAFA] box-border">
                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto" role="status" aria-label="Loading result"></div>
            </div>
        );
    }

    if (!assessment) {
        // Failed to load, not found, or a preview opened without its answers.
        // Said plainly, with a way on — this used to be a silent redirect to
        // the dashboard (and an endless spinner for a reloaded preview).
        const notFound = error instanceof ResultNotFound;
        const title = isPreview
            ? 'This unsaved result is no longer available'
            : notFound ? 'We couldn\'t find this result' : 'We couldn\'t load this result';
        const body = isPreview
            ? 'An unsaved result only lasts until the page is reloaded. You can take the test again — it only takes a few minutes.'
            : notFound ? 'It may have been deleted. Your other results are in your history.' : 'Please check your connection and try again.';
        return (
            <Shell>
                <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-10 text-center" role="alert">
                    <FiAlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-4" aria-hidden="true" />
                    <h1 className="text-[20px] font-bold text-gray-800 mb-2" style={FONT}>{title}</h1>
                    <p className="text-[14px] text-gray-500 mb-6" style={FONT}>{body}</p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {!isPreview && !notFound && (
                            <button
                                onClick={() => refetch()}
                                disabled={isFetching}
                                className="px-5 py-2.5 rounded-[12px] bg-teal-600 hover:bg-teal-700 text-white text-[14px] font-semibold disabled:opacity-60"
                                style={FONT}
                            >
                                {isFetching ? 'Trying…' : 'Try again'}
                            </button>
                        )}
                        <button
                            onClick={() => navigate(isPreview ? '/mental-health' : '/my-tests')}
                            className="px-5 py-2.5 rounded-[12px] bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-[14px] font-semibold"
                            style={FONT}
                        >
                            {isPreview ? 'Back to assessments' : 'View history'}
                        </button>
                    </div>
                </div>
            </Shell>
        );
    }

    const test = MENTAL_HEALTH_TESTS[assessment.testType];
    const responses: Answer[] = Array.isArray(assessment.responses) ? assessment.responses : [];
    const { total, severity, percentage } = assessment.scores || { total: 0, severity: 'minimal', percentage: 0 };
    const safeSeverity = severity || 'minimal';
    const style = severityStyle(safeSeverity);
    const maxScore = maxScoreFor(assessment.testType, responses) || null;
    const crisis = crisisReason(assessment.testType, safeSeverity, responses);
    // PTSD: "no" to Q1 skips the questions about how the patient feels now.
    const ptsdSymptomsSkipped = assessment.testType === 'ptsd' && responses.some((r) => r.questionId === 1 && r.answer === 0);
    const interpretationText = typeof assessment.interpretation === 'string'
        ? assessment.interpretation
        : assessment.interpretation?.description || 'Based on your responses, your symptoms fall into this category. Please review with your healthcare provider.';

    return (
        <Shell>
            {/* Header Information */}
            <div className="mb-10 relative">
                <button
                    onClick={() => navigate('/mental-health')}
                    className="flex items-center gap-2 text-[13px] font-semibold text-gray-500 hover:text-gray-900 transition-colors mb-5 group"
                    style={FONT}
                >
                    <FiArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
                    Back to Assessments
                </button>

                <h1 className="text-[32px] md:text-[36px] font-extrabold text-gray-800 tracking-tight leading-tight mb-2" style={FONT}>
                    {test?.name || assessment.testType}
                </h1>
                <p className="text-[15px] text-gray-500 font-medium mb-4" style={FONT}>
                    {test?.fullName || ''}
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-md border border-gray-200/50">
                    <span className="text-[12px] font-medium text-gray-500" style={FONT}>
                        Completed on {formatPlatformDate(assessment.completedAt, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                </div>
            </div>

            {isPreview && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 mb-8 rounded-[16px] border border-amber-200 bg-amber-50" role="status">
                    <FiCloudOff className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                        <p className="text-[14px] font-bold text-amber-900" style={FONT}>Not saved</p>
                        <p className="text-[13px] text-amber-800" style={FONT}>
                            {saveAgain.error ? (saveAgain.error as Error).message : 'We couldn\'t reach our server, so this result is only on this screen and won\'t be in your history.'}
                        </p>
                    </div>
                    <button
                        onClick={() => saveAgain.mutate()}
                        disabled={saveAgain.isPending}
                        className="px-4 py-2 rounded-[10px] bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-semibold disabled:opacity-60"
                        style={FONT}
                    >
                        {saveAgain.isPending ? 'Saving…' : 'Try saving again'}
                    </button>
                </div>
            )}

            {crisis && <CrisisSupportCard reason={crisis} />}

            {/* Score Card */}
            <div className="bg-white rounded-[24px] border border-gray-200 shadow-sm p-8 md:p-10 mb-8">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div>
                        <p className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-2" style={FONT}>Total Score</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-[64px] leading-none font-black tracking-tighter text-gray-800" style={FONT}>
                                {total}
                            </span>
                            {maxScore && (
                                <span className="text-[20px] font-bold text-gray-300" style={FONT}>
                                    / {maxScore}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        <span
                            className="inline-flex px-4 py-1.5 rounded-full text-[14px] font-bold tracking-wide"
                            style={{ backgroundColor: style.bg, color: style.text, ...FONT }}
                        >
                            {severityLabel(safeSeverity)}
                        </span>
                    </div>
                </div>

                {/* Minimal Progress Line */}
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mb-12">
                    <div
                        className="h-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, percentage || 0))}%`, backgroundColor: style.bar }}
                    />
                </div>

                {/* Interpretation */}
                <div className="prose prose-sm max-w-none">
                    <h3 className="text-[16px] font-bold text-gray-800 mb-3" style={FONT}>What this means</h3>
                    <p className="text-[15px] text-gray-600 leading-relaxed" style={FONT}>
                        {interpretationText}
                    </p>
                    {ptsdSymptomsSkipped && (
                        <p className="text-[14px] text-gray-500 leading-relaxed mt-3" style={FONT}>
                            You chose not to answer the questions about how you have been feeling recently, so this result only reflects past experiences.
                        </p>
                    )}
                </div>
            </div>

            {/* Disclaimer Context */}
            <div className="flex items-start gap-3 p-5 bg-gray-50 rounded-[16px] border border-gray-200 mb-10">
                <FiAlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[13px] text-gray-500 leading-relaxed font-medium" style={FONT}>
                    This screening tool is not a diagnosis. Your results are private: only you can see them. You are encouraged to talk them through with your therapist or doctor. Veraawell is not a substitute for professional medical advice, diagnosis, or treatment.
                </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-200/60">
                <button
                    onClick={() => navigate(`/mental-health/${assessment.testType}`)}
                    className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
                    style={FONT}
                >
                    <FiRefreshCw className="w-4 h-4" aria-hidden="true" />
                    Retake Assessment
                </button>
                <button
                    onClick={() => navigate('/my-tests')}
                    className="flex-1 py-3 px-4 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 text-[14px] font-semibold rounded-[12px] transition-colors flex items-center justify-center gap-2"
                    style={FONT}
                >
                    <FiList className="w-4 h-4" aria-hidden="true" />
                    View History
                </button>
            </div>
        </Shell>
    );
};

export default TestResultsPage;
