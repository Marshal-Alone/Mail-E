import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { preFilterEmail } from '../src/services/ai.js';

describe('Mail-E Custom Filter Rules & Heuristics', () => {
  const customRules = {
    blockedSenders: ['contentnc@naukri.com', 'naukri.com', 'digest@internshala.com'],
    blockedKeywords: ['tips to crack', 'aptitude test', 'mock test', 'preparation guide'],
    allowedSenders: ['campus-placements@college.edu'],
    allowedKeywords: ['mandatory placement drive']
  };

  test('Blocks email when sender is in blockedSenders rule (Naukri promotional email)', () => {
    const res = preFilterEmail(
      'Tips to Crack Aptitude Tests for Campus Placements',
      'Learn how to ace your campus recruitment test with our mock series',
      'Naukri Campus Jobs <contentnc@naukri.com>',
      customRules
    );

    assert.strictEqual(res.isRelevant, false);
    assert.match(res.reason, /custom blocked sender/i);
  });

  test('Blocks email when subject matches blockedKeywords rule even if sender is unknown', () => {
    const res = preFilterEmail(
      'Tips to Crack Aptitude Tests for Campus Placements',
      'Sign up today for full preparation guide',
      'random-edtech@somedomain.com',
      customRules
    );

    assert.strictEqual(res.isRelevant, false);
    assert.match(res.reason, /custom noise keyword/i);
  });

  test('Discards IRCTC / travel wallet promotional noise', () => {
    const res = preFilterEmail(
      'IRCTC eWallet Top Up confirmation',
      'Your eWallet balance has been credited with Rs. 500',
      'ticketadmin@irctc.co.in',
      customRules
    );

    assert.strictEqual(res.isRelevant, false);
    assert.match(res.reason, /promotional noise/i);
  });

  test('Passes legitimate campus placement emails', () => {
    const res = preFilterEmail(
      'URGENT: TCS Digital & Ninja Campus Recruitment Drive 2026 - Registration Mandatory',
      'TCS is hiring for 2026 batch. Role: Software Engineer. CTC: 7.5 LPA. Registration mandatory.',
      'recruiter-campus@tcs.com',
      customRules
    );

    assert.strictEqual(res.isRelevant, true);
    assert.match(res.reason, /Found placement keywords/i);
  });

  test('Whitelist sender passes even if matching general noise pattern', () => {
    const res = preFilterEmail(
      'Campus Newsletter Digest',
      'Weekly placement updates',
      'campus-placements@college.edu',
      customRules
    );

    assert.strictEqual(res.isRelevant, true);
    assert.match(res.reason, /whitelisted sender/i);
  });
});
