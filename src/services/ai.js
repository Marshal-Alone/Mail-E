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

/**
 * Analyze an email using Gemini API or rule-based fallback
 */
export async function analyzeEmailWithAI(subject, body, sender) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey && apiKey.trim() !== '') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `
${SYSTEM_PROMPT}

Sender: ${sender}
Subject: ${subject}
Email Content:
${body.slice(0, 3000)}
`;

      const result = await model.generateContent(prompt);
      let responseText = result.response.text().trim();

      if (responseText.startsWith('```json')) {
        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (responseText.startsWith('```')) {
        responseText = responseText.replace(/^```\s*/i, '').replace(/\s*```$/, '');
      }

      return JSON.parse(responseText);
    } catch (err) {
      console.warn('[AI Service] Gemini call failed, using rule-based fallback:', err.message);
    }
  }

  // Rule-based fallback parser
  return extractWithRules(subject, body, sender);
}

/**
 * Lightweight rule-based extractor when Gemini API key is not present or offline
 */
function extractWithRules(subject, body, sender) {
  const content = `${subject} ${body}`;

  // Company detection
  let company = 'Campus Recruiter';
  const companyMatch = subject.match(/(?:at|for|by|from)\s+([A-Z][A-Za-z0-9&.\s]{2,20})/i) ||
                       body.match(/Company\s*:\s*([^\n\r,]+)/i);
  if (companyMatch) {
    company = companyMatch[1].trim();
  } else if (/tcs|tata\s*consultancy/i.test(content)) {
    company = 'Tata Consultancy Services (TCS)';
  } else if (/amazon/i.test(content)) {
    company = 'Amazon';
  } else if (/uber/i.test(content)) {
    company = 'Uber';
  }

  // Package / CTC detection (e.g. ₹7.5 LPA, 12 LPA, Rs. 6,00,000)
  let ctc = 'Competitive';
  const ctcMatch = content.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|l\b)/i) ||
                   content.match(/(?:ctc|package|compensation)[:\s]+([^\n\r,;]+)/i);
  if (ctcMatch) {
    ctc = ctcMatch[0].trim();
  }

  // Role detection
  let role = 'Software Engineer';
  const roleMatch = content.match(/(?:role|profile|position)[:\s]+([^\n\r,;]+)/i);
  if (roleMatch) {
    role = roleMatch[1].trim();
  }

  // Deadline detection
  let deadline = null;
  const deadlineMatch = content.match(/(?:deadline|before|last date|apply by)[:\s]+([^\n\r]+)/i);
  if (deadlineMatch) {
    deadline = deadlineMatch[1].trim().slice(0, 30);
  }

  // Category determination
  const isInterview = /interview|shortlist|slot confirmation/i.test(content);

  return {
    category: isInterview ? 'interview' : 'placement',
    priority: 'high',
    company,
    role,
    package: ctc,
    location: 'Pan-India',
    assessmentDate: null,
    interviewDate: isInterview ? 'Scheduled' : null,
    applicationDeadline: deadline || 'Check official notice',
    eligibility: ['Engineering Graduates (2026 Batch)'],
    action: 'Complete portal registration before the deadline',
    applicationLink: null
  };
}
