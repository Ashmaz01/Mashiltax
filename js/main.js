import { Router } from './router.js';
import { sb, getSession, getProfile, signOut as doSignOut } from './supabase.js';
import { showToast } from './utils.js';
import { renderWelcome } from './views/welcome.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDocuments } from './views/documents.js';
import { renderIncome } from './views/income.js';
import { renderRelief } from './views/relief.js';
import { renderAnnual } from './views/annual.js';
import { renderProfile } from './views/profile.js';

const appEl = document.getElementById('app');
const router = new Router();
let currentProfile = null;

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  dollar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5.5" r="1.5"/><circle cx="12" cy="18.5" r="1.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

function showLoading(msg) {
  let el = document.querySelector('.loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.className = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spinner"></div><div class="loading-text">${msg || 'Loading...'}</div>`;
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.querySelector('.loading-overlay');
  if (el) el.classList.add('hidden');
}

function makeCtx() {
  return {
    profile: () => currentProfile,
    navigate: (p) => router.navigate(p),
    showToast,
    showLoading,
    hideLoading,
    icons: ICONS,
    refreshProfile: async () => { currentProfile = await getProfile(); },
  };
}

function renderShell() {
  const initials = currentProfile?.name ? currentProfile.name.charAt(0).toUpperCase() : '?';
  appEl.innerHTML = `
  <div class="app-shell">
    <nav class="top-nav">
      <a class="logo" data-nav="/dashboard">MashilTax</a>
      <div class="nav-links">
        <button class="nav-link" data-nav="/dashboard">Dashboard</button>
        <button class="nav-link" data-nav="/documents">Documents</button>
        <button class="nav-link" data-nav="/income">Income</button>
        <button class="nav-link" data-nav="/relief">Tax Relief</button>
        <button class="nav-link" data-nav="/annual">Annual</button>
        <button class="nav-link profile-link" data-nav="/profile">${initials}</button>
      </div>
    </nav>
    <main class="main-content" id="view"></main>
    <nav class="bottom-nav">
      <div class="bottom-nav-inner">
        <button class="tab" data-nav="/dashboard">${ICONS.home}<span>Home</span></button>
        <button class="tab" data-nav="/documents">${ICONS.doc}<span>Docs</span></button>
        <button class="tab" data-nav="/income">${ICONS.dollar}<span>Income</span></button>
        <button class="tab" data-nav="/relief">${ICONS.shield}<span>Relief</span></button>
        <button class="tab" data-nav="/more">${ICONS.more}<span>More</span></button>
      </div>
    </nav>
  </div>`;
  appEl.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); router.navigate(el.dataset.nav); });
  });
}

function updateNav(path) {
  appEl.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === path);
  });
}

function viewEl() { return document.getElementById('view'); }

function renderMore() {
  const v = viewEl();
  v.innerHTML = `
    <div class="page-header"><h1>More</h1></div>
    <div class="card">
      <div class="doc-list-item" data-go="/annual">
        <div class="doc-icon">${ICONS.chart}</div>
        <div class="doc-info"><div class="doc-name">Annual Summary</div><div class="doc-meta">Year-end tax computation &amp; BE worksheet</div></div>
      </div>
      <div class="doc-list-item" data-go="/profile">
        <div class="doc-icon">${ICONS.user}</div>
        <div class="doc-info"><div class="doc-name">Profile</div><div class="doc-meta">Your personal and tax information</div></div>
      </div>
      <div class="doc-list-item" id="btn-signout">
        <div class="doc-icon">${ICONS.logout}</div>
        <div class="doc-info"><div class="doc-name">Sign Out</div><div class="doc-meta">Sign out of this device</div></div>
      </div>
    </div>`;
  v.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => router.navigate(el.dataset.go));
  });
  document.getElementById('btn-signout').addEventListener('click', async () => {
    await doSignOut();
    window.location.hash = '';
    window.location.reload();
  });
}

function setupRoutes() {
  const ctx = makeCtx();
  router
    .on('/', () => { renderDashboard(viewEl(), ctx); updateNav('/dashboard'); })
    .on('/dashboard', () => { renderDashboard(viewEl(), ctx); updateNav('/dashboard'); })
    .on('/documents', (p) => { renderDocuments(viewEl(), ctx, p); updateNav('/documents'); })
    .on('/income', () => { renderIncome(viewEl(), ctx); updateNav('/income'); })
    .on('/relief', () => { renderRelief(viewEl(), ctx); updateNav('/relief'); })
    .on('/annual', () => { renderAnnual(viewEl(), ctx); updateNav('/annual'); })
    .on('/profile', () => { renderProfile(viewEl(), ctx); updateNav('/profile'); })
    .on('/more', () => { renderMore(); updateNav('/more'); });
}

async function init() {
  showLoading('Loading MashilTax...');
  try {
    const session = await getSession();
    hideLoading();
    if (!session) {
      renderWelcome(appEl, async () => {
        showLoading('Setting up...');
        currentProfile = await getProfile();
        hideLoading();
        renderShell();
        setupRoutes();
        router.navigate('/dashboard');
      });
      return;
    }
    currentProfile = await getProfile();
    renderShell();
    setupRoutes();
    router.start();
  } catch (err) {
    hideLoading();
    showToast('Something went wrong. Please refresh.', 'error');
  }
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentProfile = null;
    window.location.hash = '';
    window.location.reload();
  }
});

init();
