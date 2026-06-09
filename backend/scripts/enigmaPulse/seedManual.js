import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import { getAdminFirestore } from '../../src/services/firebaseAdmin.js';

const SAMPLE_RIDDLES = [
    {
        text: "What has keys but can't open locks?",
        options: ["Piano", "Map", "Skeleton", "Safe"],
        correctIndex: 0,
        acceptedAnswers: ["piano", "a piano"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What has to be broken before you can use it?",
        options: ["Egg", "Glass", "Promise", "Silence"],
        correctIndex: 0,
        acceptedAnswers: ["egg", "an egg"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "I’m tall when I’m young, and I’m short when I’m old. What am I?",
        options: ["Candle", "Tree", "Person", "Shadow"],
        correctIndex: 0,
        acceptedAnswers: ["candle", "a candle"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What month of the year has 28 days?",
        options: ["February", "March", "All of them", "August"],
        correctIndex: 2,
        acceptedAnswers: ["all", "all of them", "every month"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What is full of holes but still holds water?",
        options: ["Sponge", "Sieve", "Bucket", "Net"],
        correctIndex: 0,
        acceptedAnswers: ["sponge", "a sponge"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What question can you never answer yes to?",
        options: ["Are you asleep?", "Are you hungry?", "Is it raining?", "Are you human?"],
        correctIndex: 0,
        acceptedAnswers: ["are you asleep", "sleeping"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What is always in front of you but can’t be seen?",
        options: ["Future", "Wind", "Air", "Shadow"],
        correctIndex: 0,
        acceptedAnswers: ["future", "the future"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "There’s a one-story house in which everything is yellow. What color are the stairs?",
        options: ["Yellow", "White", "There are no stairs", "Blue"],
        correctIndex: 2,
        acceptedAnswers: ["none", "no stairs", "there are no stairs"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What can you break, even if you never pick it up or touch it?",
        options: ["Promise", "Heart", "Silence", "Mirror"],
        correctIndex: 0,
        acceptedAnswers: ["promise", "a promise"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What goes up but never comes down?",
        options: ["Age", "Balloon", "Smoke", "Temperature"],
        correctIndex: 0,
        acceptedAnswers: ["age", "your age"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "A man dies of old age on his 25th birthday. How is this possible?",
        options: ["Leap Year", "Time Travel", "Botched Surgery", "Different Planet"],
        correctIndex: 0,
        acceptedAnswers: ["leap year", "born on february 29"],
        category: "General Knowledge",
        difficulty: "easy"
    },
    {
        text: "What has one eye but can’t see?",
        options: ["Needle", "Storm", "Potato", "Blind person"],
        correctIndex: 0,
        acceptedAnswers: ["needle", "a needle"],
        category: "General Knowledge",
        difficulty: "easy"
    }
];

async function main() {
    const db = getAdminFirestore();
    if (!db) {
        console.error('Firestore Admin not configured');
        process.exit(1);
    }
    
    console.log(`Seeding ${SAMPLE_RIDDLES.length} riddles...`);
    const batch = db.batch();
    
    for (const r of SAMPLE_RIDDLES) {
        const ref = db.collection('questions').doc();
        batch.set(ref, {
            ...r,
            active: true,
            createdAt: new Date(),
            source: 'manual-seed',
            normalizedAnswer: r.acceptedAnswers[0]
        });
    }
    
    await batch.commit();
    console.log('Seeding completed successfully!');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
