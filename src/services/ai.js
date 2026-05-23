import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * AI Service for Mail-E
 * Extracts structured placement intelligence using Google Gemini API.
 * Includes a robust rule-based fallback when GEMINI_API_KEY is not configured.
 */

const SYSTEM_PROMPT = `
You are the AI Placement Intelligence Engine for Mail-E.
Analyze the email content and extract structured placement information.

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "category": "placement" | "interview" | "assessment" | "other",
  "priority": "high" | "medium" | "low",
  "company": string | null,
  "role": string | null,
  "package": string | null,
  "location": string | null,
  "assessmentDate": string | null,
  "interviewDate": string | null,
  "applicationDeadline": string | null,
  "eligibility": string[],
  "action": string | null,
  "applicationLink": string | null
}
`;

/**
 * Pre-Filter: Fast keyword heuristic to reject noise (food, ads, discounts) without LLM cost
 */
export function preFilterEmail(subject = '', body = '') {
  const content = `${subject} ${body}`.toLowerCase();

  // Noise patterns
  const noisePatterns = [
    /swiggy|zomato|domino'?s|pizza|burger/i,
    /uber\s*eats|ola\s*cabs|rapido/i,
    /flat\s*\d+%\s*off|discount\s*coupon|promo\s*code|sale\s*ends/i,
    /newsletter\s*digest|unsubscribe\s*here/i,
    /credit\s*card\s*offer|personal\s*loan|cashback/i
  ];

  for (const pattern of noisePatterns) {
    if (pattern.test(subject) && !/placement|campus|interview|recruitment|drive/i.test(subject)) {
      return {
        isRelevant: false,
        reason: 'Detected marketing/promotional noise'
      };
    }
  }

  // Positive recruitment signals
  const placementKeywords = [
    'placement', 'campus drive', 'recruitment', 'hiring challenge',
    'coding test', 'assessment', 'interview', 'shortlisted', 'shortlist',
    'ctc', 'lpa', 'eligibility', 'stipend', 'internship', 'software engineer'
  ];

  const matchedKeywords = placementKeywords.filter(k => content.includes(k));

  if (matchedKeywords.length > 0) {
    return {
      isRelevant: true,
      reason: `Found placement keywords: ${matchedKeywords.slice(0, 3).join(', ')}`
    };
  }

  return {
    isRelevant: false,
    reason: 'No placement or recruitment keywords detected'
  };
}

