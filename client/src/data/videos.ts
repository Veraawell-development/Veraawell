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
        title: 'The power of vulnerability | Brené Brown',
        description: 'Dr. Brené Brown studies human connection—our ability to empathize, belong, love. In a poignant, funny talk, she shares a deep insight from her research.',
        category: 'Self-Care',
        duration: '20:19',
        youtubeId: 'iCvmsMzlF7o',
        thumbnail: 'https://img.youtube.com/vi/iCvmsMzlF7o/hqdefault.jpg',
        publishedDate: '2026-06-15'
    },
    {
        id: '2',
        title: 'This could be why you\'re depressed or anxious | Johann Hari',
        description: 'In a deeply moving talk, journalist Johann Hari shares fresh insights on the causes of depression and anxiety, emphasizing the importance of human connection.',
        category: 'Depression',
        duration: '20:31',
        youtubeId: 'MB5IX-np5fE',
        thumbnail: 'https://img.youtube.com/vi/MB5IX-np5fE/hqdefault.jpg',
        publishedDate: '2026-05-22'
    },
    {
        id: '3',
        title: 'Inside the mind of a master procrastinator | Tim Urban',
        description: 'Tim Urban knows that procrastination doesn\'t make sense, but he\'s never been able to shake his habit of waiting until the last minute to get things done. In this hilarious and insightful talk, Urban takes us on a journey through YouTube binges, Wikipedia rabbit holes and bouts of staring out the window.',
        category: 'ADHD',
        duration: '14:03',
        youtubeId: 'arj7oStGLkU',
        thumbnail: 'https://img.youtube.com/vi/arj7oStGLkU/hqdefault.jpg',
        publishedDate: '2026-04-10'
    },
    {
        id: '4',
        title: 'How to make stress your friend | Kelly McGonigal',
        description: 'Stress. It makes your heart pound, your breathing quicken and your forehead sweat. But while stress has been made into a public health enemy, new research suggests that stress may only be bad for you if you believe that to be the case.',
        category: 'Stress Management',
        duration: '14:28',
        youtubeId: 'RcGyVTAoXEU',
        thumbnail: 'https://img.youtube.com/vi/RcGyVTAoXEU/hqdefault.jpg',
        publishedDate: '2026-03-05'
    },
    {
        id: '5',
        title: 'The happy secret to better work | Shawn Achor',
        description: 'We believe that we should work to be happy, but could that be backwards? In this fast-moving and entertaining talk, psychologist Shawn Achor argues that actually happiness inspires productivity.',
        category: 'Self-Care',
        duration: '12:20',
        youtubeId: 'fLJsdqxnZb0',
        thumbnail: 'https://img.youtube.com/vi/fLJsdqxnZb0/hqdefault.jpg',
        publishedDate: '2026-02-18'
    },
    {
        id: '6',
        title: 'Why we all need to practice emotional first aid | Guy Winch',
        description: 'We\'ll go to the doctor when we feel flu-ish or a nagging pain. So why don\'t we see a health professional when we feel emotional pain: guilt, loss, loneliness?',
        category: 'Anxiety',
        duration: '17:24',
        youtubeId: 'F2hc2FLOdhI',
        thumbnail: 'https://img.youtube.com/vi/F2hc2FLOdhI/hqdefault.jpg',
        publishedDate: '2026-01-20'
    }
];

export const videoCategories = [
    'All',
    'Depression',
    'Anxiety',
    'ADHD',
    'Self-Care',
    'Stress Management',
    'Addiction'
];
