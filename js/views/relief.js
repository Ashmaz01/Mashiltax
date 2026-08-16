import { saveReliefs, getReliefs } from '../supabase.js';
import { num, fmt, commaNumber, showToast, escapeHtml } from '../utils.js';

const RELIEF_DATA = [
  { group: 'Individual & Family', items: [
    { name:'Individual & dependent relatives', cap:9000, note:'Automatic for every resident taxpayer.', auto:true },
    { name:'Disabled individual', cap:7000, note:'If certified disabled by the Dept. of Social Welfare (JKM).' },
    { name:'Husband / wife / alimony', cap:4000, note:'Spouse with no income, joint assessment, or alimony to a former spouse.' },
    { name:'Disabled husband or wife', cap:6000, note:'Additional relief if spouse is certified disabled.' },
  ]},
  { group: 'Education & Housing', items: [
    { name:'Education fees (self)', cap:7000, note:'Postgraduate, law, accounting, technical/vocational; RM2,000 sub-cap for skills courses.' },
    { name:'First-home housing loan interest', cap:7000, note:'SPA signed 2025–2027; up to RM7,000 (price ≤ RM500k) or RM5,000 (RM500,001–750k), for up to 3 years.' },
  ]},
  { group: 'Medical & Special Needs', items: [
    { name:'Medical expenses – self, spouse or child', cap:10000, note:'Serious illness, fertility treatment, vaccination, dental exam, check-ups (sub-caps RM1,000 each) and child learning-disability programmes (sub-cap RM6,000).' },
    { name:'Medical & care for parents/grandparents', cap:8000, note:'Treatment, dental, nursing home care; check-ups/vaccination sub-capped at RM1,000.' },
    { name:'Supporting equipment for disabled individual', cap:6000, note:'Wheelchairs, hearing aids, dialysis machines, artificial limbs.' },
  ]},
  { group: 'Lifestyle', items: [
    { name:'Lifestyle relief', cap:2500, note:'Combined cap RM2,500 — tick everything that applies, or describe anything not listed.', subitems:[
      { label:'Books, journals, magazines, printed or e-newspapers' },
      { label:'Personal computer, smartphone or tablet (not for business use)' },
      { label:'Internet subscription bill (registered under your own name)' },
      { label:'Skills improvement / self-development course fees' },
    ]},
    { name:'Sports & fitness relief', cap:1000, note:'Separate RM1,000 cap from lifestyle relief above.', subitems:[
      { label:'Sports equipment (as listed under the Sports Development Act 1997)' },
      { label:'Entry or rental fees for sports facilities' },
      { label:'Registration fees for sports competitions' },
      { label:'Gym membership or registered sports training fees' },
    ]},
    { name:'EV charging & food-waste composting equipment', cap:2500, note:'Combined cap RM2,500.', subitems:[
      { label:'EV charging equipment purchase or installation (home)' },
      { label:'EV charging facility subscription / rental fee' },
      { label:'Food-waste composting machine (household use)' },
    ]},
  ]},
  { group: 'Insurance & Savings', items: [
    { name:'EPF & life insurance/takaful', cap:7000, note:'Combined cap for EPF contributions and life insurance premiums.' },
    { name:'PRS & deferred annuity', cap:3000, note:'Private Retirement Scheme contributions, relief extended to YA2030.' },
    { name:'Education & medical insurance', cap:4000, note:'Premiums for self, spouse or children.' },
    { name:'SOCSO / EIS contributions', cap:350, note:'Employee contributions to SOCSO and the Employment Insurance System.' },
    { name:'SSPN net savings', cap:8000, note:'Net deposits (deposits minus withdrawals) for a child’s education savings.' },
  ]},
  { group: 'Children', items: [
    { name:'Child under 18', cap:2000, note:'Per unmarried child under 18 — enter total across all such children.' },
    { name:'Child 18+, diploma & above / overseas degree', cap:8000, note:'Full-time study, per child.' },
    { name:'Child 18+, other full-time education', cap:2000, note:'Full-time study not covered above, per child.' },
    { name:'Unmarried disabled child', cap:8000, note:'Base relief per disabled child.' },
    { name:'Disabled child in higher education', cap:8000, note:'Additional relief on top of the disabled-child relief above.' },
    { name:'Registered childcare / kindergarten fees', cap:3000, note:'Children aged 6 and below.' },
    { name:'Breastfeeding equipment', cap:1000, note:'Own child aged 2 and below; claimable once every 2 years.' },
  ]},
  { group: 'Deductions (reduce aggregate income)', items: [
    { name:'Approved donations & gifts', cap:1000000, note:'Usually capped at 10% of aggregate income — enter the amount you’re claiming.' },
    { name:'Professional body membership', cap:1000000, note:'No fixed ceiling; must be required for your profession (e.g. medical, legal, accounting body).' },
  ]},
];

export async function renderRelief(container, ctx) {
  const taxYear = new Date().getFullYear();
  let reliefAmounts = {};
  const categoryCalcs = [];
  let idCounter = 0;

  container.innerHTML = `
    <div class="page-header">
      <h1>Personal Tax Relief Checklist</h1>
      <p class="greeting-sub">YA ${taxYear} · File in ${taxYear + 1}</p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Relief Checklist</h2>
        <span class="tag">YA ${taxYear}</span>
      </div>
      <div class="toolbar">
        <button class="btn" id="btn-save-relief">Save checklist</button>
      </div>
      <div class="save-status" id="relief-status">—</div>
      <div class="relief-intro">
        Tick what applies to you, enter what you actually spent or contributed — the box automatically caps itself at LHDN's limit for YA ${taxYear}. Reliefs lower your <b>chargeable income</b>; deductions lower <b>aggregate income</b>; rebates cut the final tax bill directly. Keep receipts for 7 years.
      </div>
      <div id="relief-groups"></div>
      <div class="calc-box">
        <div class="calc-row income-in">
          <label>Annual income before reliefs (optional, RM)</label>
          <div class="income-in"><input type="number" id="gross-income-input" placeholder="e.g. 200000"></div>
        </div>
        <div class="calc-row total">
          <span>Total reliefs & deductions ticked</span>
          <span class="v" id="total-relief">RM 0.00</span>
        </div>
        <div class="calc-row final">
          <span>Estimated chargeable income after reliefs</span>
          <span class="v" id="chargeable">—</span>
        </div>
        <div class="rebate-note">Automatic RM9,000 individual relief is already included below. If your chargeable income lands at or under RM35,000, you and a non-working spouse may each qualify for a further RM400 rebate off the tax payable — a rebate, not a relief, so it isn’t part of the total above.</div>
      </div>
    </div>
    <div class="disclaimer">
      Figures and reliefs reflect LHDN’s published YA ${taxYear} categories at the time of writing. This tool is for planning only, not tax advice — confirm eligibility and current caps on the official LHDN / MyTax portal or with a tax agent before filing.
    </div>`;

  const groupsEl = container.querySelector('#relief-groups');

  function recalcRelief() {
    let total = 0;
    reliefAmounts = {};
    container.querySelectorAll('#relief-groups > .relief-group > .relief-item').forEach(row => {
      const chk = row.querySelector('input[type=checkbox]');
      const amt = row.querySelector('input[type=number]');
      const v = chk.checked ? num(amt.value) : 0;
      if (chk.checked) total += v;
      if (row.dataset.name) reliefAmounts[row.dataset.name] = v;
    });
    categoryCalcs.forEach(c => {
      const raw = c.getSum();
      const capped = Math.min(raw, c.cap);
      total += capped;
      reliefAmounts[c.name] = capped;
      const over = raw > c.cap;
      c.valEl.textContent = `RM ${commaNumber(raw, 2)} of RM${commaNumber(c.cap, 0)}`;
      c.valEl.className = 'val ' + (over ? 'capped' : (raw > 0 ? 'ok' : ''));
      if (over) c.valEl.textContent += ' — capped';
    });
    container.querySelector('#total-relief').textContent = fmt(total);
    const gi = num(container.querySelector('#gross-income-input').value);
    const chargeableEl = container.querySelector('#chargeable');
    if (gi > 0) {
      chargeableEl.textContent = fmt(Math.max(0, gi - total));
    } else {
      chargeableEl.textContent = '— enter income above —';
    }
  }

  function renderCategory(item, parentEl) {
    const cat = document.createElement('div');
    cat.className = 'relief-category';
    const capLabel = 'cap RM' + commaNumber(item.cap, 0);
    cat.innerHTML = `
      <div class="relief-category-head"><span class="name">${escapeHtml(item.name)}</span><span class="cap">${capLabel}</span></div>
      <div class="relief-category-note">${escapeHtml(item.note)}</div>`;

    const rowRefs = [];
    const allSubs = item.subitems.concat([{ label: null, isOther: true }]);

    allSubs.forEach(sub => {
      idCounter++;
      const row = document.createElement('div');
      row.className = 'relief-sub' + (sub.isOther ? ' other' : '');
      if (sub.isOther) {
        row.innerHTML = `
          <input type="checkbox" id="chk${idCounter}">
          <div class="lbl">Other — describe what you’re claiming
            <input type="text" class="stmt" id="stmt${idCounter}" placeholder="e.g. e-book subscription, tablet stylus...">
          </div>
          <div class="amt-in"><div class="row"><span>RM</span><input type="number" id="amt${idCounter}" min="0" placeholder="0"></div></div>`;
      } else {
        row.innerHTML = `
          <input type="checkbox" id="chk${idCounter}">
          <div class="lbl">${escapeHtml(sub.label)}</div>
          <div class="amt-in"><div class="row"><span>RM</span><input type="number" id="amt${idCounter}" min="0" placeholder="0"></div></div>`;
      }
      cat.appendChild(row);
      const chk = row.querySelector(`#chk${idCounter}`);
      const amt = row.querySelector(`#amt${idCounter}`);
      function sync() {
        row.classList.toggle('disabled', !chk.checked);
        amt.disabled = !chk.checked;
        recalcRelief();
      }
      chk.addEventListener('change', sync);
      amt.addEventListener('input', recalcRelief);
      rowRefs.push({ chk, amt, id: idCounter, sub });
    });

    const totalRow = document.createElement('div');
    totalRow.className = 'relief-category-total';
    totalRow.innerHTML = `<span>Category subtotal</span><span class="val">RM 0.00 of RM${commaNumber(item.cap, 0)}</span>`;
    cat.appendChild(totalRow);

    categoryCalcs.push({
      name: item.name,
      cap: item.cap,
      valEl: totalRow.querySelector('.val'),
      getSum() {
        let raw = 0;
        rowRefs.forEach(r => { if (r.chk.checked) raw += num(r.amt.value); });
        return raw;
      },
      rowRefs,
    });

    parentEl.appendChild(cat);
  }

  RELIEF_DATA.forEach(g => {
    const gh = document.createElement('div');
    gh.className = 'relief-group';
    const head = document.createElement('div');
    head.className = 'relief-group-head';
    head.textContent = g.group;
    gh.appendChild(head);

    g.items.forEach(item => {
      if (item.subitems) {
        renderCategory(item, gh);
        return;
      }
      idCounter++;
      const row = document.createElement('div');
      row.className = 'relief-item';
      row.dataset.name = item.name;
      const capLabel = item.cap >= 1000000 ? 'no fixed cap' : ('cap RM' + commaNumber(item.cap, 0));
      row.innerHTML = `
        <input type="checkbox" id="chk${idCounter}" ${item.auto ? 'checked disabled' : ''}>
        <div class="info">
          <div class="name">${escapeHtml(item.name)}</div>
          <div class="cap">${escapeHtml(item.note)} <em>(${capLabel})</em></div>
          <div class="over" id="over${idCounter}" style="display:none;"></div>
        </div>
        <div class="amt-in">
          <div class="row"><span>RM</span><input type="number" id="amt${idCounter}" min="0" ${item.auto ? `value="${item.cap}" disabled` : 'placeholder="0"'}></div>
        </div>`;
      gh.appendChild(row);

      const chk = row.querySelector(`#chk${idCounter}`);
      const amt = row.querySelector(`#amt${idCounter}`);
      const over = row.querySelector(`#over${idCounter}`);

      function sync() {
        row.classList.toggle('disabled', !chk.checked);
        amt.disabled = !chk.checked || item.auto;
        let v = num(amt.value);
        if (v > item.cap) { amt.value = item.cap; v = item.cap; over.style.display = 'block'; over.textContent = `Capped at RM${commaNumber(item.cap, 0)}`; }
        else { over.style.display = 'none'; }
        recalcRelief();
      }
      chk.addEventListener('change', sync);
      amt.addEventListener('input', sync);
      if (item.auto) sync();
    });
    groupsEl.appendChild(gh);
  });

  container.querySelector('#gross-income-input').addEventListener('input', recalcRelief);

  function gatherState() {
    const state = {};
    container.querySelectorAll('#relief-groups input, #relief-groups select').forEach(el => {
      if (!el.id) return;
      state[el.id] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    return state;
  }

  function applyState(state) {
    Object.keys(state).forEach(id => {
      const el = container.querySelector('#' + id);
      if (!el) return;
      if (el.type === 'checkbox') { if (!el.disabled) el.checked = state[id]; }
      else { el.value = state[id]; }
    });
    container.querySelectorAll('#relief-groups input[type=checkbox]').forEach(chk =>
      chk.dispatchEvent(new Event('change'))
    );
  }

  function getTotalRelief() {
    let total = 0;
    container.querySelectorAll('#relief-groups > .relief-group > .relief-item').forEach(row => {
      const chk = row.querySelector('input[type=checkbox]');
      const amt = row.querySelector('input[type=number]');
      if (chk.checked) total += num(amt.value);
    });
    categoryCalcs.forEach(c => { total += Math.min(c.getSum(), c.cap); });
    return total;
  }

  container.querySelector('#btn-save-relief').addEventListener('click', async () => {
    try {
      const total = getTotalRelief();
      await saveReliefs(taxYear, { state: gatherState(), amounts: reliefAmounts }, total);
      showToast('Relief checklist saved');
      container.querySelector('#relief-status').textContent = `Saved just now`;
    } catch (err) {
      showToast(err.message || 'Could not save', 'error');
    }
  });

  try {
    const saved = await getReliefs(taxYear);
    if (saved?.relief_data?.state) {
      applyState(saved.relief_data.state);
      container.querySelector('#relief-status').textContent = `Last saved ${new Date(saved.updated_at).toLocaleString()}`;
    }
  } catch {}

  return { getReliefAmounts: () => ({ ...reliefAmounts }) };
}
