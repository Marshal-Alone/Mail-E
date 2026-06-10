/**
 * Pipeline Controller Module for Mail-E
 * Animates the intelligence pipeline stages and appends to the observability terminal log.
 */

class PipelineController {
  constructor() {
    this.steps = document.querySelectorAll('.pipeline-step');
    this.logsContainer = document.getElementById('activity-logs');
    this.statusBadge = document.getElementById('pipeline-status-badge');
  }

  reset() {
    this.steps.forEach(node => {
      node.className = 'pipeline-step text-center';
      const statusEl = node.querySelector('.node-status');
      if (statusEl) statusEl.textContent = 'Standby';
    });
    if (this.statusBadge) {
      this.statusBadge.textContent = 'Processing...';
      this.statusBadge.className = 'badge bg-primary';
    }
  }

  setStepState(stepNumber, state, statusText) {
    const node = document.querySelector(`.pipeline-step[data-step="${stepNumber}"]`);
    if (!node) return;

    node.className = `pipeline-step text-center ${state}`;
    const statusEl = node.querySelector('.node-status');
    if (statusEl && statusText) {
      statusEl.textContent = statusText;
    }
  }

  addLog(time, text, type = 'normal') {
    if (!this.logsContainer) return;

    const row = document.createElement('div');
    row.className = 'log-line';

    let colorClass = 'text-light';
    if (type === 'info') colorClass = 'text-info';
    else if (type === 'success') colorClass = 'text-success';
    else if (type === 'warning') colorClass = 'text-warning';
    else if (type === 'error' || type === 'rejected') colorClass = 'text-danger';

    row.innerHTML = `<span class="text-secondary me-2">[${time}]</span><span class="${colorClass}">${text}</span>`;
    this.logsContainer.appendChild(row);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  playLogs(logs = []) {
    if (!this.logsContainer || !Array.isArray(logs)) return;

    logs.forEach(item => {
      this.addLog(item.timestamp || new Date().toLocaleTimeString(), `[${item.stage}] ${item.detail}`, item.status || 'info');
      
      // Map stages to step badges
      if (item.stage === 'EMAIL_DETECTED') {
        this.setStepState(1, 'completed', 'Ingested ✓');
      } else if (item.stage === 'DUPLICATE_CHECK') {
        this.setStepState(1, 'completed', 'Verified ✓');
      } else if (item.stage === 'PRE_FILTER') {
        if (item.status === 'rejected') {
          this.setStepState(2, 'rejected', 'Noise Blocked');
          if (this.statusBadge) {
            this.statusBadge.textContent = 'Filtered Noise';
            this.statusBadge.className = 'badge bg-warning text-dark';
          }
        } else {
          this.setStepState(2, 'completed', 'Passed ✓');
        }
      } else if (item.stage === 'GEMINI_AI') {
        this.setStepState(3, 'completed', 'Extracted ✓');
      } else if (item.stage === 'CLASSIFICATION') {
        this.setStepState(4, 'completed', item.detail.split(':')[1]?.trim() || 'Structured');
      } else if (item.stage === 'CONCURRENT_DISPATCH') {
        this.setStepState(5, 'completed', 'AllSettled ✓');
      } else if (item.stage === 'TELEGRAM_DISPATCH' || item.stage === 'SMS_DISPATCH') {
        this.setStepState(6, 'completed', 'Delivered ✓');
        if (this.statusBadge) {
          this.statusBadge.textContent = 'Alerts Delivered ✓';
          this.statusBadge.className = 'badge bg-success';
        }
      }
    });
  }
}

window.pipeline = new PipelineController();
window.PipelineVisualizer = window.pipeline;
