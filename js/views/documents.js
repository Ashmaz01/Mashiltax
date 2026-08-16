import {
  uploadDocument, saveDocument, updateDocument, getDocuments, getDocument,
  getDocumentUrl, deleteDocument, processOCR, getSession,
} from '../supabase.js';
import { fmt, escapeHtml, formatDate, formatDateInput, showToast, resizeImage } from '../utils.js';

const DOC_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'income_statement', label: 'Income Statement' },
  { value: 'zakat', label: 'Zakat' },
  { value: 'cp500', label: 'CP500' },
  { value: 'other', label: 'Other' },
];

const CATEGORIES = [
  'Medical', 'Education', 'Lifestyle', 'Insurance', 'Donations',
  'Sports & Fitness', 'Childcare', 'Breastfeeding', 'Parents/Grandparents',
  'EPF/SOCSO', 'Business Expense', 'Other',
];

const RELIEF_MAP = {
  'Medical': 'Medical expenses – self, spouse or child',
  'Education': 'Education fees (self)',
  'Lifestyle': 'Lifestyle relief',
  'Insurance': 'Education & medical insurance',
  'Donations': 'Approved donations & gifts',
  'Sports & Fitness': 'Sports & fitness relief',
  'Childcare': 'Registered childcare / kindergarten fees',
  'Breastfeeding': 'Breastfeeding equipment',
  'Parents/Grandparents': 'Medical & care for parents/grandparents',
  'EPF/SOCSO': 'EPF & life insurance/takaful',
};

function docTypeIcon(type) {
  switch (type) {
    case 'receipt': return '\u{1F9FE}';
    case 'income_statement': return '\u{1F4B0}';
    case 'zakat': return '\u{1F54C}';
    case 'cp500': return '\u{1F4CB}';
    default: return '\u{1F4C4}';
  }
}

export async function renderDocuments(container, ctx, docId) {
  if (docId) {
    await renderDocumentDetail(container, ctx, docId);
    return;
  }

  let currentFilter = 'all';
  let searchQuery = '';

  container.innerHTML = `
    <div class="page-header">
      <h1>Documents</h1>
      <p class="greeting-sub">Upload and manage your receipts and documents</p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Upload Document</h2>
      </div>
      <div class="upload-zone" id="upload-zone" style="margin:16px 20px;"
        <div class="upload-icon">${ctx.icons.upload}</div>
        <div class="upload-text">Tap to upload or drag a file here</div>
        <div class="upload-hint">Photos, scans, PDFs — up to 10 MB</div>
        <input type="file" id="file-input" accept="image/*,application/pdf" style="display:none;">
      </div>
      <div id="upload-progress" style="display:none; padding:16px 22px;">
        <div class="save-status" id="upload-status">Uploading...</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Document Library</h2>
      </div>
      <div style="padding:12px 20px 0;">
        <div class="filter-bar" id="filter-pills">
          ${DOC_TYPES.map(t => `<button class="filter-chip${t.value === 'all' ? ' active' : ''}" data-type="${t.value}">${escapeHtml(t.label)}</button>`).join('')}
        </div>
        <div class="search-bar">
          <input type="text" id="doc-search" placeholder="Search documents...">
        </div>
      </div>
      <div id="doc-list"><div class="empty-state">Loading...</div></div>
    </div>`;

  const uploadZone = container.querySelector('#upload-zone');
  const fileInput = container.querySelector('#file-input');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleUpload(fileInput.files[0]);
  });

  async function handleUpload(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('File too large — maximum 10 MB', 'error');
      return;
    }

    const progressEl = container.querySelector('#upload-progress');
    const statusEl = container.querySelector('#upload-status');
    progressEl.style.display = 'block';
    uploadZone.style.display = 'none';
    statusEl.textContent = 'Uploading document...';

    try {
      const session = await getSession();
      const userId = session.user.id;

      let uploadFile = file;
      if (file.type.startsWith('image/') && file.size > 500 * 1024) {
        statusEl.textContent = 'Resizing image...';
        uploadFile = await resizeImage(file, 2048);
      }

      statusEl.textContent = 'Uploading to secure storage...';
      const filePath = await uploadDocument(uploadFile, userId);

      statusEl.textContent = 'Processing with OCR...';
      let ocrResult = null;
      try {
        const ocrFile = file.type.startsWith('image/')
          ? await resizeImage(file, 1024)
          : file;
        ocrResult = await processOCR(ocrFile);
      } catch {
        ocrResult = null;
      }

      statusEl.textContent = 'Saving document record...';
      const docRecord = {
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        document_type: ocrResult?.document_type || 'receipt',
        merchant: ocrResult?.merchant || '',
        document_date: ocrResult?.date || null,
        amount: ocrResult?.amount || null,
        category: ocrResult?.category || '',
        relief_category: ocrResult?.category ? (RELIEF_MAP[ocrResult.category] || '') : '',
        description: ocrResult?.description || '',
        status: ocrResult ? 'processed' : 'pending',
        ocr_confidence: ocrResult?.confidence || null,
        ocr_raw: ocrResult || null,
      };
      const saved = await saveDocument(docRecord);
      showToast(ocrResult ? 'Document uploaded and processed' : 'Document uploaded — OCR not available');
      ctx.navigate('/documents/' + saved.id);
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
      progressEl.style.display = 'none';
      uploadZone.style.display = '';
    }
  }

  container.querySelectorAll('#filter-pills .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#filter-pills .filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.type;
      loadDocs();
    });
  });

  container.querySelector('#doc-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    loadDocs();
  });

  async function loadDocs() {
    const listEl = container.querySelector('#doc-list');
    try {
      const docs = await getDocuments({
        type: currentFilter,
        search: searchQuery || undefined,
      });
      if (!docs.length) {
        listEl.innerHTML = '<div class="empty-state">No documents found. Upload your first receipt!</div>';
        return;
      }
      listEl.innerHTML = docs.map(doc => `
        <div class="doc-list-item" data-doc="${doc.id}">
          <div class="doc-icon">${docTypeIcon(doc.document_type)}</div>
          <div class="doc-info">
            <div class="doc-name">${escapeHtml(doc.merchant || doc.file_name || 'Document')}</div>
            <div class="doc-meta">${formatDate(doc.document_date || doc.created_at)} · ${escapeHtml(doc.category || doc.document_type || '')}</div>
          </div>
          ${doc.amount ? `<div class="doc-amount">${fmt(doc.amount)}</div>` : ''}
        </div>`).join('');
      listEl.querySelectorAll('[data-doc]').forEach(el => {
        el.addEventListener('click', () => ctx.navigate('/documents/' + el.dataset.doc));
      });
    } catch {
      listEl.innerHTML = '<div class="empty-state">Could not load documents.</div>';
    }
  }

  await loadDocs();
}

async function renderDocumentDetail(container, ctx, docId) {
  container.innerHTML = `<div class="page-header"><h1>Document</h1></div><div class="empty-state">Loading...</div>`;

  try {
    const doc = await getDocument(docId);
    if (!doc) {
      container.innerHTML = `<div class="page-header"><h1>Document</h1></div><div class="empty-state">Document not found.</div>`;
      return;
    }

    let imageUrl = '';
    if (doc.file_path) {
      try { imageUrl = await getDocumentUrl(doc.file_path); } catch {}
    }

    container.innerHTML = `
      <div class="page-header">
        <button class="back-link" id="btn-back">&larr; Back to Documents</button>
        <h1>${escapeHtml(doc.merchant || doc.file_name || 'Document')}</h1>
      </div>
      ${imageUrl ? `
      <div class="card doc-preview">
        <img src="${escapeHtml(imageUrl)}" alt="Document" style="max-width:100%; border-radius:2px;">
      </div>` : ''}
      <div class="card">
        <div class="card-head">
          <h2>Document Details</h2>
          <span class="tag">${escapeHtml(doc.status || 'pending')}</span>
        </div>
        <div style="padding:16px 22px;">
          <div class="form-group">
            <label>Merchant / Issuer</label>
            <input class="form-input" id="doc-merchant" value="${escapeHtml(doc.merchant || '')}">
          </div>
          <div class="form-group">
            <label>Date</label>
            <input class="form-input" type="date" id="doc-date" value="${formatDateInput(doc.document_date) || ''}">
          </div>
          <div class="form-group">
            <label>Amount (RM)</label>
            <input class="form-input" type="number" id="doc-amount" value="${doc.amount || ''}" step="0.01">
          </div>
          <div class="form-group">
            <label>Document Type</label>
            <select class="form-input" id="doc-type">
              ${DOC_TYPES.filter(t => t.value !== 'all').map(t =>
                `<option value="${t.value}"${doc.document_type === t.value ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select class="form-input" id="doc-category">
              <option value="">— Select —</option>
              ${CATEGORIES.map(c =>
                `<option value="${c}"${doc.category === c ? ' selected' : ''}>${escapeHtml(c)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Tax Relief Category</label>
            <input class="form-input" id="doc-relief" value="${escapeHtml(doc.relief_category || '')}" readonly style="opacity:0.7;">
          </div>
          <div class="form-group">
            <label>Description / Notes</label>
            <textarea class="form-input" id="doc-desc" rows="3">${escapeHtml(doc.description || '')}</textarea>
          </div>
          ${doc.ocr_confidence ? `<div class="doc-meta" style="margin-bottom:12px;">OCR confidence: ${Math.round(doc.ocr_confidence)}%</div>` : ''}
          <div class="toolbar" style="padding:0;">
            <button class="btn" id="btn-save-doc">Save Changes</button>
            <button class="btn danger" id="btn-delete-doc">Delete</button>
          </div>
        </div>
      </div>`;

    container.querySelector('#btn-back').addEventListener('click', () => ctx.navigate('/documents'));

    container.querySelector('#doc-category').addEventListener('change', (e) => {
      const reliefInput = container.querySelector('#doc-relief');
      reliefInput.value = RELIEF_MAP[e.target.value] || '';
    });

    container.querySelector('#btn-save-doc').addEventListener('click', async () => {
      try {
        await updateDocument(doc.id, {
          merchant: container.querySelector('#doc-merchant').value.trim(),
          document_date: container.querySelector('#doc-date').value || null,
          amount: parseFloat(container.querySelector('#doc-amount').value) || null,
          document_type: container.querySelector('#doc-type').value,
          category: container.querySelector('#doc-category').value,
          relief_category: container.querySelector('#doc-relief').value,
          description: container.querySelector('#doc-desc').value.trim(),
          status: 'reviewed',
        });
        showToast('Document updated');
      } catch (err) {
        showToast(err.message || 'Could not save', 'error');
      }
    });

    container.querySelector('#btn-delete-doc').addEventListener('click', async () => {
      if (!confirm('Delete this document? This cannot be undone.')) return;
      try {
        await deleteDocument(doc.id);
        showToast('Document deleted');
        ctx.navigate('/documents');
      } catch (err) {
        showToast(err.message || 'Could not delete', 'error');
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="page-header"><h1>Document</h1></div><div class="empty-state">Could not load document.</div>`;
  }
}
