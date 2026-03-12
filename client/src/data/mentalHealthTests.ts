export interface TestAnswerOption {
    label: string;
    value: number;
}

export interface TestQuestion {
    id: number;
    text: string;
    category?: string;
    options?: TestAnswerOption[]; // Custom options for specific questions
    sectionId?: string;
}

export interface TestSection {
    id: string;
    title: string;
    description?: string;
    condition?: (responses: Record<number, number>) => boolean;
}

export interface TestDefinition {
    id: string;
    name: string;
    fullName: string;
    description: string;
    questionCount: number;
    estimatedTime: string;
    sections?: TestSection[];
    questions: TestQuestion[];
    defaultOptions: TestAnswerOption[];
    scoring: {
        maxScore: number;
        severityLevels: {
            minimal: { max: number; label?: string; description?: string };
            mild: { min: number; max: number; label?: string; description?: string };
            moderate: { min: number; max: number; label?: string; description?: string };
            'moderately-severe'?: { min: number; max: number; label?: string; description?: string };
            severe: { min: number; label?: string; description?: string };
        };
    };
}

// Answer Option Templates
const FREQUENCY_OPTIONS: TestAnswerOption[] = [
    { label: 'NOT AT ALL', value: 0 },
    { label: 'SEVERAL DAYS', value: 1 },
    { label: 'MORE THAN HALF THE DAYS', value: 2 },
    { label: 'NEARLY EVERY DAY', value: 3 }
];

const YES_NO_OPTIONS: TestAnswerOption[] = [
    { label: 'YES', value: 1 },
    { label: 'NO', value: 0 }
];

const ADHD_FREQUENCY_OPTIONS: TestAnswerOption[] = [
    { label: 'NEVER', value: 0 },
    { label: 'RARELY', value: 1 },
    { label: 'SOMETIMES', value: 2 },
    { label: 'OFTEN', value: 3 },
    { label: 'VERY OFTEN', value: 4 }
];

// 1. Depression Test
export const DEPRESSION_TEST: TestDefinition = {
    id: 'depression',
    name: 'Depression Test',
    fullName: 'Patient Health Questionnaire-9 (PHQ-9)',
    description: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    questionCount: 10,
    estimatedTime: '3 minutes',
    questions: [
        { id: 1, text: 'Little interest or pleasure in doing things' },
        { id: 2, text: 'Feeling down, depressed, or hopeless' },
        { id: 3, text: 'Trouble falling or staying asleep, or sleeping too much' },
        { id: 4, text: 'Feeling tired or having little energy' },
        { id: 5, text: 'Poor appetite or overeating' },
        { id: 6, text: 'Feeling bad about yourself - or that you are a failure or have let yourself or your family down' },
        { id: 7, text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
        { id: 8, text: 'Moving or speaking so slowly that other people could have noticed. Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual' },
        { id: 9, text: 'Thoughts that you would be better off dead, or of hurting yourself' },
        { 
            id: 10, 
            text: 'If you checked off any problems, how difficult have these problems made it for you at work, home, or with other people?',
            options: [
                { label: 'NOT DIFFICULT AT ALL', value: 0 },
                { label: 'SOMEWHAT DIFFICULT', value: 1 },
                { label: 'VERY DIFFICULT', value: 2 },
                { label: 'EXTREMELY DIFFICULT', value: 3 }
            ]
        }
    ],
    defaultOptions: FREQUENCY_OPTIONS,
    scoring: {
        maxScore: 30, 
        severityLevels: {
            minimal: { max: 4 },
            mild: { min: 5, max: 9 },
            moderate: { min: 10, max: 14 },
            'moderately-severe': { min: 15, max: 19 },
            severe: { min: 20 }
        }
    }
};

// 2. Anxiety Test
export const ANXIETY_TEST: TestDefinition = {
    id: 'anxiety',
    name: 'Anxiety Test',
    fullName: 'Generalized Anxiety Disorder-7 (GAD-7)',
    description: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
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
    defaultOptions: FREQUENCY_OPTIONS,
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

// 3. ADHD Test
export const ADHD_TEST: TestDefinition = {
    id: 'adhd',
    name: 'ADHD Test',
    fullName: 'Adult ADHD Self-Report Scale (ASRS)',
    description: 'Screening for ADHD symptoms over the past 6 months.',
    questionCount: 25,
    estimatedTime: '5 minutes',
    sections: [
        { id: 'baseline', title: 'Background' },
        { id: 'frequency', title: 'Symptom Frequency' }
    ],
    questions: [
        { id: 1, sectionId: 'baseline', text: 'In the last three months, have you often had trouble keeping your mind on what you were doing most of the time?', options: YES_NO_OPTIONS },
        { id: 2, sectionId: 'baseline', text: 'In the last three months, have you often forgotten what you are supposed to be doing or what you had planned to do?', options: YES_NO_OPTIONS },
        { id: 3, sectionId: 'baseline', text: 'In the last three months, have you often found it hard to keep your mind on what you are doing when other things are going on?', options: YES_NO_OPTIONS },
        { id: 4, sectionId: 'baseline', text: 'In the last three months, have you often tried not to do things where you would need to pay attention for a long time?', options: YES_NO_OPTIONS },
        { id: 5, sectionId: 'baseline', text: 'In the last three months, have you often made a lot of mistakes because it\'s hard for you to do things carefully?', options: YES_NO_OPTIONS },
        { id: 6, sectionId: 'baseline', text: 'In the last three months, have you often felt fidgety, physically restless, or felt like you always had to be moving or doing something?', options: YES_NO_OPTIONS },
        { id: 7, sectionId: 'baseline', text: 'In the last year, have you taken medication for being overactive, being hyperactive, or having trouble paying attention?', options: YES_NO_OPTIONS },
        { id: 8, sectionId: 'frequency', text: 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?' },
        { id: 9, sectionId: 'frequency', text: 'How often do you have difficulty getting things in order when you have to do a task that requires organization?' },
        { id: 10, sectionId: 'frequency', text: 'How often do you have problems remembering appointments or obligations?' },
        { id: 11, sectionId: 'frequency', text: 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?' },
        { id: 12, sectionId: 'frequency', text: 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?' },
        { id: 13, sectionId: 'frequency', text: 'How often do you feel overly active and compelled to do things, like you were driven by a motor?' },
        { id: 14, sectionId: 'frequency', text: 'How often do you make careless mistakes when you have to work on a boring or difficult project?' },
        { id: 15, sectionId: 'frequency', text: 'How often do you have difficulty keeping your attention when you are doing boring or repetitive work?' },
        { id: 16, sectionId: 'frequency', text: 'How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?' },
        { id: 17, sectionId: 'frequency', text: 'How often do you misplace or have difficulty finding things at home or at work?' },
        { id: 18, sectionId: 'frequency', text: 'How often are you distracted by activity or noise around you?' },
        { id: 19, sectionId: 'frequency', text: 'How often do you leave your seat in meetings or other situations in which you are expected to remain seated?' },
        { id: 20, sectionId: 'frequency', text: 'How often do you feel restless or fidgety?' },
        { id: 21, sectionId: 'frequency', text: 'How often do you have difficulty unwinding and relaxing when you have time to yourself?' },
        { id: 22, sectionId: 'frequency', text: 'How often do you find yourself talking too much when you are in social situations?' },
        { id: 23, sectionId: 'frequency', text: 'When you’re in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?' },
        { id: 24, sectionId: 'frequency', text: 'How often do you have difficulty waiting your turn in situations when turn taking is required?' },
        { id: 25, sectionId: 'frequency', text: 'How often do you interrupt others when they are busy?' }
    ],
    defaultOptions: ADHD_FREQUENCY_OPTIONS,
    scoring: {
        maxScore: 79,
        severityLevels: {
            minimal: { max: 20 },
            mild: { min: 21, max: 40 },
            moderate: { min: 41, max: 60 },
            severe: { min: 61 }
        }
    }
};

// 4. PTSD Test
export const PTSD_TEST: TestDefinition = {
    id: 'ptsd',
    name: 'PTSD Test',
    fullName: 'Post-Traumatic Stress Disorder Screening',
    description: 'Screening for past traumatic experiences and current symptoms.',
    questionCount: 24,
    estimatedTime: '6 minutes',
    sections: [
        { id: 'consent', title: 'Additional Questions', description: 'Can you help us answer 9 extra questions about your experiences over different periods of time (1 month vs. 3 months)?' },
        { id: 'experience', title: 'Past Experiences', description: 'Sometimes things happen to people that are unusually or especially frightening, horrible, or traumatic.' },
        { 
            id: 'month', 
            title: 'Past Month', 
            description: 'In the past month, have you...',
            condition: (responses) => responses[1] === 1 // Only if they select YES (1) for extra questions (Question ID 1)
        },
        { 
            id: 'quarter', 
            title: 'Last 3 Months', 
            description: 'These next questions are about how you have been acting and feeling in the last three months...',
            condition: (responses) => responses[1] === 1
        }
    ],
    questions: [
        { id: 1, sectionId: 'consent', text: 'Can you help us answer 9 extra questions about your experiences over different periods of time (1 month vs. 3 months)?', options: YES_NO_OPTIONS },
        { id: 2, sectionId: 'experience', text: 'Been in a national disaster where you thought you were going to die or be seriously injured?', options: YES_NO_OPTIONS },
        { id: 3, sectionId: 'experience', text: 'Been attacked or hurt very badly?', options: YES_NO_OPTIONS },
        { id: 4, sectionId: 'experience', text: 'Any type of unwanted or uncomfortable sexual encounter?', options: YES_NO_OPTIONS },
        { id: 5, sectionId: 'experience', text: 'Been in a situation when you thought you were going to die?', options: YES_NO_OPTIONS },
        { id: 6, sectionId: 'experience', text: 'Had someone you were close be attacked or hurt very badly?', options: YES_NO_OPTIONS },
        { id: 7, sectionId: 'experience', text: 'Had someone close to you die very suddenly?', options: YES_NO_OPTIONS },
        { id: 8, sectionId: 'experience', text: 'Seen anyone be killed or die suddenly in front of you?', options: YES_NO_OPTIONS },
        { id: 9, sectionId: 'experience', text: 'Other traumatic events?', options: YES_NO_OPTIONS },
        { id: 10, sectionId: 'month', text: 'Had nightmares about the event(s) or thought about them when you did not want to?', options: YES_NO_OPTIONS },
        { id: 11, sectionId: 'month', text: 'Tried hard not to think about the event(s) or avoid situations that reminded you of them?', options: YES_NO_OPTIONS },
        { id: 12, sectionId: 'month', text: 'Been constantly on guard, watchful, or easily startled?', options: YES_NO_OPTIONS },
        { id: 13, sectionId: 'month', text: 'Felt numb or detached from people, activities, or your surroundings?', options: YES_NO_OPTIONS },
        { id: 14, sectionId: 'month', text: 'Felt guilty or unable to stop blaming yourself or others for the event(s)?', options: YES_NO_OPTIONS },
        { id: 15, sectionId: 'quarter', text: 'In the last three months, have you often thought about any of these events?', options: YES_NO_OPTIONS },
        { id: 16, sectionId: 'quarter', text: 'Had problems falling asleep or staying asleep?', options: YES_NO_OPTIONS },
        { id: 17, sectionId: 'quarter', text: 'Had a lot of nightmares about what happened?', options: YES_NO_OPTIONS },
        { id: 18, sectionId: 'quarter', text: 'Tried very hard not to think about what happened?', options: YES_NO_OPTIONS },
        { id: 19, sectionId: 'quarter', text: 'Stopped going places or doing things that might remind you?', options: YES_NO_OPTIONS },
        { id: 20, sectionId: 'quarter', text: 'Tried to keep away from people who might remind you?', options: YES_NO_OPTIONS },
        { id: 21, sectionId: 'quarter', text: 'Stopped thinking about the future?', options: YES_NO_OPTIONS },
        { id: 22, sectionId: 'quarter', text: 'Harder to keep your mind on things or to concentrate?', options: YES_NO_OPTIONS },
        { id: 23, sectionId: 'quarter', text: 'Been very upset, afraid or sad when something made you think about it?', options: YES_NO_OPTIONS },
        { id: 24, sectionId: 'quarter', text: 'Had upsetting thoughts or pictures of what happened come into your mind?', options: YES_NO_OPTIONS }
    ],
    defaultOptions: YES_NO_OPTIONS,
    scoring: {
        maxScore: 24,
        severityLevels: {
            minimal: { max: 5 },
            mild: { min: 6, max: 12 },
            moderate: { min: 13, max: 18 },
            severe: { min: 19 }
        }
    }
};

// 5. Addiction Test
export const ADDICTION_TEST: TestDefinition = {
    id: 'addiction',
    name: 'Addiction Test',
    fullName: 'Substance Use and Addiction Screening',
    description: 'Assessment for problematic substance use or behavior.',
    questionCount: 15,
    estimatedTime: '4 minutes',
    sections: [
        { id: 'type', title: 'Concern Area' },
        { id: 'alcohol', title: 'Alcohol Use', condition: (responses) => responses[1] === 0 },
        { id: 'drugs', title: 'Drug Use', condition: (responses) => responses[1] === 1 },
        { id: 'behavior', title: 'Behavioral Addiction', condition: (responses) => responses[1] === 2 }
    ],
    questions: [
        { 
            id: 1, 
            sectionId: 'type', 
            text: 'What substance or behavior are you most concerned about?', 
            options: [
                { label: 'ALCOHOL', value: 0 },
                { label: 'ANOTHER DRUG OR MULTIPLE DRUGS', value: 1 },
                { label: 'ANOTHER BEHAVIOR (GAMBLING, SELF-HARM, ETC.)', value: 2 }
            ]
        },
        // Alcohol Path
        { id: 2, sectionId: 'alcohol', text: 'In the last three months, were there times when you drank alcohol more than you wanted?', options: YES_NO_OPTIONS },
        { id: 3, sectionId: 'alcohol', text: 'Did you get into arguments because of drinking?', options: YES_NO_OPTIONS },
        { id: 4, sectionId: 'alcohol', text: 'Did you miss school or work to go drinking?', options: YES_NO_OPTIONS },
        { id: 10, sectionId: 'alcohol', text: 'Did you have strong desires or cravings for alcohol?', options: YES_NO_OPTIONS },
        { id: 11, sectionId: 'alcohol', text: 'Did you want to cut back, but couldn\'t?', options: YES_NO_OPTIONS },
        // Drug Path
        { id: 5, sectionId: 'drugs', text: 'Did you have strong desires or cravings for the drug?', options: YES_NO_OPTIONS },
        { id: 6, sectionId: 'drugs', text: 'Did you want to cut back or stop, but couldn\'t?', options: YES_NO_OPTIONS },
        { id: 7, sectionId: 'drugs', text: 'Did you continue to use even if it caused mental or physical problems?', options: YES_NO_OPTIONS },
        // Behavior Path
        { id: 8, sectionId: 'behavior', text: 'Did you spend a lot of time thinking about the behavior?', options: YES_NO_OPTIONS },
        { id: 9, sectionId: 'behavior', text: 'Did you need to do it more to get the same excitement?', options: YES_NO_OPTIONS }
    ],
    defaultOptions: YES_NO_OPTIONS,
    scoring: {
        maxScore: 10,
        severityLevels: {
            minimal: { max: 2 },
            mild: { min: 3, max: 5 },
            moderate: { min: 6, max: 8 },
            severe: { min: 9 }
        }
    }
};

// 6. Social Anxiety Test
export const SOCIAL_ANXIETY_TEST: TestDefinition = {
    id: 'social-anxiety',
    name: 'Social Anxiety Test',
    fullName: 'Social Anxiety Screening',
    description: 'Assessment of feelings and behaviors in various social situations.',
    questionCount: 12,
    estimatedTime: '3 minutes',
    questions: [
        { id: 1, text: 'Felt moments of sudden terror, fear, or fright in social situations' },
        { id: 2, text: 'Felt anxious, worried, or nervous about social situations' },
        { id: 3, text: 'Have had thoughts of being rejected, humiliated, or embarrassed' },
        { id: 4, text: 'Felt a racing heart, sweaty, or shaky in social situations' },
        { id: 5, text: 'Felt tense muscles or had trouble relaxing' },
        { id: 6, text: 'Avoided or did not approach social situations' },
        { id: 7, text: 'Left social situations early or participated minimally' },
        { id: 8, text: 'Spent a lot of time preparing what to say' },
        { id: 9, text: 'Distracted myself to avoid thinking about social situations' },
        { id: 10, text: 'Needed help to cope (e.g., alcohol or medications)' },
        { id: 11, text: 'In the last 3 months, felt very nervous with a group of people?', options: YES_NO_OPTIONS },
        { id: 12, text: 'In the last 3 months, felt very nervous doing things in front of people?', options: YES_NO_OPTIONS }
    ],
    defaultOptions: [
        { label: 'NEVER', value: 0 },
        { label: 'OCCASIONALLY', value: 1 },
        { label: 'HALF OF THE TIME', value: 2 },
        { label: 'MOST OF THE TIME', value: 3 },
        { label: 'ALL OF THE TIME', value: 4 }
    ],
    scoring: {
        maxScore: 42,
        severityLevels: {
            minimal: { max: 8 },
            mild: { min: 9, max: 18 },
            moderate: { min: 19, max: 30 },
            severe: { min: 31 }
        }
    }
};

// 7. Post-Partum Depression
export const POST_PARTUM_TEST: TestDefinition = {
    id: 'post-partum',
    name: 'Post-Partum Test',
    fullName: 'Edinburgh Postnatal Depression Scale (EPDS)',
    description: 'How have you felt in the past 7 days?',
    questionCount: 10,
    estimatedTime: '3 minutes',
    questions: [
        { id: 1, text: 'I have been able to laugh and see the funny side of things', options: [
            { label: 'AS MUCH AS I ALWAYS COULD', value: 0 },
            { label: 'NOT QUITE AS MUCH NOW', value: 1 },
            { label: 'DEFINITELY NOT AS MUCH NOW', value: 2 },
            { label: 'NOT AT ALL', value: 3 }
        ]},
        { id: 2, text: 'I have looked forward with enjoyment to things', options: [
            { label: 'AS MUCH AS I EVER DID', value: 0 },
            { label: 'SOMEWHAT LESS THAN I USED TO', value: 1 },
            { label: 'DEFINITELY LESS THAN I USED TO', value: 2 },
            { label: 'HARDLY AT ALL', value: 3 }
        ]},
        { id: 3, text: 'I have blamed myself when things went wrong', options: [
            { label: 'YES, MOST OF THE TIME', value: 3 },
            { label: 'YES, SOME OF THE TIME', value: 2 },
            { label: 'NOT VERY OFTEN', value: 1 },
            { label: 'NO, NEVER', value: 0 }
        ]},
        { id: 4, text: 'I have felt anxious or worried', options: [
            { label: 'NO, NOT AT ALL', value: 0 },
            { label: 'HARDLY EVER', value: 1 },
            { label: 'YES, SOMETIMES', value: 2 },
            { label: 'YES, VERY OFTEN', value: 3 }
        ]},
        { id: 5, text: 'I have felt scared or panicky', options: [
            { label: 'YES, QUITE A LOT', value: 3 },
            { label: 'YES, SOMETIMES', value: 2 },
            { label: 'NO, NOT MUCH', value: 1 },
            { label: 'NO, NOT AT ALL', value: 0 }
        ]},
        { id: 6, text: 'I have felt overwhelmed', options: [
            { label: 'YES, MOST OF THE TIME', value: 3 },
            { label: 'YES, SOMETIMES I HAVEN\'T BEEN COPING WELL', value: 2 },
            { label: 'NO, MOST OF THE TIME I HAVE COPED WELL', value: 1 },
            { label: 'NO, I HAVE BEEN COPING AS WELL AS EVER', value: 0 }
        ]},
        { id: 7, text: 'I have had difficulty sleeping even when I have the opportunity to sleep', options: [
            { label: 'YES, MOST OF THE TIME', value: 3 },
            { label: 'YES, QUITE OFTEN', value: 2 },
            { label: 'NOT VERY OFTEN', value: 1 },
            { label: 'NO, NOT AT ALL', value: 0 }
        ]},
        { id: 8, text: 'I have felt sad or miserable', options: [
            { label: 'YES, MOST OF THE TIME', value: 3 },
            { label: 'YES, QUITE OFTEN', value: 2 },
            { label: 'NOT VERY OFTEN', value: 1 },
            { label: 'NO, NOT AT ALL', value: 0 }
        ]},
        { id: 9, text: 'I have felt so unhappy that I have been crying', options: [
            { label: 'YES, MOST OF THE TIME', value: 3 },
            { label: 'YES, QUITE OFTEN', value: 2 },
            { label: 'ONLY OCCASIONALLY', value: 1 },
            { label: 'NO, NEVER', value: 0 }
        ]},
        { id: 10, text: 'The thought of harming myself has occurred to me', options: [
            { label: 'YES, QUITE OFTEN', value: 3 },
            { label: 'SOMETIMES', value: 2 },
            { label: 'HARDLY EVER', value: 1 },
            { label: 'NEVER', value: 0 }
        ]}
    ],
    defaultOptions: [],
    scoring: {
        maxScore: 30,
        severityLevels: {
            minimal: { max: 6 },
            mild: { min: 7, max: 12 },
            moderate: { min: 13, max: 18 },
            severe: { min: 19 }
        }
    }
};

// 8. Bipolar Test
export const BIPOLAR_TEST: TestDefinition = {
    id: 'bipolar',
    name: 'Bipolar Test',
    fullName: 'Mood Disorder Questionnaire (MDQ)',
    description: 'Screening for manic symptoms and bipolar disorder history.',
    questionCount: 22,
    estimatedTime: '4 minutes',
    questions: [
        { id: 1, text: 'In the last three months, have you had a time when you\'ve been grouchy or angry?', options: YES_NO_OPTIONS },
        { id: 2, text: 'Time when you felt very restless so that you had to be on the move all the time?', options: YES_NO_OPTIONS },
        { id: 3, text: 'Time when you talked too much or too quickly?', options: YES_NO_OPTIONS },
        { id: 4, text: 'Time when you thought you had special abilities or powers?', options: YES_NO_OPTIONS },
        { id: 5, text: 'Time when you often felt like your mind was racing too quickly?', options: YES_NO_OPTIONS },
        { id: 6, text: 'Felt so eluted, excited, or hyper that others thought you were not normal?', options: YES_NO_OPTIONS },
        { id: 7, text: 'Manic Episode: Felt so good or hyper that you got into trouble?', options: YES_NO_OPTIONS },
        { id: 8, text: 'So irritable that you shouted at people or started fights?', options: YES_NO_OPTIONS },
        { id: 9, text: 'Felt much more self-confident than usual?', options: YES_NO_OPTIONS },
        { id: 10, text: 'Got much less sleep than usual?', options: YES_NO_OPTIONS },
        { id: 11, text: 'Talkative or spoke much faster than usual?', options: YES_NO_OPTIONS },
        { id: 12, text: 'Thoughts raced through your head?', options: YES_NO_OPTIONS },
        { id: 13, text: 'Easily distracted and had trouble concentrating?', options: YES_NO_OPTIONS },
        { id: 14, text: 'Had much more energy than usual?', options: YES_NO_OPTIONS },
        { id: 15, text: 'Much more social or outgoing?', options: YES_NO_OPTIONS },
        { id: 16, text: 'Much more interested in sex?', options: YES_NO_OPTIONS },
        { id: 17, text: 'Did things that were excessive, foolish, or risky?', options: YES_NO_OPTIONS },
        { id: 18, text: 'Spending money got you or your family into trouble?', options: YES_NO_OPTIONS },
        { id: 19, text: 'Did several of these happen during the same period of time?', options: YES_NO_OPTIONS },
        { id: 20, text: 'How much of a problem did any of these cause you?', options: [
            { label: 'NO PROBLEM', value: 0 },
            { label: 'MINOR PROBLEM', value: 1 },
            { label: 'MODERATE PROBLEM', value: 2 },
            { label: 'SERIOUS PROBLEM', value: 3 }
        ]},
        { id: 21, text: 'Have any blood relatives had bipolar disorder?', options: YES_NO_OPTIONS },
        { id: 22, text: 'Has a professional ever told you that you have bipolar?', options: YES_NO_OPTIONS }
    ],
    defaultOptions: YES_NO_OPTIONS,
    scoring: {
        maxScore: 24,
        severityLevels: {
            minimal: { max: 5 },
            mild: { min: 6, max: 12 },
            moderate: { min: 13, max: 18 },
            severe: { min: 19 }
        }
    }
};

// 9. Gambling Addiction
export const GAMBLING_TEST: TestDefinition = {
    id: 'gambling',
    name: 'Gambling Test',
    fullName: 'Gambling Addiction Screening',
    description: 'Assessment for problematic gambling behavior over the past 12 months.',
    questionCount: 23,
    estimatedTime: '5 minutes',
    questions: [
        { id: 1, text: 'Spent a lot of time thinking about gambling experiences?' },
        { id: 2, text: 'Spent a lot of time thinking about ways of getting money to gamble?' },
        { id: 3, text: 'Needed to gamble with increasing amounts of money?' },
        { id: 4, text: 'Tried to stop, cut down, or control your gambling?' },
        { id: 5, text: 'Gambled as a way to escape from personal problems?' },
        { id: 6, text: 'Gambled to relieve uncomfortable feelings (guilt, anxiety, etc.)?' },
        { id: 7, text: 'After losing, did you return another day to get even?' },
        { id: 8, text: 'Lied to family members about how much you gamble?' },
        { id: 9, text: 'Has gambling caused serious problems in relationships?' },
        { id: 10, text: 'Has gambling caused problems in school?' },
        { id: 11, text: 'Has gambling caused you to lose a job or miss a career opportunity?' },
        { id: 12, text: 'Needed to ask others to bail you out of a money situation?' },
        { id: 13, text: 'Strong desires or cravings for gambling?' },
        { id: 14, text: 'Wanted to cut back or stop gambling, but couldn\'t?' },
        { id: 15, text: 'Spent a lot of time gambling or recovering?' },
        { id: 16, text: 'Times when you gambled more or for longer than wanted?' },
        { id: 17, text: 'Did gambling have less effect than it used to?' },
        { id: 18, text: 'Feel restless or irritable when not gambling?' },
        { id: 19, text: 'Continued even if it caused mental or physical problems?' },
        { id: 20, text: 'Gambled even if it caused problems with family?' },
        { id: 21, text: 'Made it harder to keep up with work or school?' },
        { id: 22, text: 'Used time for gambling that was meant for hobbies or social time?' },
        { id: 23, text: 'Ended up in risky situations more than once because of gambling?' }
    ],
    defaultOptions: YES_NO_OPTIONS,
    scoring: {
        maxScore: 23,
        severityLevels: {
            minimal: { max: 4 },
            mild: { min: 5, max: 10 },
            moderate: { min: 11, max: 17 },
            severe: { min: 18 }
        }
    }
};

// 10. Eating Disorder
export const EATING_DISORDER_TEST: TestDefinition = {
    id: 'eating-disorder',
    name: 'Eating Disorder',
    fullName: 'Eating Disorder Screening (SCOFF)',
    description: 'A screening tool for eating habits and body image concerns.',
    questionCount: 5,
    estimatedTime: '2 minutes',
    questions: [
        { id: 1, text: 'Do you make yourself sick because you feel uncomfortably full?' },
        { id: 2, text: 'Do you worry you have lost control over how much you eat?' },
        { id: 3, text: 'Have you recently lost more than one stone (6.35kg) in a 3 month period?' },
        { id: 4, text: 'Do you believe yourself to be fat when others say you are too thin?' },
        { id: 5, text: 'Would you say that food dominates your life?' }
    ],
    defaultOptions: YES_NO_OPTIONS,
    scoring: {
        maxScore: 5,
        severityLevels: {
            minimal: { max: 1 },
            mild: { min: 2, max: 2 },
            moderate: { min: 3, max: 4 },
            severe: { min: 5 }
        }
    }
};

// Export all tests
export const MENTAL_HEALTH_TESTS: Record<string, TestDefinition> = {
    depression: DEPRESSION_TEST,
    anxiety: ANXIETY_TEST,
    adhd: ADHD_TEST,
    ptsd: PTSD_TEST,
    addiction: ADDICTION_TEST,
    'social-anxiety': SOCIAL_ANXIETY_TEST,
    'post-partum': POST_PARTUM_TEST,
    bipolar: BIPOLAR_TEST,
    gambling: GAMBLING_TEST,
    'eating-disorder': EATING_DISORDER_TEST
};

// Helper function to calculate score and severity
export const calculateTestScore = (
    testId: string,
    responses: { questionId: number; answer: number }[]
): { total: number; severity: string; percentage: number } => {
    const test = MENTAL_HEALTH_TESTS[testId];
    if (!test) throw new Error('Invalid test type');

    const total = responses.reduce((sum, r) => sum + r.answer, 0);
    const percentage = (total / test.scoring.maxScore) * 100;

    let severity = 'minimal';
    const levels = test.scoring.severityLevels;

    if (total >= levels.severe.min) {
        severity = 'severe';
    } else if (levels['moderately-severe'] && total >= (levels['moderately-severe'] as any).min) {
        severity = 'moderately-severe';
    } else if (total >= levels.moderate.min) {
        severity = 'moderate';
    } else if (total >= levels.mild.min) {
        severity = 'mild';
    }

    return { total, severity, percentage: Math.round(percentage) };
};
