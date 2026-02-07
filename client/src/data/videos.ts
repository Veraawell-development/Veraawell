export interface Video {
    id: string;
    title: string;
    description: string;
    category: string;
    duration: string;
    youtubeId: string;
    thumbnail: string;
    publishedDate: string;
}

export const videos: Video[] = [
    {
        id: '1',
        title: 'Understanding Depression: Symptoms, Causes, and Treatment',
        description: 'Learn about the signs of depression, what causes it, and effective treatment options available.',
        category: 'Depression',
        duration: '12:45',
        youtubeId: 'z-IR48Mb3W0',
        thumbnail: 'https://img.youtube.com/vi/z-IR48Mb3W0/maxresdefault.jpg',
        publishedDate: '2026-01-05'
    },
    {
        id: '2',
        title: 'Managing Anxiety: Practical Techniques and Strategies',
        description: 'Discover evidence-based techniques to manage anxiety and reduce stress in your daily life.',
        category: 'Anxiety',
        duration: '10:30',
        youtubeId: 'WWloIAQpMcQ',
        thumbnail: 'https://img.youtube.com/vi/WWloIAQpMcQ/maxresdefault.jpg',
        publishedDate: '2026-01-03'
    },
    {
        id: '3',
        title: 'Introduction to Mindfulness Meditation',
        description: 'A beginner-friendly guide to mindfulness meditation and its benefits for mental health.',
        category: 'Self-Care',
        duration: '15:20',
        youtubeId: 'ZToicYcHIOU',
        thumbnail: 'https://img.youtube.com/vi/ZToicYcHIOU/maxresdefault.jpg',
        publishedDate: '2026-01-01'
    },
    {
        id: '4',
        title: 'Coping with Stress: Healthy Strategies',
        description: 'Learn healthy coping mechanisms to deal with stress and improve your overall well-being.',
        category: 'Stress Management',
        duration: '8:15',
        youtubeId: 'hnpQrMqDoqE',
        thumbnail: 'https://img.youtube.com/vi/hnpQrMqDoqE/maxresdefault.jpg',
        publishedDate: '2025-12-28'
    },
    {
        id: '5',
        title: 'Building Healthy Relationships',
        description: 'Expert advice on creating and maintaining healthy, supportive relationships.',
        category: 'Relationships',
        duration: '11:40',
        youtubeId: 'l7TONauJGfc',
        thumbnail: 'https://img.youtube.com/vi/l7TONauJGfc/maxresdefault.jpg',
        publishedDate: '2025-12-25'
    },
    {
        id: '6',
        title: 'Understanding ADHD in Adults',
        description: 'Comprehensive overview of ADHD symptoms, diagnosis, and management in adults.',
        category: 'ADHD',
        duration: '14:10',
        youtubeId: '38qpm6VKBFc',
        thumbnail: 'https://img.youtube.com/vi/38qpm6VKBFc/maxresdefault.jpg',
        publishedDate: '2025-12-20'
    }
];

export const videoCategories = [
    'All',
    'Depression',
    'Anxiety',
    'ADHD',
    'Self-Care',
    'Stress Management',
    'Relationships'
];
