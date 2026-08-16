import { getDashboardStats, getDocuments } from '../supabase.js';
import { fmt, greetingTime, escapeHtml, formatDate } from '../utils.js';

export async function renderDashboard(container, ctx) {
  const profile = ctx.profile();
  const firstName = (profile?.name || '').split(' ')[0] || 'there';

  container.innerHTML = `
    <div class="page-header">
      <h1 class="greeting">${greetingTime()}, ${escapeHtml(firstName)}</h1>
      <p class="greeting-sub">Your tax records at a glance.</p>
    </div>
    <div class="stat-grid" id="stats">
      <div class="stat-card"><div class="stat-label">Annual Income</div><div class="stat-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Tax Relief</div><div class="stat-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Documents</div><div class="stat-value">—</div></div>
      <div class="stat-card"><div class="stat-label">Est. Chargeable</div><div class="stat-value">—</div></div>
    </div>
    <div class="quick-actions">
      <button class="quick-action" data-go="/documents">
        ${ctx.icons.upload}
        <span>Upload Receipt</span>
      </button>
      <button class="quick-action" data-go="/income">
        ${ctx.icons.plus}
        <span>Add Income</span>
      </button>
      <button class="quick-action" data-go="/relief">
        ${ctx.icons.shield}
        <span>Tax Relief</span>
      </button>
      <button class="quick-action" data-go="/profile">
        ${ctx.icons.user}
        <span>Profile</span>
      </button>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Recent Documents</h2>
        <span class="tag"><button class="back-link" data-go="/documents" style="margin:0;">View all</button></span>
      </div>
      <div id="recent-docs"><div class="empty-state">Loading...</div></div>
    </div>
    <div class="disclaimer">
      MashilTax is a personal planning tool — not tax advice. Confirm eligibility and current caps on the LHDN / MyTax portal or with a tax agent before filing.
    </div>`;

  container.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => ctx.navigate(el.dataset.go));
  });

  try {
    const [stats, recentDocs] = await Promise.all([
      getDashboardStats(),
      getDocuments({}).then(d => d.slice(0, 5)),
    ]);

    const statsEl = document.getElementById('stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card">
          <div class="stat-label">Annual Income</div>
          <div class="stat-value">${fmt(stats.annualIncome)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tax Relief</div>
          <div class="stat-value brass">${fmt(stats.totalRelief)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Documents</div>
          <div class="stat-value">${stats.documentCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Est. Chargeable</div>
          <div class="stat-value green">${fmt(stats.chargeableIncome)}</div>
        </div>`;
    }

    const docsEl = document.getElementById('recent-docs');
    if (docsEl) {
      if (!recentDocs.length) {
        docsEl.innerHTML = '<div class="empty-state">No documents yet. Upload your first receipt!</div>';
      } else {
        docsEl.innerHTML = recentDocs.map(doc => `
          <div class="doc-list-item" data-doc="${doc.id}">
            <div class="doc-icon">${docTypeIcon(doc.document_type)}</div>
            <div class="doc-info">
              <div class="doc-name">${escapeHtml(doc.merchant || doc.file_name || 'Document')}</div>
              <div class="doc-meta">${formatDate(doc.document_date || doc.created_at)} · ${escapeHtml(doc.category || doc.document_type || '')}</div>
            </div>
            ${doc.amount ? `<div class="doc-amount">${fmt(doc.amount)}</div>` : ''}
          </div>`).join('');
        docsEl.querySelectorAll('[data-doc]').forEach(el => {
          el.addEventListener('click', () => ctx.navigate('/documents/' + el.dataset.doc));
        });
      }
    }
  } catch (err) {
    document.getElementById('stats').innerHTML = '<div class="empty-state">Could not load stats.</div>';
  }
}

function docTypeIcon(type) {
  switch (type) {
    case 'receipt': return '🧾';
    case 'income_statement': return '💰';
    case 'zakat': return '🕌';
    case 'cp500': return '📋';
    default: return '📄';
  }
}
