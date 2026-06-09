export const MOCK_QUESTIONS = [];

export const CATEGORY_OPTIONS = [
    { value: 'history', label: 'History' },
    { value: 'current_affairs', label: 'Current Affairs' },
];

export const CATEGORIES = CATEGORY_OPTIONS.map((c) => c.value);

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const QUESTION_BANK = {
    history: [
        { text: 'Who was the first President of the United States?', options: ['George Washington', 'Thomas Jefferson', 'Abraham Lincoln', 'John Adams'], correctIndex: 0 },
        { text: 'In which year did World War II end?', options: ['1943', '1945', '1947', '1950'], correctIndex: 1 },
        { text: 'Which ancient civilization built Machu Picchu?', options: ['Maya', 'Aztec', 'Inca', 'Roman'], correctIndex: 2 },
        { text: 'Who wrote the Declaration of Independence?', options: ['Benjamin Franklin', 'George Washington', 'Thomas Jefferson', 'James Madison'], correctIndex: 2 },
        { text: 'The French Revolution began in which year?', options: ['1789', '1776', '1812', '1750'], correctIndex: 0 },
        { text: 'Which empire was ruled by Julius Caesar?', options: ['Greek Empire', 'Roman Republic', 'Ottoman Empire', 'Byzantine Empire'], correctIndex: 1 },
        { text: 'Who was known as the Maid of Orleans?', options: ['Cleopatra', 'Joan of Arc', 'Catherine the Great', 'Marie Curie'], correctIndex: 1 },
        { text: 'The Great Wall is primarily located in which country?', options: ['Japan', 'India', 'China', 'Mongolia'], correctIndex: 2 },
        { text: 'Which war was fought between the North and South regions in the U.S.?', options: ['Revolutionary War', 'Civil War', 'World War I', 'Vietnam War'], correctIndex: 1 },
        { text: 'Who discovered sea route to India via Cape of Good Hope?', options: ['Christopher Columbus', 'Vasco da Gama', 'Ferdinand Magellan', 'Marco Polo'], correctIndex: 1 },
        { text: 'The Berlin Wall fell in which year?', options: ['1985', '1989', '1991', '1995'], correctIndex: 1 },
        { text: 'Who was the first woman Prime Minister of the UK?', options: ['Angela Merkel', 'Margaret Thatcher', 'Theresa May', 'Indira Gandhi'], correctIndex: 1 },
    ],
    current_affairs: [
        { text: 'Which technology is most associated with decentralized digital ledgers?', options: ['Blockchain', 'Bluetooth', 'Quantum RAM', 'NFC'], correctIndex: 0 },
        { text: 'COP climate summits are primarily focused on which issue?', options: ['Global health policy', 'Climate action', 'Space exploration', 'Trade tariffs'], correctIndex: 1 },
        { text: 'What does AI stand for in modern technology discussions?', options: ['Automated Interface', 'Artificial Intelligence', 'Applied Internet', 'Advanced Integration'], correctIndex: 1 },
        { text: 'Which sector is most disrupted by electric vehicle growth?', options: ['Textile', 'Oil and fuel', 'Publishing', 'Hospitality'], correctIndex: 1 },
        { text: 'What is the main objective of cybersecurity?', options: ['Increase social media reach', 'Protect systems and data', 'Reduce internet speed', 'Replace cloud services'], correctIndex: 1 },
        { text: 'Which body often discusses global monetary policy and stability?', options: ['IMF', 'FIFA', 'UNESCO', 'WTO only for sports'], correctIndex: 0 },
        { text: 'The term "inflation" usually refers to what?', options: ['Decrease in prices', 'General rise in prices', 'Population growth', 'Stock split'], correctIndex: 1 },
        { text: '5G is best described as what?', options: ['A satellite', 'A generation of mobile network', 'A cloud storage app', 'A payment protocol'], correctIndex: 1 },
        { text: 'Which energy source is considered renewable?', options: ['Coal', 'Natural gas', 'Solar', 'Diesel'], correctIndex: 2 },
        { text: 'What is a common use case of machine learning today?', options: ['Handwritten map drawing', 'Recommendation systems', 'Manual typewriter repair', 'Compass calibration'], correctIndex: 1 },
        { text: 'Digital payment systems primarily improve what?', options: ['Paper usage', 'Transaction convenience', 'Car mileage', 'File compression'], correctIndex: 1 },
        { text: 'Which global issue is closely linked to food security discussions?', options: ['Climate variability', 'Movie piracy', 'Phone battery size', 'Printer ink prices'], correctIndex: 0 },
    ],
};

CATEGORIES.forEach((cat) => {
    const source = QUESTION_BANK[cat] || [];
    DIFFICULTIES.forEach((diff) => {
        source.forEach((question, i) => {
            MOCK_QUESTIONS.push({
                id: `${cat.replace(/\s/g, '')}_${diff}_${i}`,
                category: cat,
                difficulty: diff,
                text: question.text,
                imageUrl: '',
                options: question.options,
                correctIndex: question.correctIndex,
            });
        });
    });
});

export const getQuestionsForMatch = (category, difficulty, count = 10) => {
    let pool = MOCK_QUESTIONS.filter(q => q.category === category && q.difficulty === difficulty);

    // Safety fallback: if no questions for this category/difficulty, use History

    if (pool.length === 0) {
        pool = MOCK_QUESTIONS.filter(q => q.category === 'history' && q.difficulty === difficulty);
    }

    // Fisher-Yates Shuffle for better randomness
    
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, count);
};
