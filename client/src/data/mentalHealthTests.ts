// Mental Health Test Definitions
// Industry-standard screening tools

export interface TestQuestion {
    id: number;
    text: string;
    category?: string;
}

export interface TestDefinition {
    id: string;
    name: string;
    fullName: string;
    description: string;
    questionCount: number;
    estimatedTime: string;
    questions: TestQuestion[];
    answerOptions: { label: string; value: number }[];
    scoring: {
        maxScore: number;
        severityLevels: {
            minimal: { max: number };
            mild: { min: number; max: number };
            moderate: { min: number; max: number };
            'moderately-severe'?: { min: number; max: number };
            severe: { min: number };
        };
    };
}

// PHQ-9: Patient Health Questionnaire for Depression
export const PHQ9_TEST: TestDefinition = {
    id: 'depression',
    name: 'PHQ-9',
    fullName: 'Patient Health Questionnaire-9',
    description: 'A brief screening tool to assess depression severity',
    questionCount: 9,
    estimatedTime: '2-3 minutes',
    questions: [
        { id: 1, text: 'Little interest or pleasure in doing things' },
        { id: 2, text: 'Feeling down, depressed, or hopeless' },
        { id: 3, text: 'Trouble falling or staying asleep, or sleeping too much' },
        { id: 4, text: 'Feeling tired or having little energy' },
        { id: 5, text: 'Poor appetite or overeating' },
        { id: 6, text: 'Feeling bad about yourself - or that you are a failure or have let yourself or your family down' },
        { id: 7, text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
        { id: 8, text: 'Moving or speaking so slowly that other people could have noticed. Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual' },
        { id: 9, text: 'Thoughts that you would be better off dead, or of hurting yourself in some way' }
    ],
    answerOptions: [
        { label: 'Not at all', value: 0 },
        { label: 'Several days', value: 1 },
        { label: 'More than half the days', value: 2 },
        { label: 'Nearly every day', value: 3 }
    ],
    scoring: {
        maxScore: 27,
        severityLevels: {
            minimal: { max: 4 },
            mild: { min: 5, max: 9 },
            moderate: { min: 10, max: 14 },
            'moderately-severe': { min: 15, max: 19 },
            severe: { min: 20 }
        }
    }
};

// GAD-7: Generalized Anxiety Disorder Scale
export const GAD7_TEST: TestDefinition = {
    id: 'anxiety',
    name: 'GAD-7',
    fullName: 'Generalized Anxiety Disorder-7',
    description: 'A screening tool to assess anxiety symptoms',
    questionCount: 7,
    estimatedTime: '2 minutes',
    questions: [
        { id: 1, text: 'Feeling nervous, anxious, or on edge' },
        { id: 2, text: 'Not being able to stop or control worrying' },
        { id: 3, text: 'Worrying too much about different things' },
        { id: 4, text: 'Trouble relaxing' },
        { id: 5, text: 'Being so restless that it is hard to sit still' },
        { id: 6, text: 'Becoming easily annoyed or irritable' },
        { id: 7, text: 'Feeling afraid, as if something awful might happen' }
    ],
    answerOptions: [
        { label: 'Not at all', value: 0 },
        { label: 'Several days', value: 1 },
        { label: 'More than half the days', value: 2 },
        { label: 'Nearly every day', value: 3 }
    ],
    scoring: {
        maxScore: 21,
        severityLevels: {
            minimal: { max: 4 },
            mild: { min: 5, max: 9 },
            moderate: { min: 10, max: 14 },
            severe: { min: 15 }
        }
    }
};

// ASRS: Adult ADHD Self-Report Scale (Screener - Part A)
export const ASRS_TEST: TestDefinition = {
    id: 'adhd',
    name: 'ASRS',
    fullName: 'Adult ADHD Self-Report Scale',
    description: 'A screening tool for adult ADHD symptoms',
    questionCount: 18,
    estimatedTime: '3-4 minutes',
    questions: [
        { id: 1, text: 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?' },
        { id: 2, text: 'How often do you have difficulty getting things in order when you have to do a task that requires organization?' },
        { id: 3, text: 'How often do you have problems remembering appointments or obligations?' },
        { id: 4, text: 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?' },
        { id: 5, text: 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?' },
        { id: 6, text: 'How often do you feel overly active and compelled to do things, like you were driven by a motor?' },
        { id: 7, text: 'How often do you make careless mistakes when you have to work on a boring or difficult project?' },
        { id: 8, text: 'How often do you have difficulty keeping your attention when you are doing boring or repetitive work?' },
        { id: 9, text: 'How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?' },
        { id: 10, text: 'How often do you misplace or have difficulty finding things at home or at work?' },
        { id: 11, text: 'How often are you distracted by activity or noise around you?' },
        { id: 12, text: 'How often do you leave your seat in meetings or other situations in which you are expected to remain seated?' },
        { id: 13, text: 'How often do you feel restless or fidgety?' },
        { id: 14, text: 'How often do you have difficulty unwinding and relaxing when you have time to yourself?' },
        { id: 15, text: 'How often do you find yourself talking too much when you are in social situations?' },
        { id: 16, text: 'When you\'re in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?' },
        { id: 17, text: 'How often do you have difficulty waiting your turn in situations when turn taking is required?' },
        { id: 18, text: 'How often do you interrupt others when they are busy?' }
    ],
    answerOptions: [
        { label: 'Never', value: 0 },
        { label: 'Rarely', value: 1 },
        { label: 'Sometimes', value: 2 },
        { label: 'Often', value: 3 },
        { label: 'Very Often', value: 4 }
    ],
    scoring: {
        maxScore: 72,
        severityLevels: {
            minimal: { max: 23 },
            mild: { min: 24, max: 35 },
            moderate: { min: 36, max: 47 },
            severe: { min: 48 }
        }
    }
};

// DLA-20: Disability Assessment
export const DLA20_TEST: TestDefinition = {
    id: 'dla20',
    name: 'DLA-20',
    fullName: 'Disability Assessment Schedule 2.0',
    description: 'A brief assessment of functional impairment',
    questionCount: 12,
    estimatedTime: '3 minutes',
    questions: [
        { id: 1, text: 'Concentrating on doing something for ten minutes' },
        { id: 2, text: 'Remembering to do important things' },
        { id: 3, text: 'Analyzing and finding solutions to problems in day-to-day life' },
        { id: 4, text: 'Learning a new task, for example, learning how to get to a new place' },
        { id: 5, text: 'Standing for long periods such as 30 minutes' },
        { id: 6, text: 'Standing up from sitting down' },
        { id: 7, text: 'Moving around inside your home' },
        { id: 8, text: 'Washing your whole body' },
        { id: 9, text: 'Getting dressed' },
        { id: 10, text: 'Dealing with people you do not know' },
        { id: 11, text: 'Maintaining a friendship' },
        { id: 12, text: 'Your day-to-day work or school activities' }
    ],
    answerOptions: [
        { label: 'None', value: 0 },
        { label: 'Mild', value: 1 },
        { label: 'Moderate', value: 2 },
        { label: 'Severe', value: 3 },
        { label: 'Extreme/Cannot do', value: 4 }
    ],
    scoring: {
        maxScore: 48,
        severityLevels: {
            minimal: { max: 11 },
            mild: { min: 12, max: 23 },
            moderate: { min: 24, max: 35 },
            severe: { min: 36 }
        }
    }
};

// Export all tests
export const MENTAL_HEALTH_TESTS: Record<string, TestDefinition> = {
    depression: PHQ9_TEST,
    anxiety: GAD7_TEST,
    adhd: ASRS_TEST,
    dla20: DLA20_TEST
};

// Helper function to calculate score and severity
export const calculateTestScore = (
    testType: string,
    responses: { questionId: number; answer: number }[]
): { total: number; severity: string; percentage: number } => {
    const test = MENTAL_HEALTH_TESTS[testType];
    if (!test) {
        throw new Error('Invalid test type');
    }

    // Calculate total score
    const total = responses.reduce((sum, response) => sum + response.answer, 0);

    // Calculate percentage
    const percentage = (total / test.scoring.maxScore) * 100;

    // Determine severity
    let severity = 'minimal';
    const levels = test.scoring.severityLevels;

    if (total >= levels.severe.min) {
        severity = 'severe';
    } else if (levels['moderately-severe'] && total >= levels['moderately-severe'].min) {
        severity = 'moderately-severe';
    } else if (total >= levels.moderate.min) {
        severity = 'moderate';
    } else if (total >= levels.mild.min) {
        severity = 'mild';
    }

    return { total, severity, percentage: Math.round(percentage) };
};
