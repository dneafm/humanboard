import { create } from 'zustand';

export type Note = {
  id: string;
  content: string;
  createdAt: string;
};

export type IdeaStage = 'Seed' | 'Sprouting' | 'Evergreen' | 'Archived';

export type IdeaType = 'Concept' | 'Principle' | 'Reference';

export interface Comment {
  id: string;
  selectedText: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export type Section = {
  id: string;
  name: string;
  color: string;
};

export type Idea = {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: IdeaType;
  stage: IdeaStage;
  sectionId?: string;
  confidence: number; // 1-10
  maturity: number; // 0-100
  nextAction?: string;
  lastReviewed: string;
  linkedNoteIds: string[];
  relatedIdeaIds: string[];
  coverImage?: string;
  comments?: Comment[];
};

export type Project = {
  id: string;
  title: string;
  description: string;
  sourceIdeaId: string;
  status: 'Active' | 'Paused' | 'Completed';
  experiments: Experiment[];
};

export type Experiment = {
  id: string;
  title: string;
  status: 'Planned' | 'Running' | 'Concluded';
  result?: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string;
  status: 'Active' | 'Paused' | 'Completed';
  createdAt: string;
  roadmap?: {
    knowledge: string[];
    ideas: string[];
    todos: string[];
  };
};

interface AppState {
  notes: Note[];
  ideas: Idea[];
  projects: Project[];
  sections: Section[];
  goals: Goal[];
  isDarkMode: boolean;
  addNote: (content: string) => void;
  deleteNote: (id: string) => void;
  addIdea: (idea: Omit<Idea, 'id' | 'lastReviewed'>) => void;
  updateIdea: (id: string, updates: Partial<Idea>) => void;
  addProject: (project: Omit<Project, 'id'>) => void;
  addSection: (section: Omit<Section, 'id'>) => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  toggleDarkMode: () => void;
}

const initialNotes: Note[] = [
  { id: 'n1', content: 'What if we used LLMs to automatically categorize personal expenses based on receipt photos?', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: 'n2', content: 'Read that article about local-first software. Need to think about how it applies to my note-taking habits.', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
  { id: 'n3', content: 'Idea: A smart mirror that only shows positive affirmations when you look stressed.', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
];

const initialSections: Section[] = [
  { id: 'sec1', name: 'Technology & Tools', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { id: 'sec2', name: 'Finance', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { id: 'sec3', name: 'Health & Wellness', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  { id: 'sec4', name: 'Lifestyle & Home', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
];

const initialIdeas: Idea[] = [
  {
    id: 'i1',
    title: 'Local-First Personal CRM',
    summary: 'A CRM for personal relationships that stores all data locally and uses small on-device models to suggest when to reach out.',
    content: 'People are tired of their personal data being in the cloud. A local-first CRM would sync via peer-to-peer (like CRDTs) and use a local LLM to analyze text messages (with permission) to suggest check-ins. \n\nKey features:\n- No cloud backend required\n- E2E encrypted sync\n- Local inference for "sentiment" analysis on recent interactions.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec1',
    confidence: 7,
    maturity: 45,
    nextAction: 'Research CRDT libraries for React Native',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    linkedNoteIds: ['n2'],
    relatedIdeaIds: ['i5'],
  },
  {
    id: 'i2',
    title: 'AI-Powered Expense Categorizer',
    summary: 'Automatically sort expenses from receipts using vision models.',
    content: 'Instead of manually entering data, just snap a picture. The vision model extracts amount, vendor, and date, and an LLM categorizes it based on past behavior.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec2',
    confidence: 5,
    maturity: 15,
    nextAction: 'Test Gemini Vision API with 5 sample receipts',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    linkedNoteIds: ['n1'],
    relatedIdeaIds: ['i4', 'i8'],
  },
  {
    id: 'i3',
    title: 'Biometric Sleep Optimizer',
    summary: 'Adjust room temperature and lighting in real-time based on deep sleep cycles.',
    content: 'Using data from wearables (Oura, Apple Watch), this system would talk to smart home devices (Nest, Hue) to optimize the environment for deep sleep. If deep sleep is detected, lower temp by 2 degrees. If REM is detected, start a very slow sunrise simulation.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec3',
    confidence: 8,
    maturity: 60,
    nextAction: 'Check HomeKit API for real-time temp control',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: ['i7', 'i6'],
  },
  {
    id: 'p-motto-1',
    title: 'The Map is Not the Territory',
    summary: 'A reminder that models of reality are not reality itself.',
    content: 'Our mental models, theories, and perceptions are simplifications. Always look for the nuances that the model misses. Useful for avoiding over-confidence in data or rigid thinking.',
    type: 'Principle',
    stage: 'Evergreen',
    sectionId: 'sec1',
    confidence: 10,
    maturity: 100,
    lastReviewed: new Date().toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'p-motto-2',
    title: 'Invert, Always Invert',
    summary: 'To solve a problem, think about how to fail first.',
    content: 'Instead of asking "How can I be successful?", ask "What would guarantee failure?" and then avoid those things. A powerful mental model from Charlie Munger.',
    type: 'Principle',
    stage: 'Evergreen',
    sectionId: 'sec2',
    confidence: 10,
    maturity: 100,
    lastReviewed: new Date().toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i4',
    title: 'Decentralized Subscription Manager',
    summary: 'Track and cancel recurring payments without giving a third-party access to your bank login.',
    content: 'Uses local browser extension to scan for "subscription" keywords in your email and bank statements (locally) and provides a dashboard to manage them. No data ever leaves your machine.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec2',
    confidence: 6,
    maturity: 20,
    nextAction: 'Draft privacy-first architecture diagram',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i5',
    title: 'Voice-to-Code IDE Plugin',
    summary: 'Write complex boilerplate and logic using natural language voice commands.',
    content: 'A VS Code plugin that listens for specific triggers. "Add a React component named UserProfile with tailwind classes for a card layout" would generate the code instantly. Focus on accessibility for developers with RSI.',
    type: 'Concept',
    stage: 'Evergreen',
    sectionId: 'sec1',
    confidence: 9,
    maturity: 85,
    nextAction: 'Refine voice trigger sensitivity',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i6',
    title: 'Smart Garden Irrigation',
    summary: 'Predictive watering based on soil moisture sensors and hyper-local weather forecasts.',
    content: 'Connect ESP32 sensors to a central dashboard. If the forecast says it will rain in 2 hours, skip the morning watering cycle even if soil is dry.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec4',
    confidence: 7,
    maturity: 50,
    nextAction: 'Order 3 more moisture sensors',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i7',
    title: 'Mindfulness Meditation VR',
    summary: 'Immersive VR environments that react to your heart rate for deeper meditation.',
    content: 'If your heart rate is high, the VR environment is a bit chaotic (windy, dark). As you breathe and heart rate drops, the environment becomes calm, sunny, and serene. Real-time biofeedback loop.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec3',
    confidence: 4,
    maturity: 10,
    nextAction: 'Research WebXR heart rate integration',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i8',
    title: 'Personal Carbon Tracker',
    summary: 'Automatically estimate carbon footprint from purchase history.',
    content: 'Integrate with the Expense Categorizer (i2). If you buy gas, calculate CO2. If you buy a flight, calculate CO2. Provide a monthly "Carbon Budget".',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec4',
    confidence: 6,
    maturity: 35,
    nextAction: 'Find a reliable CO2 estimation API',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    linkedNoteIds: ['n1'],
    relatedIdeaIds: ['i2'],
  }
];

const initialProjects: Project[] = [
  {
    id: 'p1',
    title: 'Local CRM Prototype',
    description: 'Build a basic React Native app with WatermelonDB for local storage.',
    sourceIdeaId: 'i1',
    status: 'Active',
    experiments: [
      { id: 'e1', title: 'Test WatermelonDB sync performance', status: 'Running' }
    ]
  }
];

export const useAppStore = create<AppState>((set) => ({
  notes: initialNotes,
  ideas: initialIdeas,
  projects: initialProjects,
  sections: initialSections,
  goals: [],
  isDarkMode: false,
  addNote: (content) => set((state) => ({
    notes: [{ id: Math.random().toString(36).substring(7), content, createdAt: new Date().toISOString() }, ...state.notes]
  })),
  deleteNote: (id) => set((state) => ({
    notes: state.notes.filter(n => n.id !== id)
  })),
  addIdea: (idea) => set((state) => ({
    ideas: [{ ...idea, id: Math.random().toString(36).substring(7), lastReviewed: new Date().toISOString() }, ...state.ideas]
  })),
  updateIdea: (id, updates) => set((state) => ({
    ideas: state.ideas.map(i => i.id === id ? { ...i, ...updates } : i)
  })),
  addProject: (project) => set((state) => ({
    projects: [{ ...project, id: Math.random().toString(36).substring(7) }, ...state.projects]
  })),
  addSection: (section) => set((state) => ({
    sections: [...state.sections, { ...section, id: Math.random().toString(36).substring(7) }]
  })),
  addGoal: (goal) => set((state) => ({
    goals: [{ ...goal, id: Math.random().toString(36).substring(7), createdAt: new Date().toISOString() }, ...state.goals]
  })),
  updateGoal: (id, updates) => set((state) => ({
    goals: state.goals.map(g => g.id === id ? { ...g, ...updates } : g)
  })),
  deleteGoal: (id) => set((state) => ({
    goals: state.goals.filter(g => g.id !== id)
  })),
  toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
}));
