# HumanBoard Second-Subconscious Core Loop & Insight Engine Spec

This specification defines the core architecture, input classification, synthesis cycles, and interactive payoffs of the **Second-Subconscious Core Loop** and **Insight Engine** for HumanBoard. 

The core rule of HumanBoard is: **If users input and get only storage, they stop. If they input and feel seen, they continue.** Surprise and insight come from cognitive tension, not neatness.

---

## 1. Input Philosophy: Capturing Tension vs. Neatness

HumanBoard does not aim to capture clean task lists. It thrives on raw, unpolished cognitive material. The system actively prompts for and analyzes inputs that are **unfinished, emotional, contradictory, repetitive, uncertain, or desire-based**.

### Good vs. Bad Inputs
* **Bad Input (task-centric)**: *"Clean the desk, update the budget spreadsheet, reply to email."* (Passive storage).
* **Good Input (tension-centric)**:
  * *"I want to save money but keep spending on gourmet food."* (Contradictory / Desire)
  * *"Pleiku feels good right now, but I doubt its long-term economic prospects."* (Uncertain / Emotional)
  * *"I keep avoiding the layout design for the portfolio case."* (Repetitive / Tension)
  * *"I am drawn to study hardware design lately, but don't know why."* (Uncertain / Trace)

---

## 2. The 6 Best Subconscious Rewards

To make the user feel seen, the system returns six types of immediate and periodic cognitive payoffs:

1. **Instant Compression**: Dumps are instantly processed into a 1-line summary, a detected theme, and a likely next step.
2. **Memory Return**: Contextual links back to prior notes (e.g., *"This connects to a thought you recorded 12 days ago about career autonomy."*).
3. **Pattern Detection**: Tracking recurring loops (e.g., *"You've circled this specific career anxiety 5 times this month."*).
4. **Contradiction Spotting**: Identifying conflicts in logic, values, or behavior (e.g., *"You noted you want freedom, but keep choosing high-security, low-autonomy paths."*).
5. **Unexpected Pairing**: Connecting notes, projects, or emotions that don't look related at first glance (e.g., matching a creative block in coding to a physical fatigue pattern recorded elsewhere).
6. **Identity Mirror**: Periodic distillation of cognitive orbits (e.g., *"Lately your mind is orbiting: money, belonging, mobility."*).

---

## 3. Product Mechanics: Two-Layer Output Processing

Upon receiving any capture, the processing engine operates on a **two-layer payoff formula** designed to make the user think: *"Damn, this thing sees something."*

```
┌────────────────────────────────────────────────────────────────────────┐
│                          RAW USER CAPTURE                              │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          PROCESSING ENGINE                             │
│                  "What is hidden inside this note?"                    │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
                   ▼                               ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│           LAYER 1: USEFUL            │ │      LAYER 2: INTRIGUING      │
│  "What this is about / Next steps"   │ │ "What it connects to / Hidden"│
├──────────────────────────────────────┤ ├───────────────────────────────┤
│ • 1-line summary                     │ │ • Active patterns detected    │
│ • Tag / theme suggestions            │ │ • Contradiction check         │
│ • Immediate next step                │ │ • Old memory link / analogy   │
│                                      │ │ • Testable hypothesis         │
└──────────────────────────────────────┘ └───────────────────────────────┘
```

### The Output Formula:
For every note, the system attempts to answer:
* **What this is about** (Layer 1 - Summary & Theme)
* **Why it matters** (Layer 2 - Hypothesis & Tension)
* **What it connects to** (Layer 2 - Memory Link & Pairings)
* **What's hidden inside it** (Layer 2 - Contradiction & Pattern)

#### Example Output:
* **User Input**: *"I like the slow pace here in Pleiku but there are no tech jobs. I should move back to Saigon."*
* **Layer 1 (Useful)**:
  * *Summary*: You are torn between Pleiku's lifestyle pace and Saigon's economic opportunities.
  * *Theme*: Location & Career Alignment
  * *Next Step*: Draft a list of remote tech companies or freelance contracts that bridge this gap.
* **Layer 2 (Intriguing)**:
  * *Tension*: You're not undecided about Pleiku. You like the nervous-system pace, but doubt its economic future. This tension has appeared in your city/job thoughts twice before (on May 12th and June 2nd).
  * *Hypothesis*: You default to thinking relocation is the only variable, but the real blocker is finding high-autonomy income.

---

## 4. Input Volume Features (Behavioral Triggers)

To encourage ongoing capture, the app implements five core behavioral loops:

1. **Daily Reflection Prompt**: Surfaces a suggestively targeted query every evening (e.g., *"What kept returning to your mind today?"*).
2. **Loose Capture Inbox**: A central tab optimized for quick captures—supporting text fragments, rapid notes, voice memos, and image context.
3. **Night Synthesis**: A background cron job that evaluates notes while the user is away and outputs: *"While you were away, I found 3 recurring themes."*
4. **Weekly Pattern Report**: A synthesized overview covering obessions, avoided topics, and repeated tensions.
5. **Relevance Resurfacing**: Suppresses noisy notifications, showing old notes *only* when the active search or input context strongly matches.

---

## 5. Inbox Adaptive Dashboard Integration

When the user's Inbox contains no raw notes, it dynamically transforms into an active prompt interface to encourage reflection and bridge the gap between capture and action.

### Suggestive Prompt Carousel Calibration
Prompts are calibrated to target emotional, contradictory, repetitive, or desire-based inputs rather than progress updates:
* **Desire Prompt**: *"What is something you want right now, but feel hesitant to pursue?"*
* **Tension Prompt**: *"What task or topic have you actively avoided thinking about today?"*
* **Repetition Prompt**: *"What loop or question kept returning to your mind in the background today?"*
* **Uncertainty Prompt**: *"What is currently drawing your attention, even if you can't name the reason yet?"*
* **Goal/Project Triggers**: *"What is the main outcome, win, or blocker on project '[Project Title]' today?"*
