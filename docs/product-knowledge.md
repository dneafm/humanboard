# HumanBoard Product Features & Specifications

This document outlines the official features and technical functionality of the HumanBoard application. Use this information to understand and explain how the system works.

## 1. Sleep / Consolidate
- **Function**: Processes raw notes in the Inbox using local AI and turns them into structured Idea nodes.
- **Links**: Automatically links newly created ideas back to their source raw notes via `linkedNoteIds`.
- **Note Cleanup**: Deletes the original raw notes from the Inbox after successful consolidation.
- **Auto-Trigger**: Can automatically trigger in the background if the browser tab becomes hidden and there are at least 3 raw notes in the Inbox.

## 2. Auto-Distill
- **Function**: Automatically processes newly created inbox notes to extract key knowledge and create map ideas immediately (controlled by user settings: off, low, medium, high).

## 3. Incubation Lane & Page
- **Function**: A dashboard to review incubating candidate ideas and capability bets.
- **Workflow Controls**:
  - **Strategic Posture Selector**: Allows categorizing candidates into `Keep Watching`, `Warm Up / Explore`, `Parked / Defer`, or `Ready to Activate`.
  - **Review Cadence Selector**: Allows choosing cadences like Weekly, Bi-weekly, or Monthly/Default.
- **Review Alerts (Automation)**:
  - **Review Overdue Warnings**: Automatically checks the `lastReviewed` timestamp of ideas or bets. If it exceeds the set cadence (Weekly: >7 days, Bi-weekly: >14 days, Monthly/Default: >30 days), a `⚠️ Review Overdue` banner is displayed.
  - **Mark Reviewed**: Updates the candidate's `lastReviewed` date to today's timestamp, clearing the overdue warning.
- **Daily Reflection Carousel**: Loops through reflective prompt categories (Desire, Tension, Repetition, Uncertainty) to let the user enter answers and dump them directly into the inbox as notes.
- **Trigger Insight Synthesis**: An AI utility that digests the vault notes/ideas to identify repetitions, avoided topics, and cognitive tensions, producing a Subconscious Insights Report saved as an Evergreen Reference Idea (tagged `['Insight', 'Subconscious']`).

## 4. Fusion
- **Function**: Synthesizes notes and ideas into public postings, writings, reports, or theses.
- **Source Material Links**: Users link notes and ideas as source materials.
- **AI Generation**: If source materials are linked, enables buttons to generate summaries, central conclusions, and full drafts using the AI model.
- **Workflow Progression**: Features "Mark Ready to Share" (Draft -> Ready status) and "Complete Fusion" (Ready -> Completed status, sets `completedAt`) action buttons to mark drafts completed.

## 5. Idea Map
- **Function**: A D3 force-directed visual map of sections and ideas.
- **Multi-Field Venn Halos**: Ideas can belong to multiple fields (sections) via the `sectionIds` array. The D3 layout links ideas to all parent sections (causing them to float in intersections) and draws overlapping concentric curved halos (Venn diagram curves).
- **AI Auto-Review Map**: An AI utility that reviews the topology of the map, creates new fields/sections if conceptual clusters are identified, re-associates ideas with the most relevant fields, and establishes interconnections (links) between conceptually related ideas.

## 6. User Interface (UI) Navigation & Layout
- **Left Sidebar Navigation**: Provides quick links to navigate the application:
  - **Inbox**: Captured raw thoughts, screenshots, and clippings. Features "Sleep / Consolidate" and the floating Chatbot.
  - **Idea Map**: Visual D3 graph of sections (fields) and ideas. Supports scrolling to zoom, dragging nodes, and hovering to highlight connections.
  - **Ideas**: List view of structured knowledge cards. Allows searching, filtering, and opening details.
  - **Goals & Projects**: Task tracker and roadmap progression board.
  - **Incubation**: Dashboard for watchlist candidates, cadence alerts, and reflection synthesis.
  - **Fusion**: Synthesis draft editor for publishing posts, reports, and theses.
- **Visual Theme & Aesthetics**: Implements a clean, responsive layout supporting:
  - Curated light and dark modes matching OS preferences.
  - Harmonious, HSL-tailored warm colors and premium card shadows.
  - Interactive hover transitions and smooth micro-animations.

## 7. General Behavior Directive
- When users ask about application functionality (e.g., "what automation part of the incubation?" or how a feature works), refer to these official HumanBoard features instead of retrieving unrelated personal notes or ideas from the user's vault to invent an answer.
