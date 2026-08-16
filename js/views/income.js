import { saveIncomeRecord, getIncomeRecords, deleteIncomeRecord } from '../supabase.js';
import { num, fmt, MONTH_NAMES, showToast, escapeHtml } from '../utils.js';

const FIELDS = [
  { key: 'gross_income',      label: 'Gross Income',                    section: 'income' },
  { key: 'current_debtor',    label: 'Current Debtor',                  section: 'income', neg: true },
  { key: 'inp_opd',           label: 'INP / OPD',                      section: 'adjust' },
  { key: 'staff_medical',     label: 'Staff Medical',                   section: 'adjust' },
  { key: 'write_off_income',  label: 'Write-Off Income',               section: 'adjust' },
  { key: 'debtor_payment',    label: 'Debtor Payment',                  section: 'adjust' },
  { key: 'management_fee',    label: 'Management Fee',                  section: 'deduct', neg: true },
  { key: 'write_off_expense', label: 'Write-Off Expense',              section: 'deduct', neg: true },
  { key: 'cc_commission',     label: 'Credit Card Commission',         section: 'deduct', neg: true },
  { key: 'adj_staff_medical', label: 'Adjusted Staff Medical',         section: 'deduct', neg: true },
  { key: 'rental',            label: 'Rental',                          section: 'final', neg: true },
  { key: 'rental_rebate',     label: 'Rental Rebate',                  section: 'final' },
  { key: 'sst',               label: 'SST',                            section: 'final', neg: true },
  { key: 'advance_payment',   label: 'Advance Payment',                section: 'final', neg: true },
  { key: 'additional_staff',  label: 'Additional Staff',               section: 'final', neg: true },
  { key: 'medical_bills',     label: 'Medical Bills',                  section: 'final', neg: true },
];

function calcTotals(v) {
  const totalGross = v.gross_income;
  const afterDebtor = totalGross - v.current_debtor;
  const midTotal = afterDebtor + v.inp_opd + v.staff_medical + v.write_off_income + v.debtor_payment;
  const disb = midTotal - v.management_fee - v.write_off_expense - v.cc_commission - v.adj_staff_medical;
  const net = disb - v.rental + v.rental_rebate - v.sst - v.advance_payment - v.additional_staff - v.medical_bills;
  return { totalGross, midTotal, disb, net };
}

export async function renderIncome(container, ctx) {
  const now = new Date();
  let selMonth = now.getMonth() + 1;
  let selYear = now.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <h1>Income Statement</h1>
      <p class="greeting-sub">Monthly consultant income ledger</p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Monthly Statement</h2>
        <span class="tag">Consultant Ledger</span>
      </div>
      <div class="toolbar">
        <select id="stmt-month" aria-label="Month"></select>
        <select id="stmt-year" aria-label="Year"></select>
        <button class="btn" id="btn-save-stmt">Save</button>
      </div>
      <div class="save-status" id="stmt-status">Select a month and enter your figures.</div>
      <table class="ledger" id="ledger-table"><tbody>
        <tr class="subtotal"><td class="label" colspan="2" style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--brass);">Income</td></tr>
        ${renderLedgerRows('income')}
        <tr class="subtotal"><td class="label">Gross Income</td><td class="amt static" id="t_gross">RM 0.00</td></tr>
        <tr class="subtotal"><td class="label" colspan="2" style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--brass);">Adjustments</td></tr>
        ${renderLedgerRows('adjust')}
        <tr class="subtotal"><td class="label">Mid Total</td><td class="amt static" id="t_mid">RM 0.00</td></tr>
        <tr class="subtotal"><td class="label" colspan="2" style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--brass);">Deductions</td></tr>
        ${renderLedgerRows('deduct')}
        <tr class="subtotal"><td class="label">Disbursement</td><td class="amt static" id="t_disb">RM 0.00</td></tr>
        <tr class="subtotal"><td class="label" colspan="2" style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:var(--brass);">Final Adjustments</td></tr>
        ${renderLedgerRows('final')}
      </tbody></table>
      <div class="net-row">
        <span>Net Payment</span>
        <span id="net-payment">RM 0.00</span>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Saved Months</h2>
        <span class="tag" id="saved-year-tag">${selYear}</span>
      </div>
      <div id="saved-list"><div class="empty-state">Loading...</div></div>
    </div>`;

  const monthSel = container.querySelector('#stmt-month');
  const yearSel = container.querySelector('#stmt-year');
  MONTH_NAMES.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = i + 1;
    o.textContent = m;
    monthSel.appendChild(o);
  });
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }
  monthSel.value = selMonth;
  yearSel.value = selYear;

  function getValues() {
    const v = {};
    FIELDS.forEach(f => { v[f.key] = num(container.querySelector(`[data-k="${f.key}"]`)?.value); });
    return v;
  }

  function recalc() {
    const v = getValues();
    const t = calcTotals(v);
    const el = (id) => container.querySelector('#' + id);
    el('t_gross').textContent = fmt(t.totalGross);
    el('t_mid').textContent = fmt(t.midTotal);
    el('t_disb').textContent = fmt(t.disb);
    el('net-payment').textContent = fmt(t.net);
  }

  container.querySelectorAll('#ledger-table input').forEach(inp => inp.addEventListener('input', recalc));

  async function loadMonth() {
    selMonth = parseInt(monthSel.value);
    selYear = parseInt(yearSel.value);
    const records = await getIncomeRecords(selYear);
    const rec = records.find(r => r.month === selMonth);
    FIELDS.forEach(f => {
      const inp = container.querySelector(`[data-k="${f.key}"]`);
      if (inp) inp.value = rec ? (rec[f.key] || 0) : 0;
    });
    container.querySelector('#stmt-status').textContent = rec
      ? `Last saved ${new Date(rec.updated_at).toLocaleString()}`
      : 'Not saved yet for this month.';
    recalc();
  }

  monthSel.addEventListener('change', loadMonth);
  yearSel.addEventListener('change', () => {
    loadMonth();
    loadSavedList();
    container.querySelector('#saved-year-tag').textContent = yearSel.value;
  });

  container.querySelector('#btn-save-stmt').addEventListener('click', async () => {
    const v = getValues();
    const t = calcTotals(v);
    const record = {
      year: parseInt(yearSel.value),
      month: parseInt(monthSel.value),
      ...v,
      net_payment: t.net,
    };
    try {
      await saveIncomeRecord(record);
      showToast('Statement saved');
      container.querySelector('#stmt-status').textContent = `Saved just now`;
      loadSavedList();
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });

  async function loadSavedList() {
    const year = parseInt(yearSel.value);
    const listEl = container.querySelector('#saved-list');
    try {
      const records = await getIncomeRecords(year);
      if (!records.length) {
        listEl.innerHTML = '<div class="empty-state">No months saved for this year yet.</div>';
        return;
      }
      listEl.innerHTML = records.map(r => {
        const v = {};
        FIELDS.forEach(f => { v[f.key] = num(r[f.key]); });
        const t = calcTotals(v);
        return `
          <div class="doc-list-item" data-month="${r.month}">
            <div class="doc-info">
              <div class="doc-name">${MONTH_NAMES[r.month - 1]} ${r.year}</div>
              <div class="doc-meta">Gross: ${fmt(t.totalGross)}</div>
            </div>
            <div class="doc-amount">${fmt(t.net)}</div>
          </div>`;
      }).join('');
      listEl.querySelectorAll('[data-month]').forEach(el => {
        el.addEventListener('click', () => {
          monthSel.value = el.dataset.month;
          loadMonth();
        });
      });
    } catch {
      listEl.innerHTML = '<div class="empty-state">Could not load saved months.</div>';
    }
  }

  await Promise.all([loadMonth(), loadSavedList()]);
}

function renderLedgerRows(section) {
  return FIELDS.filter(f => f.section === section).map(f => {
    const cls = f.neg ? ' class="neg"' : '';
    return `<tr${cls}><td class="label">${escapeHtml(f.label)}</td><td class="amt"><input type="number" data-k="${f.key}" value="0" inputmode="decimal"></td></tr>`;
  }).join('');
}
