export interface Article {
    id: string;
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    readTime: string;
    image: string;
    author: string;
    publishedDate: string;
    content: string;
    featured?: boolean;
}

export const articles: Article[] = [
    {
        id: '1',
        slug: 'role-of-therapy-personality-disorders',
        title: 'The Role of Therapy in Managing Personality Disorders',
        description: 'Personality disorders are characterized by persistent unhealthy patterns of thinking, feeling, and behaving. Learn how therapy can help manage these conditions effectively.',
        category: 'Depression',
        tags: ['Therapy', 'Personality Disorders', 'Mental Health'],
        readTime: '8 mins read',
        image: '/articles/therapy-personality.jpg',
        author: 'Dr. Sarah Johnson',
        publishedDate: '2026-01-05',
        featured: true,
        content: `
      <h2>Understanding Personality Disorders</h2>
      <p>Personality disorders are characterized by persistent unhealthy patterns of thinking, feeling, and behaving that deviate from cultural expectations. These patterns typically emerge in adolescence or early adulthood and can cause significant distress or impairment.</p>
      
      <h3>Common Types of Personality Disorders</h3>
      <ul>
        <li><strong>Borderline Personality Disorder (BPD)</strong> - Characterized by unstable relationships, self-image, and emotions</li>
        <li><strong>Narcissistic Personality Disorder</strong> - Marked by grandiosity and lack of empathy</li>
        <li><strong>Antisocial Personality Disorder</strong> - Pattern of disregard for others' rights</li>
        <li><strong>Avoidant Personality Disorder</strong> - Extreme social inhibition and sensitivity to rejection</li>
      </ul>

      <h3>How Therapy Helps</h3>
      <p>Therapy plays a crucial role in managing personality disorders through various evidence-based approaches:</p>
      
      <h4>1. Dialectical Behavior Therapy (DBT)</h4>
      <p>Originally developed for BPD, DBT helps individuals develop skills in mindfulness, distress tolerance, emotion regulation, and interpersonal effectiveness.</p>
      
      <h4>2. Cognitive Behavioral Therapy (CBT)</h4>
      <p>CBT helps identify and change negative thought patterns and behaviors that contribute to personality disorder symptoms.</p>
      
      <h4>3. Schema Therapy</h4>
      <p>This integrative approach helps identify and change deeply ingrained patterns or "schemas" developed in childhood.</p>

      <h3>The Therapeutic Process</h3>
      <p>Treatment for personality disorders is typically long-term and requires commitment from both the therapist and client. Progress may be gradual, but with consistent effort, significant improvements are possible.</p>

      <h3>Seeking Help</h3>
      <p>If you or someone you know is struggling with symptoms of a personality disorder, reaching out to a mental health professional is the first step toward recovery. Early intervention can lead to better outcomes and improved quality of life.</p>
    `
    },
    {
        id: '2',
        slug: 'types-of-panic-attacks',
        title: 'Types of Panic Attacks and How To Cope With Them',
        description: 'Learn about different types of panic attacks, their symptoms, and effective coping strategies to manage them.',
        category: 'Depression',
        tags: ['Anxiety', 'Panic Attacks', 'Coping Strategies'],
        readTime: '6 mins read',
        image: '/articles/panic-attacks.jpg',
        author: 'Dr. Michael Chen',
        publishedDate: '2026-01-03',
        content: `
      <h2>Understanding Panic Attacks</h2>
      <p>Panic attacks are sudden episodes of intense fear that trigger severe physical reactions when there is no real danger or apparent cause. They can be frightening and overwhelming.</p>

      <h3>Types of Panic Attacks</h3>
      
      <h4>1. Expected Panic Attacks</h4>
      <p>These occur in response to specific triggers or situations, such as phobias or stressful events. People can often anticipate when they might occur.</p>

      <h4>2. Unexpected Panic Attacks</h4>
      <p>These come without warning and without an obvious trigger, making them particularly distressing.</p>

      <h3>Common Symptoms</h3>
      <ul>
        <li>Rapid heartbeat or palpitations</li>
        <li>Sweating and trembling</li>
        <li>Shortness of breath</li>
        <li>Chest pain or discomfort</li>
        <li>Nausea or abdominal distress</li>
        <li>Dizziness or lightheadedness</li>
        <li>Fear of losing control or dying</li>
      </ul>

      <h3>Coping Strategies</h3>
      
      <h4>Immediate Techniques</h4>
      <p><strong>Deep Breathing:</strong> Practice slow, deep breaths to help calm your nervous system.</p>
      <p><strong>Grounding Techniques:</strong> Focus on your senses - what you can see, hear, touch, smell, and taste.</p>
      <p><strong>Positive Self-Talk:</strong> Remind yourself that the panic attack will pass and you are safe.</p>

      <h4>Long-term Management</h4>
      <ul>
        <li>Regular exercise and physical activity</li>
        <li>Adequate sleep and rest</li>
        <li>Limiting caffeine and alcohol</li>
        <li>Mindfulness and meditation practices</li>
        <li>Professional therapy (CBT is particularly effective)</li>
      </ul>

      <h3>When to Seek Help</h3>
      <p>If panic attacks are frequent, interfering with daily life, or causing you to avoid certain situations, it's important to seek professional help. A mental health professional can provide proper diagnosis and treatment.</p>
    `
    },
    {
        id: '3',
        slug: 'psychiatric-consultation-expectations',
        title: 'What To Expect From a Psychiatric Consultation',
        description: 'A comprehensive guide to understanding what happens during your first psychiatric consultation and how to prepare.',
        category: 'Depression',
        tags: ['Psychiatry', 'Mental Health', 'Consultation'],
        readTime: '5 mins read',
        image: '/articles/psychiatric-consultation.jpg',
        author: 'Dr. Emily Rodriguez',
        publishedDate: '2026-01-01',
        content: `
      <h2>Your First Psychiatric Consultation</h2>
      <p>Taking the step to see a psychiatrist can feel daunting, but knowing what to expect can help ease your anxiety and make the experience more productive.</p>

      <h3>Before Your Appointment</h3>
      
      <h4>Preparation Steps</h4>
      <ul>
        <li>Write down your symptoms and when they started</li>
        <li>List all medications and supplements you're taking</li>
        <li>Note any family history of mental health conditions</li>
        <li>Prepare questions you want to ask</li>
        <li>Bring relevant medical records if available</li>
      </ul>

      <h3>During the Consultation</h3>
      
      <h4>Initial Assessment</h4>
      <p>The psychiatrist will ask detailed questions about:</p>
      <ul>
        <li>Your current symptoms and concerns</li>
        <li>Your medical and psychiatric history</li>
        <li>Family history of mental health conditions</li>
        <li>Current life circumstances and stressors</li>
        <li>Sleep patterns, appetite, and energy levels</li>
        <li>Substance use (alcohol, drugs, tobacco)</li>
      </ul>

      <h4>Mental Status Examination</h4>
      <p>The psychiatrist will observe and assess:</p>
      <ul>
        <li>Your appearance and behavior</li>
        <li>Mood and affect</li>
        <li>Thought processes and content</li>
        <li>Cognitive functioning</li>
        <li>Insight and judgment</li>
      </ul>

      <h3>Diagnosis and Treatment Plan</h3>
      <p>Based on the assessment, the psychiatrist will:</p>
      <ul>
        <li>Provide a preliminary diagnosis</li>
        <li>Discuss treatment options (medication, therapy, or both)</li>
        <li>Explain potential side effects of medications</li>
        <li>Set goals for treatment</li>
        <li>Schedule follow-up appointments</li>
      </ul>

      <h3>After the Consultation</h3>
      <p>Remember that treatment is a collaborative process. Be open with your psychiatrist about how you're feeling and any concerns about your treatment plan. Recovery takes time, and adjustments may be needed along the way.</p>
    `
    },
    {
        id: '4',
        slug: 'breakup-recovery-guide',
        title: 'How to Get Over a Breakup: Personal Guide to Move On After a Breakup',
        description: 'Learn practical steps to overcome breakup pain, move on healthily, and rebuild your life. Expert advice on dealing with heartbreak.',
        category: 'Relationship Struggles',
        tags: ['Relationships', 'Breakup', 'Healing'],
        readTime: '7 mins read',
        image: '/articles/breakup-recovery.jpg',
        author: 'Dr. Lisa Anderson',
        publishedDate: '2025-12-28',
        content: `
      <h2>Healing After a Breakup</h2>
      <p>Breakups are among life's most painful experiences. Whether the relationship lasted months or years, the end can leave you feeling lost, hurt, and uncertain about the future.</p>

      <h3>The Grieving Process</h3>
      <p>It's important to understand that grieving a relationship is normal and necessary. You may experience:</p>
      <ul>
        <li>Denial and disbelief</li>
        <li>Anger and resentment</li>
        <li>Bargaining and "what ifs"</li>
        <li>Sadness and depression</li>
        <li>Acceptance and moving forward</li>
      </ul>

      <h3>Practical Steps for Healing</h3>
      
      <h4>1. Allow Yourself to Feel</h4>
      <p>Don't suppress your emotions. Cry if you need to, journal your thoughts, or talk to trusted friends. Acknowledging your pain is the first step to healing.</p>

      <h4>2. Limit Contact</h4>
      <p>Consider implementing a "no contact" period. This gives you space to heal without constant reminders of your ex.</p>

      <h4>3. Remove Reminders</h4>
      <p>Put away photos, gifts, and items that trigger painful memories. You don't have to throw them away, but storing them out of sight can help.</p>

      <h4>4. Lean on Your Support System</h4>
      <p>Spend time with friends and family who care about you. Their support can be invaluable during this difficult time.</p>

      <h4>5. Focus on Self-Care</h4>
      <ul>
        <li>Maintain a regular sleep schedule</li>
        <li>Eat nutritious meals</li>
        <li>Exercise regularly</li>
        <li>Practice mindfulness or meditation</li>
        <li>Engage in hobbies you enjoy</li>
      </ul>

      <h4>6. Avoid Unhealthy Coping Mechanisms</h4>
      <p>Resist the urge to numb the pain with alcohol, drugs, or rebound relationships. These provide temporary relief but can delay healing.</p>

      <h3>Rebuilding Your Life</h3>
      <p>As time passes, focus on rediscovering yourself. Try new activities, set personal goals, and remember that this experience, while painful, can lead to personal growth.</p>

      <h3>When to Seek Professional Help</h3>
      <p>If you're experiencing prolonged depression, difficulty functioning in daily life, or thoughts of self-harm, please reach out to a mental health professional.</p>
    `
    },
    {
        id: '5',
        slug: 'writing-affirmations-guide',
        title: 'How to Write Affirmations That Actually Work: Your Complete Guide',
        description: 'Learn how to write powerful positive affirmations that work for you. Step-by-step guide with Indian cultural context. Examples and proven techniques.',
        category: 'Anxiety disorders',
        tags: ['Self-Help', 'Affirmations', 'Positive Thinking'],
        readTime: '6 mins read',
        image: '/articles/affirmations.jpg',
        author: 'Dr. Priya Sharma',
        publishedDate: '2025-12-25',
        content: `
      <h2>The Power of Affirmations</h2>
      <p>Affirmations are positive statements that can help you challenge and overcome self-sabotaging and negative thoughts. When practiced regularly, they can rewire your brain and change your mindset.</p>

      <h3>How Affirmations Work</h3>
      <p>Affirmations work by:</p>
      <ul>
        <li>Activating the reward centers in your brain</li>
        <li>Creating new neural pathways</li>
        <li>Reducing stress and anxiety</li>
        <li>Boosting self-confidence</li>
        <li>Improving focus and motivation</li>
      </ul>

      <h3>Writing Effective Affirmations</h3>
      
      <h4>1. Use Present Tense</h4>
      <p>Write affirmations as if they're already true. Instead of "I will be confident," say "I am confident."</p>

      <h4>2. Keep Them Positive</h4>
      <p>Focus on what you want, not what you don't want. Say "I am calm and peaceful" rather than "I am not anxious."</p>

      <h4>3. Make Them Personal</h4>
      <p>Use "I" statements to make affirmations personal and meaningful to you.</p>

      <h4>4. Be Specific</h4>
      <p>Vague affirmations are less effective. Be specific about what you want to achieve or feel.</p>

      <h4>5. Include Emotion</h4>
      <p>Add feeling words to make affirmations more powerful. "I am joyfully pursuing my goals" is stronger than "I am pursuing my goals."</p>

      <h3>Examples of Powerful Affirmations</h3>
      
      <h4>For Confidence</h4>
      <ul>
        <li>"I am confident in my abilities and trust my decisions"</li>
        <li>"I believe in myself and my potential"</li>
        <li>"I am worthy of success and happiness"</li>
      </ul>

      <h4>For Anxiety</h4>
      <ul>
        <li>"I am calm, peaceful, and centered"</li>
        <li>"I release worry and embrace tranquility"</li>
        <li>"I trust in my ability to handle whatever comes my way"</li>
      </ul>

      <h4>For Self-Love</h4>
      <ul>
        <li>"I am worthy of love and respect"</li>
        <li>"I accept myself completely as I am"</li>
        <li>"I treat myself with kindness and compassion"</li>
      </ul>

      <h3>How to Practice Affirmations</h3>
      <ul>
        <li>Repeat them daily, preferably in the morning</li>
        <li>Say them out loud with conviction</li>
        <li>Write them in a journal</li>
        <li>Create visual reminders (sticky notes, phone wallpaper)</li>
        <li>Combine with visualization</li>
      </ul>

      <h3>Be Patient</h3>
      <p>Remember, affirmations work through repetition and consistency. Don't expect overnight changes. Give yourself time to internalize these positive messages.</p>
    `
    }
];

export const categories = [
    'All',
    'Addiction',
    'Adult ADHD',
    'Anger management',
    'Anger & Frustration',
    'Anxiety disorders',
    'Bipolar disorder',
    'Confusion about identity',
    'Depression',
    'Depressive disorders',
    'Lack of Motivation',
    'Negative thinking',
    'Relationship Struggles'
];
