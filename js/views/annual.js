import { getIncomeRecords, getReliefs, saveAnnualRecord, getAnnualRecord } from '../supabase.js';
import { num, fmt, commaNumber, MONTH_NAMES, showToast, escapeHtml } from '../utils.js';

const TAX_BANDS = [
  { lower:0,       upper:5000,      rate:0.00, base:0 },
  { lower:5000,    upper:20000,     rate:0.01, base:0 },
  { lower:20000,   upper:35000,     rate:0.03, base:150 },
  { lower:35000,   upper:50000,     rate:0.06, base:600 },
  { lower:50000,   upper:70000,     rate:0.11, base:1500 },
  { lower:70000,   upper:100000,    rate:0.19, base:3700 },
  { lower:100000,  upper:400000,    rate:0.25, base:9400 },
  { lower:400000,  upper:600000,    rate:0.26, base:84400 },
  { lower:600000,  upper:2000000,   rate:0.28, base:136400 },
  { lower:2000000, upper:Infinity,  rate:0.30, base:528400 },
];

function computeTax(ci) {
  if (ci <= 0) return { tax: 0, band: TAX_BANDS[0] };
  const band = TAX_BANDS.find(b => ci > b.lower && ci <= b.upper) || TAX_BANDS[TAX_BANDS.length - 1];
  const tax = band.base + (ci - band.lower) * band.rate;
  return { tax, band };
}

function beRow(code, label, amount, opts) {
  opts = opts || {};
  const cls = opts.cls ? ` class="${opts.cls}"` : '';
  const amtStr = (amount === null) ? '' : fmt(amount);
  return `<tr${cls}><td class="code">${escapeHtml(code)}</td><td class="item-label">${label}</td><td class="amt">${amtStr}</td></tr>`;
}

function beTextRow(code, label, value) {
  return `<tr><td class="code">${escapeHtml(code)}</td><td class="item-label">${escapeHtml(label)}</td><td class="amt">${escapeHtml(value) || '—'}</td></tr>`;
}

function beSection(title) {
  return `<tr class="section-head"><td colspan="3">${escapeHtml(title)}</td></tr>`;
}

export async function renderAnnual(container, ctx) {
  const now = new Date();
  const profile = ctx.profile();

  container.innerHTML = `
    <div class="page-header">
      <h1>Annual Statement & BE Form Worksheet</h1>
      <p class="greeting-sub">Year-end tax computation</p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Annual Summary</h2>
        <span class="tag">Year of Assessment</span>
      </div>
      <div class="toolbar">
        <select id="annual-year" aria-label="Year"></select>
        <button class="btn" id="btn-build-annual">Build annual statement</button>
      </div>
      <div class="save-status" id="annual-status">Pick a year and press Build — it pulls together every month you've saved.</div>
      <div id="annual-summary"></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>BE Form Worksheet</h2>
        <span class="tag">YA2025 · Employment Income</span>
      </div>
      <div class="stmt-meta">
        Annual income used for the worksheet below — defaults to your saved months' total net payment, editable if you need to adjust it.
      </div>
      <div class="calc-row income-in" style="padding:4px 22px 4px;">
        <label>Total annual income (RM)</label>
        <div class="income-in"><input type="number" id="be-income" placeholder="0"></div>
      </div>
      <div class="calc-row income-in" style="padding:4px 22px 4px;">
        <label>Zakat & fitrah paid (RM)</label>
        <div class="income-in"><input type="number" id="be-zakat" placeholder="0"></div>
      </div>
      <div class="calc-row income-in" style="padding:4px 22px 4px;">
        <label>CP500 self-instalments paid (RM)</label>
        <div class="income-in"><input type="number" id="be-cp500" placeholder="0"></div>
      </div>
      <div class="toolbar">
        <button class="btn" id="btn-build-be">Generate BE Form worksheet</button>
        <button class="btn secondary" id="btn-save-annual">Save annual record</button>
      </div>
      <div class="save-status" id="be-status">Fill in your relief checklist first, then generate.</div>
      <div id="be-worksheet"></div>
      <div class="rebate-note">
        This worksheet maps your figures to LHDN's YA2025 Form BE item codes (B1–B25, G1–G23) so you can copy them into MyTax e‑Filing — it does not submit anything to LHDN itself. Form BE is for employment income only; if your income comes from carrying on a profession or business (e.g. panel or locum fees), Form B applies instead and some item numbers differ. Confirm with LHDN or a tax agent before filing.
      </div>
    </div>
    <div class="disclaimer">
      Figures and reliefs reflect LHDN's published YA 2025 categories at the time of writing. This tool is for planning only, not tax advice — confirm eligibility and current caps on the official LHDN / MyTax portal or with a tax agent before filing.
    </div>`;

  const yearSel = container.querySelector('#annual-year');
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    yearSel.appendChild(o);
  }
  yearSel.value = now.getFullYear();

  const FIELDS = [
    'gross_income','current_debtor','inp_opd','staff_medical','write_off_income','debtor_payment',
    'management_fee','write_off_expense','cc_commission','adj_staff_medical',
    'rental','rental_rebate','sst','advance_payment','additional_staff','medical_bills'
  ];

  function calcNet(r) {
    const v = {};
    FIELDS.forEach(f => v[f] = num(r[f]));
    const afterDebtor = v.gross_income - v.current_debtor;
    const midTotal = afterDebtor + v.inp_opd + v.staff_medical + v.write_off_income + v.debtor_payment;
    const disb = midTotal - v.management_fee - v.write_off_expense - v.cc_commission - v.adj_staff_medical;
    return disb - v.rental + v.rental_rebate - v.sst - v.advance_payment - v.additional_staff - v.medical_bills;
  }

  container.querySelector('#btn-build-annual').addEventListener('click', async () => {
    const year = parseInt(yearSel.value);
    try {
      const records = await getIncomeRecords(year);
      const summaryEl = container.querySelector('#annual-summary');
      if (!records.length) {
        summaryEl.innerHTML = `<div class="empty-state">No saved months found for ${year} yet.</div>`;
        container.querySelector('#annual-status').textContent = `No data for ${year}.`;
        return;
      }
      let grossTotal = 0, netTotal = 0;
      const rows = records.map(r => {
        const gross = num(r.gross_income);
        const net = calcNet(r);
        grossTotal += gross;
        netTotal += net;
        return `<tr><td>${MONTH_NAMES[r.month - 1]} ${year}</td><td>${fmt(gross)}</td><td>${fmt(net)}</td></tr>`;
      });
      summaryEl.innerHTML = `<table class="annual-table"><tbody>
        ${rows.join('')}
        <tr class="total"><td>Annual total (${records.length} month${records.length > 1 ? 's' : ''} saved)</td><td>${fmt(grossTotal)}</td><td>${fmt(netTotal)}</td></tr>
      </tbody></table>`;
      container.querySelector('#annual-status').textContent = `Built from ${records.length} saved month${records.length > 1 ? 's' : ''} in ${year}.`;
      container.querySelector('#be-income').value = netTotal ? netTotal.toFixed(2) : '';
    } catch (err) {
      showToast('Could not load income records', 'error');
    }
  });

  container.querySelector('#btn-build-be').addEventListener('click', async () => {
    const year = parseInt(yearSel.value);
    let ra = {};
    try {
      const reliefRecord = await getReliefs(year);
      ra = reliefRecord?.relief_data?.amounts || {};
    } catch {}

    const grossAnnual = num(container.querySelector('#be-income').value);
    const professionalBody = ra['Professional body membership'] || 0;
    const B1 = Math.max(0, grossAnnual - professionalBody);
    const B9 = ra['Approved donations & gifts'] || 0;
    const B6 = B1;
    const B10 = Math.max(0, B6 - B9);

    const G1 = 9000;
    const G2 = ra['Medical & care for parents/grandparents'] || 0;
    const G3 = ra['Supporting equipment for disabled individual'] || 0;
    const G4 = ra['Disabled individual'] || 0;
    const G5 = ra['Education fees (self)'] || 0;
    const G6to8 = ra['Medical expenses – self, spouse or child'] || 0;
    const G9 = ra['Lifestyle relief'] || 0;
    const G10 = ra['Sports & fitness relief'] || 0;
    const G11 = ra['Breastfeeding equipment'] || 0;
    const G12 = ra['Registered childcare / kindergarten fees'] || 0;
    const G13 = ra['SSPN net savings'] || 0;
    const G14 = ra['Husband / wife / alimony'] || 0;
    const G15 = ra['Disabled husband or wife'] || 0;
    const G16a = ra['Child under 18'] || 0;
    const G16b = (ra['Child 18+, diploma & above / overseas degree'] || 0) + (ra['Child 18+, other full-time education'] || 0);
    const G16c = (ra['Unmarried disabled child'] || 0) + (ra['Disabled child in higher education'] || 0);
    const G17 = ra['EPF & life insurance/takaful'] || 0;
    const G18 = ra['PRS & deferred annuity'] || 0;
    const G19 = ra['Education & medical insurance'] || 0;
    const G20 = ra['SOCSO / EIS contributions'] || 0;
    const G21 = ra['EV charging & food-waste composting equipment'] || 0;
    const G22 = ra['First-home housing loan interest'] || 0;

    const B13 = G1+G2+G3+G4+G5+G6to8+G9+G10+G11+G12+G13+G14+G15+G16a+G16b+G16c+G17+G18+G19+G20+G21+G22;
    const B14 = Math.max(0, B10 - B13);
    const { tax: B18 } = computeTax(B14);
    const B19 = B18;

    const zakat = num(container.querySelector('#be-zakat').value);
    const cp500 = num(container.querySelector('#be-cp500').value);

    let selfSpouseRebate = 0;
    if (B14 <= 35000) {
      selfSpouseRebate += 400;
      if (G14 > 0) selfSpouseRebate += 400;
    }
    const B21 = Math.min(B19, selfSpouseRebate + zakat);
    const B22 = Math.max(0, B19 - B21);
    const B27 = cp500;
    const balance = B22 - B27;
    const B25 = Math.max(0, balance);
    const B26 = Math.max(0, -balance);

    const name = profile?.name || '';
    const ic = profile?.ic_number || '';
    const tin = profile?.tin || '';

    let html = '<table class="be-table"><tbody>';
    html += beSection('Basic Particulars');
    html += beTextRow('', 'Name', name);
    html += beTextRow('', 'MyKad / Identification no.', ic);
    html += beTextRow('TIN', 'Tax Identification No.', tin);
    html += beSection('Part BA · Computation of Chargeable Income');
    html += beRow('B1', 'Statutory income from employment (income entered, less professional subscriptions)', B1);
    html += beRow('B9', 'Approved donations / gifts / contributions', B9);
    html += beRow('B10', 'Total income', B10, {cls:'total'});
    html += beSection('Part G · Relief (self-computed)');
    html += beRow('G1', 'Individual & dependent relatives', G1);
    html += beRow('G2', 'Expenses for parents / grandparents', G2);
    html += beRow('G3', 'Basic supporting equipment (disabled)', G3);
    html += beRow('G4', 'Disabled individual', G4);
    html += beRow('G5', 'Education fees (self)', G5);
    html += beRow('G6–G8', 'Medical: serious illness / fertility / vaccination / dental / check-ups / child learning disability', G6to8);
    html += beRow('G9', 'Lifestyle relief', G9);
    html += beRow('G10', 'Sports & fitness relief', G10);
    html += beRow('G11', 'Breastfeeding equipment', G11);
    html += beRow('G12', 'Registered childcare / kindergarten fees', G12);
    html += beRow('G13', 'SSPN net savings', G13);
    html += beRow('G14', 'Husband / wife / alimony', G14);
    html += beRow('G15', 'Disabled husband or wife', G15);
    html += beRow('G16a', 'Child under 18', G16a);
    html += beRow('G16b', 'Child 18+ in full-time education', G16b);
    html += beRow('G16c', 'Disabled child (base + higher education)', G16c);
    html += beRow('G17', 'EPF & life insurance / takaful', G17);
    html += beRow('G18', 'PRS & deferred annuity', G18);
    html += beRow('G19', 'Education & medical insurance', G19);
    html += beRow('G20', 'SOCSO / EIS contributions', G20);
    html += beRow('G21', 'EV charging & food-waste composting equipment', G21);
    html += beRow('G22', 'First-home housing loan interest', G22);
    html += beRow('B13 / G23', 'Total relief', B13, {cls:'total'});
    html += beSection('Part BB–BC · Tax Computation');
    html += beRow('B14', 'Chargeable income', B14, {cls:'total'});
    html += beRow('B18 / B19', 'Total income tax (YA2025 schedule)', B19);
    html += beRow('B21', 'Total rebate — RM400 self' + (G14 > 0 ? ' + RM400 spouse' : '') + (zakat > 0 ? ` + RM${commaNumber(zakat, 0)} zakat/fitrah` : '') + (B14 > 35000 && selfSpouseRebate === 0 ? ' (self/spouse RM400 not eligible — income above RM35,000)' : ''), B21);
    html += beRow('B22', 'Tax charged after rebate', B22);
    html += beRow('B27', 'CP500 self-instalments paid', B27);
    if (B26 > 0) {
      html += beRow('B26', 'Tax paid in excess (refundable)', B26, {cls:'final'});
    } else {
      html += beRow('B25', 'Balance of tax payable', B25, {cls:'final'});
    }
    html += '</tbody></table>';

    container.querySelector('#be-worksheet').innerHTML = html;
    container.querySelector('#be-status').textContent = 'Worksheet generated from your relief checklist and the figures above.';
  });

  container.querySelector('#btn-save-annual').addEventListener('click', async () => {
    const year = parseInt(yearSel.value);
    const grossAnnual = num(container.querySelector('#be-income').value);
    const zakat = num(container.querySelector('#be-zakat').value);
    const cp500 = num(container.querySelector('#be-cp500').value);

    let totalReliefs = 0;
    try {
      const reliefRecord = await getReliefs(year);
      totalReliefs = reliefRecord?.total_relief || 0;
    } catch {}

    const chargeableIncome = Math.max(0, grossAnnual - totalReliefs);
    const { tax } = computeTax(chargeableIncome);

    try {
      await saveAnnualRecord({
        tax_year: year,
        annual_income: grossAnnual,
        total_reliefs: totalReliefs,
        chargeable_income: chargeableIncome,
        tax_payable: tax,
        zakat,
        cp500,
        be_worksheet: { generated_at: new Date().toISOString() },
      });
      showToast('Annual record saved');
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });

  try {
    const saved = await getAnnualRecord(parseInt(yearSel.value));
    if (saved) {
      if (saved.annual_income) container.querySelector('#be-income').value = saved.annual_income;
      if (saved.zakat) container.querySelector('#be-zakat').value = saved.zakat;
      if (saved.cp500) container.querySelector('#be-cp500').value = saved.cp500;
    }
  } catch {}
}
