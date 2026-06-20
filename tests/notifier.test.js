import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatTelegramAlert } from '../src/services/telegram.js';
import { formatSmsAlert } from '../src/services/sms.js';

describe('Mail-E Notification Architecture Tests', () => {

  const sampleAnalysis = {
    company: 'Tata Consultancy Services',
    role: 'Digital Specialist Engineer',
    package: '₹7.5 LPA',
    assessmentDate: '2026-10-15',
    applicationDeadline: '2026-10-10',
    eligibility: ['B.Tech CSE/IT', 'CGPA >= 7.0'],
    location: 'Pune / Pan-India',
    action: 'Complete portal registration before October 10'
  };

  test('formatTelegramAlert formats rich markdown with company, role, CTC, and action', () => {
    const message = formatTelegramAlert(sampleAnalysis);

    assert.ok(message.includes('MAIL-E PLACEMENT ALERT'), 'Should contain banner header');
    assert.ok(message.includes('Tata Consultancy Services'), 'Should contain company name');
    assert.ok(message.includes('Digital Specialist Engineer'), 'Should contain role');
    assert.ok(message.includes('₹7.5 LPA'), 'Should contain package');
    assert.ok(message.includes('ACTION REQUIRED:'), 'Should contain action callout');
  });

  test('formatSmsAlert formats concise SMS message within character limits', () => {
    const sms = formatSmsAlert(sampleAnalysis);

    assert.ok(sms.includes('[MAIL-E PLACEMENT ALERT]'), 'Should contain SMS tag');
    assert.ok(sms.includes('Tata Consultancy Services'), 'Should contain company');
    assert.ok(sms.includes('₹7.5 LPA'), 'Should contain package');
    assert.ok(sms.length < 300, `SMS should be compact (length: ${sms.length})`);
  });

  test('Promise.allSettled() handles dual-channel notifications concurrently and isolates failures', async () => {
    const orderOfCompletion = [];

    // Simulate Telegram dispatch (faster, 20ms)
    const telegramTask = new Promise((resolve) => {
      setTimeout(() => {
        orderOfCompletion.push('telegram');
        resolve({ success: true, status: 'sent', deliveryId: 'TG-1001' });
      }, 20);
    });

    // Simulate SMS dispatch via phone gateway (slower or offline, 60ms)
    const smsTask = new Promise((resolve) => {
      setTimeout(() => {
        orderOfCompletion.push('sms');
        resolve({ success: true, status: 'simulated', deliveryId: 'SIM-SMS-2002' });
      }, 60);
    });

    const startTime = Date.now();
    const results = await Promise.allSettled([telegramTask, smsTask]);
    const duration = Date.now() - startTime;

    assert.ok(duration < 150, `Execution should be concurrent, took ${duration}ms`);
    assert.equal(results.length, 2, 'Should receive 2 settled results');
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[0].value.deliveryId, 'TG-1001');
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(results[1].value.status, 'simulated');
  });

  test('AbortSignal.timeout aborts long-running gateway requests without hanging', async () => {
    const timeoutSignal = AbortSignal.timeout(50);

    const hangingRequest = new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve('Finished after long wait'), 500);

      if (timeoutSignal.aborted) {
        clearTimeout(timer);
        reject(timeoutSignal.reason);
      } else {
        timeoutSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(timeoutSignal.reason);
        });
      }
    });

    await assert.rejects(
      async () => {
        await hangingRequest;
      },
      (err) => {
        assert.ok(err.name === 'TimeoutError' || timeoutSignal.aborted);
        return true;
      },
      'Should abort when AbortSignal timeout expires'
    );
  });

  test('Promise.allSettled() prevents SMS gateway failure from blocking Telegram alert', async () => {
    const telegramTask = Promise.resolve({
      success: true,
      status: 'sent',
      deliveryId: 'TG-SUCCESS'
    });

    const smsTask = Promise.reject(new Error('Gateway phone at 192.168.1.45 unreachable'));

    const [tgResult, smsResult] = await Promise.allSettled([telegramTask, smsTask]);

    assert.equal(tgResult.status, 'fulfilled');
    assert.equal(tgResult.value.status, 'sent');
    assert.equal(smsResult.status, 'rejected');
    assert.equal(smsResult.reason.message, 'Gateway phone at 192.168.1.45 unreachable');
  });

});
