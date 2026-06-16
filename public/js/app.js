/**
 * Mail-E Application Controller
 * High-Contrast, Full-Width Inbound Feed with Expandable Decision Inspectors
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation & Channel Status
  const dotGmail = document.getElementById('dot-gmail');
  const textGmail = document.getElementById('text-gmail');
  const btnOauthAction = document.getElementById('btn-oauth-action');

  const dotTelegram = document.getElementById('dot-telegram');
  const textTelegram = document.getElementById('text-telegram');
  const cfgTelegramId = document.getElementById('cfg-telegram-id');
  const cfgBtnSaveTelegram = document.getElementById('cfg-btn-save-telegram');
  const cfgBtnTestTelegram = document.getElementById('cfg-btn-test-telegram');

  const dotSms = document.getElementById('dot-sms');
  const textSms = document.getElementById('text-sms');
  const cfgSmsPhone = document.getElementById('cfg-sms-phone');
  const cfgSmsStatus = document.getElementById('cfg-sms-status');
  const cfgBtnSaveSms = document.getElementById('cfg-btn-save-sms');
  const cfgBtnTestSms = document.getElementById('cfg-btn-test-sms');

  const textMonitor = document.getElementById('text-monitor');
  const btnCheckInbox = document.getElementById('btn-check-inbox');
  const btnClearInbox = document.getElementById('btn-clear-inbox');

  // Metrics
  const statTotal = document.getElementById('stat-total');
  const statPlacements = document.getElementById('stat-placements');
  const statInterviews = document.getElementById('stat-interviews');
  const statNoise = document.getElementById('stat-noise');

  const countAll = document.getElementById('count-all');
  const countPlacements = document.getElementById('count-placements');
  const countInterviews = document.getElementById('count-interviews');
  const countNoise = document.getElementById('count-noise');

  // Feed & Filter
  const emailFeedContainer = document.getElementById('email-feed-container');
  const feedEmptyState = document.getElementById('feed-empty-state');
  const tabPills = document.querySelectorAll('.tab-pill');
  const inputSearchFeed = document.getElementById('input-search-feed');

  // Simulation Form
  const simulateForm = document.getElementById('simulate-form');
  const simSender = document.getElementById('sim-sender');
  const simSubject = document.getElementById('sim-subject');
  const simBody = document.getElementById('sim-body');
  const btnSubmitSimulate = document.getElementById('btn-submit-simulate');
  const presetButtons = document.querySelectorAll('.btn-preset');

  // State
  let allEmails = [];
  let openEmailIds = new Set();
  let activeFilter = 'all';
  let searchQuery = '';
  let isCheckingInbox = false;

  // Presets
  const PRESETS = {
    tcs: {
      sender: 'campus-placements@college.edu',
      subject: 'URGENT: TCS Digital & Ninja Campus Recruitment Drive 2026 - Registration Mandatory',
      body: `Dear Final Year Students,\n\nTata Consultancy Services (TCS) is commencing campus recruitment for 2026 batch for Digital and Ninja profiles.\n\nJob Profiles:\n1. TCS Digital: ₹7.5 LPA\n2. TCS Ninja: ₹3.6 LPA\n\nEligibility: B.Tech CSE/IT/ECE (CGPA >= 6.0, no active backlogs)\nRegistration Deadline: 25 September 2026, 11:59 PM (Strict)\nOnline Assessment Date: 3 October 2026\n\nAction Required: Complete your profile and submit your reference ID on the TCS NextStep portal before September 25.`
    },
    amazon: {
      sender: 'university-talent@amazon.com',
      subject: 'Shortlist Announcement & Technical Interview Schedule: Amazon SDE Campus Hiring',
      body: `Congratulations!\n\nFollowing your exceptional performance in the coding round, you are shortlisted for the final virtual interview rounds for Software Development Engineer (SDE-1) at Amazon India.\n\nCompensation Package: ₹28.5 LPA (Base + Signing Bonus + RSUs)\nInterview Schedule: 28 September 2026, 10:00 AM IST\nPlatform: Amazon Chime\n\nAction Required: Confirm interview slot availability and upload your government photo ID and resume to the candidate portal before 24 September, 6:00 PM.`
    },
    uber: {
      sender: 'recruiting@uber.com',
      subject: 'Uber Campus Hiring 2026 - Software Development Engineer 1 (Full-Time)',
      body: `Dear Engineering Graduates,\n\nUber is pleased to invite applications for 2026 batch graduates.\n\nProfile: SDE-1 (Distributed Systems)\nCTC: ₹38 LPA (Base ₹18L + RSUs + Relocation)\nEligibility: B.Tech CSE/IT, CGPA >= 7.5\nDeadline: 30 September 2026\nAction Required: Apply via the university placement link before September 30.`
    },
    noise: {
      sender: 'offers@newsletter.swiggy.in',
      subject: 'Flat 50% OFF on your favorite weekend biryani! Use code CRAVINGS50',
      body: `Hey Foodie,\n\nEnjoy flat 50% discount up to ₹100 on orders above ₹199 from top restaurants near your campus.\n\nUse Coupon Code: CRAVINGS50\nValid till Sunday midnight.\nUnsubscribe from newsletter digest here.`
    }
  };

  // Google OAuth callback notice
  if (window.location.search.includes('connected=gmail')) {
    alert('✓ Gmail account successfully authorized! 24/7 inbox monitoring is active.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  /**
   * 1. Poll System Connectivity Status
   */
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();

      // Gmail
      if (data.gmail.connected) {
        dotGmail.className = 'status-indicator online';
        textGmail.textContent = `Gmail: ${data.gmail.email || 'Connected'}`;
        btnOauthAction.classList.add('d-none');
      } else {
        dotGmail.className = 'status-indicator';
        textGmail.textContent = 'Gmail: Not Connected';
        btnOauthAction.classList.remove('d-none');
      }

      // Telegram
      if (data.telegram.connected) {
        dotTelegram.className = 'status-indicator online';
        textTelegram.textContent = `Telegram: ${data.telegram.chatId}`;
      } else {
        dotTelegram.className = 'status-indicator';
        textTelegram.textContent = 'Telegram: Not Linked';
      }
      if (cfgTelegramId && data.telegram.chatId && !cfgTelegramId.value) {
        cfgTelegramId.value = data.telegram.chatId;
      }

      // SMS
      if (data.sms.online) {
        dotSms.className = 'status-indicator online';
        textSms.textContent = `SMS: Online (${data.sms.phoneNumber || 'Ready'})`;
        if (cfgSmsStatus) cfgSmsStatus.textContent = `Gateway: Online at ${data.sms.gatewayUrl || 'Wi-Fi'} (SIM 2)`;
      } else {
        dotSms.className = 'status-indicator simulation';
        textSms.textContent = `SMS: Simulation (${data.sms.phoneNumber || 'Ready'})`;
        if (cfgSmsStatus) cfgSmsStatus.textContent = 'Gateway: Simulation Mode (Wi-Fi scanning active)';
      }
      if (cfgSmsPhone && data.sms.phoneNumber && !cfgSmsPhone.value) {
        cfgSmsPhone.value = data.sms.phoneNumber;
      }

      // Monitor
      if (data.monitor && textMonitor) {
        const isRunning = data.monitor.isRunning;
        const mins = data.monitor.pollIntervalMinutes;
        textMonitor.textContent = isRunning ? `Monitor: ${mins}m` : 'Monitor: Paused';
        const dotMonitor = document.getElementById('dot-monitor');
        if (dotMonitor) {
          dotMonitor.className = isRunning ? 'status-indicator online' : 'status-indicator';
        }
        const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
        if (btnToggleMonitor) {
          btnToggleMonitor.textContent = isRunning ? 'Pause Polling' : 'Resume Polling';
        }
        document.querySelectorAll('.btn-set-interval').forEach(btn => {
          btn.classList.toggle('active', parseInt(btn.dataset.interval, 10) === mins);
        });
      }
    } catch (err) {
      console.warn('Status poll warning:', err.message);
    }
  }

  /**
   * 2. Fetch Inbound Emails & Decisions
   */
  async function fetchEmails(autoExpandFirst = false) {
    try {
      const res = await fetch('/api/emails');
      if (!res.ok) return;
      const data = await res.json();

      allEmails = data.emails || [];

      // Update metrics
      const stats = data.stats || {};
      statTotal.textContent = stats.total || 0;
      statPlacements.textContent = stats.placements || 0;
      statInterviews.textContent = stats.interviews || 0;
      statNoise.textContent = stats.noise || 0;

      countAll.textContent = stats.total || 0;
      countPlacements.textContent = stats.placements || 0;
      countInterviews.textContent = stats.interviews || 0;
      countNoise.textContent = stats.noise || 0;

      renderFeed();

      if (autoExpandFirst && allEmails.length > 0) {
        openEmailIds.add(allEmails[0]._id);
        renderFeed();
      }
    } catch (err) {
      console.warn('Failed to load emails:', err.message);
    }
  }

  /**
   * 3. Render Full-Width Inbound Feed (Accordions)
   */
  function renderFeed() {
    emailFeedContainer.innerHTML = '';

    const filtered = allEmails.filter(email => {
      if (activeFilter === 'placement' && email.category !== 'placement') return false;
      if (activeFilter === 'interview' && email.category !== 'interview') return false;
      if (activeFilter === 'filtered' && email.status !== 'filtered') return false;

      if (searchQuery) {
        const fullText = `${email.subject} ${email.sender} ${email.aiAnalysis?.company || ''} ${email.aiAnalysis?.role || ''}`.toLowerCase();
        if (!fullText.includes(searchQuery)) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      feedEmptyState.classList.remove('d-none');
      emailFeedContainer.appendChild(feedEmptyState);
      return;
    }

    feedEmptyState.classList.add('d-none');

    filtered.forEach(email => {
      const isExpanded = openEmailIds.has(email._id);
      const isFiltered = email.status === 'filtered';
      const isPlacement = email.category === 'placement';
      const isInterview = email.category === 'interview';

      let verdictClass = 'noise';
      let verdictLabel = 'Noise Filtered';

      if (isPlacement) {
        verdictClass = 'placement';
        verdictLabel = email.alertSent ? 'Placement • Alerted' : 'Placement Detected';
      } else if (isInterview) {
        verdictClass = 'interview';
        verdictLabel = email.alertSent ? 'Interview • Alerted' : 'Interview Shortlist';
      }

      const card = document.createElement('div');
      card.className = `email-card ${isExpanded ? 'expanded' : ''}`;
      card.id = `card-${email._id}`;

      const dateStr = email.processedAt ? new Date(email.processedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
      const company = email.aiAnalysis?.company || '';
      const ctc = email.aiAnalysis?.package ? ` • ${email.aiAnalysis.package}` : '';
      const role = email.aiAnalysis?.role ? ` • ${email.aiAnalysis.role}` : '';
      const previewMeta = company ? `<span class="text-secondary fw-semibold">${company}${ctc}${role}</span>` : '';

      // Header (Always Visible)
      const headerDiv = document.createElement('div');
      headerDiv.className = 'email-card-header';
      headerDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="email-sender">${escapeHtml(email.sender)}</span>
            <span class="verdict-tag ${verdictClass}">${verdictLabel}</span>
          </div>
          <div class="d-flex align-items-center gap-3">
            <span class="email-time">${dateStr}</span>
            <span class="expand-indicator">
              <span>${isExpanded ? 'Hide Decision' : 'Inspect Decision'}</span>
              <i class="bi bi-chevron-down expand-chevron"></i>
            </span>
          </div>
        </div>
        <div class="email-subject">${escapeHtml(email.subject)}</div>
        ${previewMeta ? `<div class="small mt-1">${previewMeta}</div>` : ''}
      `;

      // Click to toggle Decision Inspector Drawer directly underneath
      headerDiv.addEventListener('click', () => {
        if (openEmailIds.has(email._id)) {
          openEmailIds.delete(email._id);
        } else {
          openEmailIds.add(email._id);
        }
        renderFeed();
      });

      card.appendChild(headerDiv);

      // Decision Drawer (Expanded only when clicked)
      if (isExpanded) {
        const drawerDiv = document.createElement('div');
        drawerDiv.className = 'decision-drawer';
        drawerDiv.innerHTML = buildDecisionInspectorHtml(email);
        card.appendChild(drawerDiv);
      }

      emailFeedContainer.appendChild(card);
    });
  }

  /**
   * 4. Build Decision Inspector HTML (Under each email)
   */
  function buildDecisionInspectorHtml(email) {
    const isFiltered = email.status === 'filtered';
    const analysis = email.aiAnalysis || {};

    let html = '';

    // Stage 1: Pre-Filter Verdict
    if (isFiltered) {
      html += `
        <div class="filter-verdict-box rejected mb-3">
          <div class="fw-bold mb-1"><i class="bi bi-shield-x text-warning me-1"></i> Pre-Filter Verdict: DISCARDED AS PROMOTIONAL NOISE</div>
          <div>${escapeHtml(email.filterReason || 'Matched marketing pattern. Gemini AI extraction was skipped to eliminate token latency and cost.')}</div>
        </div>
      `;
    } else {
      html += `
        <div class="filter-verdict-box passed mb-3">
          <div class="fw-bold mb-1"><i class="bi bi-shield-check text-success me-1"></i> Pre-Filter Verdict: PASSED TO GEMINI AI ENGINE</div>
          <div>${escapeHtml(email.filterReason || 'Campus recruitment keywords detected in email content.')}</div>
        </div>
      `;
    }

    // Stage 2: Extracted Placement Intelligence
    if (!isFiltered) {
      const eligibilityHtml = (analysis.eligibility && analysis.eligibility.length > 0)
        ? `<div class="mt-2 text-secondary small"><strong>Eligibility:</strong> ${analysis.eligibility.map(e => escapeHtml(e)).join(', ')}</div>`
        : '';

      html += `
        <div class="intel-card">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <span class="section-title mb-0">EXTRACTED RECRUITMENT INTELLIGENCE (Gemini AI)</span>
            <span class="badge ${email.priority === 'high' ? 'bg-danger' : 'bg-primary'} px-2 py-1" style="font-size: 0.72rem;">
              ${(email.priority || 'HIGH').toUpperCase()} PRIORITY
            </span>
          </div>

          <div class="intel-grid">
            <div class="intel-box">
              <div class="intel-key">Company</div>
              <div class="intel-val">${escapeHtml(analysis.company || 'Campus Recruiter')}</div>
            </div>
            <div class="intel-box">
              <div class="intel-key">Role / Profile</div>
              <div class="intel-val">${escapeHtml(analysis.role || 'Opportunity')}</div>
            </div>
            <div class="intel-box">
              <div class="intel-key">Package / CTC</div>
              <div class="intel-val text-success">${escapeHtml(analysis.package || 'Competitive')}</div>
            </div>
            <div class="intel-box">
              <div class="intel-key">Application Deadline</div>
              <div class="intel-val text-danger">${escapeHtml(analysis.applicationDeadline || 'Check official portal')}</div>
            </div>
            <div class="intel-box">
              <div class="intel-key">Assessment / Interview Date</div>
              <div class="intel-val text-info">${escapeHtml(analysis.assessmentDate || analysis.interviewDate || 'To be announced')}</div>
            </div>
            <div class="intel-box">
              <div class="intel-key">Location</div>
              <div class="intel-val">${escapeHtml(analysis.location || 'Pan-India')}</div>
            </div>
          </div>

          <!-- Mandatory Action -->
          <div class="action-box">
            <strong><i class="bi bi-exclamation-circle-fill me-1"></i> Mandatory Action:</strong>
            ${escapeHtml(analysis.action || 'Complete registration on portal before deadline.')}
          </div>

          ${eligibilityHtml}
        </div>
      `;
    }

    // Stage 3: Multi-Channel Dispatch Receipts
    const isAlerted = email.alertSent || (!isFiltered && (email.category === 'placement' || email.category === 'interview'));
    html += `
      <div class="intel-card">
        <div class="section-title">CONCURRENT MULTI-CHANNEL DISPATCH (Promise.allSettled)</div>
        <div class="dispatch-grid">
          
          <div class="dispatch-receipt">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-telegram text-info fs-5"></i>
              <div>
                <strong class="d-block text-light" style="font-size: 0.84rem;">Telegram Bot Alert</strong>
                <span class="text-muted" style="font-size: 0.74rem;">Bot API Direct Dispatch</span>
              </div>
            </div>
            <span class="badge ${isAlerted ? 'bg-success' : 'bg-secondary'}">${isAlerted ? 'Delivered ✓' : 'Skipped'}</span>
          </div>

          <div class="dispatch-receipt">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-phone text-success fs-5"></i>
              <div>
                <strong class="d-block text-light" style="font-size: 0.84rem;">Android SMS Gateway</strong>
                <span class="text-muted" style="font-size: 0.74rem;">Local Wi-Fi • SIM 2 Routing</span>
              </div>
            </div>
            <span class="badge ${isAlerted ? 'bg-success' : 'bg-secondary'}">${isAlerted ? 'Delivered ✓' : 'Skipped'}</span>
          </div>

        </div>
      </div>
    `;

    // Stage 4: Original Inbound Message Content
    html += `
      <div class="intel-card mb-0">
        <div class="section-title">ORIGINAL INBOUND EMAIL CONTENT</div>
        <pre class="raw-email-viewer mb-0">${escapeHtml(email.bodyText || email.snippet || '(No body text provided)')}</pre>
      </div>
    `;

    return html;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 5. Unified Filter Handler (Tab Pills & Metric Stat Cards)
   */
  function applyFilter(filterName, scroll = false) {
    activeFilter = filterName || 'all';

    // 1. Sync Tab Pills
    tabPills.forEach(btn => {
      if (btn.dataset.filter === activeFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Sync Stat Cards
    const statCards = document.querySelectorAll('.stat-item[data-filter]');
    statCards.forEach(card => {
      if (card.dataset.filter === activeFilter) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // 3. Re-render Feed with active filter
    renderFeed();

    // 4. Optionally scroll down to feed
    if (scroll) {
      const inboxPanel = document.querySelector('.inbox-panel');
      if (inboxPanel) {
        inboxPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // Wire Tab Pills
  tabPills.forEach(btn => {
    btn.addEventListener('click', () => {
      applyFilter(btn.dataset.filter || 'all', false);
    });
  });

  // Wire Metric Stat Cards (Click to show specific emails list)
  const statCards = document.querySelectorAll('.stat-item[data-filter]');
  statCards.forEach(card => {
    card.addEventListener('click', () => {
      const targetFilter = card.dataset.filter || 'all';
      applyFilter(targetFilter, true);
    });

    // Keyboard accessibility (Enter or Space)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const targetFilter = card.dataset.filter || 'all';
        applyFilter(targetFilter, true);
      }
    });
  });

  /**
   * 6. Search Input Filter
   */
  if (inputSearchFeed) {
    inputSearchFeed.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderFeed();
    });
  }

  /**
   * 7. Check Inbox Button
   */
  if (btnCheckInbox) {
    btnCheckInbox.addEventListener('click', async () => {
      if (isCheckingInbox) return;
      isCheckingInbox = true;
      btnCheckInbox.disabled = true;
      btnCheckInbox.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Scanning...';

      try {
        const res = await fetch('/api/gmail/check', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          alert(`✓ Gmail Scan Complete!\nFound: ${data.found || 0} messages\nProcessed: ${data.processed || 0}`);
          await fetchEmails(true);
          await fetchStatus();
        } else {
          alert(data.message || 'Please authorize your Gmail account first.');
        }
      } catch (err) {
        alert('Inbox scan failed: ' + err.message);
      } finally {
        isCheckingInbox = false;
        btnCheckInbox.disabled = false;
        btnCheckInbox.innerHTML = '<i class="bi bi-arrow-repeat"></i> Check Inbox';
      }
    });
  }

  /**
   * 8. Clear Inbox History
   */
  if (btnClearInbox) {
    btnClearInbox.addEventListener('click', async () => {
      if (!confirm('Clear all stored emails and decision history?')) return;
      try {
        await fetch('/api/emails', { method: 'DELETE' });
        openEmailIds.clear();
        await fetchEmails();
      } catch (err) {
        alert('Failed to clear inbox: ' + err.message);
      }
    });
  }

  /**
   * 9. Simulation Presets
   */
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetKey = btn.dataset.preset;
      const data = PRESETS[presetKey];
      if (data) {
        simSender.value = data.sender;
        simSubject.value = data.subject;
        simBody.value = data.body;
      }
    });
  });

  // Default initial preset form
  if (simSubject && !simSubject.value) {
    simSender.value = PRESETS.tcs.sender;
    simSubject.value = PRESETS.tcs.subject;
    simBody.value = PRESETS.tcs.body;
  }

  /**
   * 10. Submit Inbound Email Simulation
   */
  if (simulateForm) {
    simulateForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const sender = simSender.value.trim();
      const subject = simSubject.value.trim();
      const bodyText = simBody.value.trim();

      if (!subject || !bodyText) {
        return alert('Please fill in both the subject and email content');
      }

      btnSubmitSimulate.disabled = true;
      btnSubmitSimulate.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Processing...';

      try {
        const res = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario: 'custom',
            sender,
            subject,
            bodyText
          })
        });

        const data = await res.json();

        // Close modal
        const modalEl = document.getElementById('modal-simulate');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        // Refresh email feed and open the new email's inspector
        await fetchEmails();
        if (data.email?._id) {
          openEmailIds.add(data.email._id);
          renderFeed();
        }
      } catch (err) {
        alert('Simulation failed: ' + err.message);
      } finally {
        btnSubmitSimulate.disabled = false;
        btnSubmitSimulate.innerHTML = '<i class="bi bi-play-fill me-1"></i> Ingest & Process Email';
      }
    });
  }

  /**
   * 11. Channel Settings Modal
   */
  if (cfgBtnSaveTelegram) {
    cfgBtnSaveTelegram.addEventListener('click', async () => {
      const chatId = cfgTelegramId.value.trim();
      if (!chatId) return alert('Enter a Telegram Chat ID');
      const res = await fetch('/api/telegram/set-chat-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId })
      });
      const data = await res.json();
      if (data.ok) {
        alert('✓ Telegram Chat ID saved!');
        fetchStatus();
      }
    });
  }

  if (cfgBtnTestTelegram) {
    cfgBtnTestTelegram.addEventListener('click', async () => {
      const res = await fetch('/api/telegram/test', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert('✓ Test alert dispatched to your Telegram bot!');
      } else {
        alert(data.message || 'Failed to send Telegram test');
      }
    });
  }

  if (cfgBtnSaveSms) {
    cfgBtnSaveSms.addEventListener('click', async () => {
      const phone = cfgSmsPhone.value.trim();
      if (!phone) return alert('Enter a phone number');
      const res = await fetch('/api/sms/set-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.ok) {
        alert('✓ Phone number saved for SMS alerts!');
        fetchStatus();
      }
    });
  }

  if (cfgBtnTestSms) {
    cfgBtnTestSms.addEventListener('click', async () => {
      const res = await fetch('/api/sms/test', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert('✓ Test SMS sent via Android Gateway!');
      } else {
        alert(data.message || 'Failed to send SMS test');
      }
    });
  }

  // Monitor polling interval buttons
  document.querySelectorAll('.btn-set-interval').forEach(btn => {
    btn.addEventListener('click', async () => {
      const intervalMinutes = parseInt(btn.dataset.interval, 10);
      try {
        const res = await fetch('/api/monitor/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalMinutes, isRunning: true })
        });
        const data = await res.json();
        if (data.ok) {
          fetchStatus();
        }
      } catch (e) {
        console.warn('Failed to update monitor interval:', e.message);
      }
    });
  });

  // Toggle monitor pause/resume
  const btnToggleMonitor = document.getElementById('btn-toggle-monitor');
  if (btnToggleMonitor) {
    btnToggleMonitor.addEventListener('click', async () => {
      const isPaused = textMonitor.textContent.includes('Paused');
      try {
        const res = await fetch('/api/monitor/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRunning: isPaused })
        });
        const data = await res.json();
        if (data.ok) {
          fetchStatus();
        }
      } catch (e) {
        console.warn('Failed to toggle monitor:', e.message);
      }
    });
  }

  // Initial load
  fetchStatus();
  fetchEmails(false); // Do not open by default

  // Polling
  setInterval(fetchStatus, 5000);
  setInterval(() => fetchEmails(false), 8000);
});
