import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export type AIAction = 
  | 'summarize' 
  | 'improve' 
  | 'fix_grammar' 
  | 'continue' 
  | 'brainstorm' 
  | 'shorten' 
  | 'lengthen' 
  | 'change_tone_professional' 
  | 'change_tone_casual';

export async function performAIAction(action: AIAction, content: string, title?: string): Promise<string> {
  let prompt = "";

  switch (action) {
    case 'summarize':
      prompt = `Summarize the following content concisely while preserving the core meaning: \n\n${content}`;
      break;
    case 'improve':
      prompt = `Improve the writing of the following content. Make it clearer, more engaging, and more professional while keeping the original intent: \n\n${content}`;
      break;
    case 'fix_grammar':
      prompt = `Fix any grammar, spelling, and punctuation errors in the following content: \n\n${content}`;
      break;
    case 'continue':
      prompt = `Continue writing based on the following content. Maintain the same style and tone: \n\n${content}`;
      break;
    case 'brainstorm':
      prompt = `Based on the following idea titled "${title || 'Untitled'}", brainstorm 5 related concepts, experiments, or next steps: \n\n${content}`;
      break;
    case 'shorten':
      prompt = `Make the following content significantly shorter and more concise: \n\n${content}`;
      break;
    case 'lengthen':
      prompt = `Expand on the following content by adding more detail, examples, and depth: \n\n${content}`;
      break;
    case 'change_tone_professional':
      prompt = `Rewrite the following content in a professional and formal tone: \n\n${content}`;
      break;
    case 'change_tone_casual':
      prompt = `Rewrite the following content in a casual and friendly tone: \n\n${content}`;
      break;
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are an expert writing assistant and creative thinker. Provide high-quality, polished text based on the user's request. Return ONLY the modified text without any introductory or concluding remarks.",
    },
  });

  return response.text || "";
}

export async function generateGoalRoadmap(goalTitle: string, goalDescription: string) {
  const prompt = `I have a goal: "${goalTitle}". 
  Description: ${goalDescription}
  
  Please help me achieve this goal by suggesting:
  1. Needed knowledge (concepts, mental models, or skills to learn).
  2. Ideas (creative approaches or specific projects to start).
  3. To-do list (concrete, actionable steps).
  
  Provide the response in a structured JSON format.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          knowledge: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of knowledge areas or skills needed."
          },
          ideas: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of creative ideas or projects."
          },
          todos: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of actionable to-do items."
          }
        },
        required: ["knowledge", "ideas", "todos"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
