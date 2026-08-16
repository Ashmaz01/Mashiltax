import { resizeImage } from './utils.js';

const DATE_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;
const MALAY_DATE_RE = /(\d{1,2})\s+(Jan(?:uari)?|Feb(?:ruari)?|Mac|Apr(?:il)?|Mei|Jun|Jul(?:ai)?|Ogos?|Sep(?:tember)?|Okt(?:ober)?|Nov(?:ember)?|Dis(?:ember)?)\s+(\d{2,4})/gi;

const MONTH_MAP = {
  jan:1,januari:1,feb:2,februari:2,mac:3,mar:3,apr:4,april:4,mei:5,may:5,
  jun:6,jul:7,julai:7,ogo:8,ogos:8,aug:8,sep:9,september:9,okt:10,oktober:10,oct:10,
  nov:11,november:11,dis:12,disember:12,dec:12,
};

const CATEGORY_KEYWORDS = {
  'Medical': ['clinic','hospital','pharmacy','farmasi','klinik','medical','ubat','doctor','doktor','health','kesihatan','dental','pergigian'],
  'Education': ['university','universiti','college','kolej','tuition','school','sekolah','course','kursus','training','education','pendidikan','book','buku','bookcafe','bookstore'],
  'Lifestyle': ['phone','laptop','computer','tablet','internet','broadband','newspaper','magazine','subscription'],
  'Sports & Fitness': ['gym','fitness','sport','sukan','badminton','swimming','yoga','exercise'],
  'Insurance': ['insurance','insurans','takaful','premium','polisi'],
  'Childcare': ['nursery','kindergarten','tadika','taska','childcare','daycare'],
  'Parents/Grandparents': ['nursing home','hospital','medical','parent','ibu','bapa'],
  'EPF/SOCSO': ['kwsp','epf','socso','perkeso','eis'],
  'Donations': ['donation','derma','sumbangan','zakat','wakaf','masjid','mosque'],
};

const TOTAL_PATTERNS = [
  /NETT?\s*TOTAL/i,
  /GRAND\s*TOTAL/i,
  /JUMLAH\s*BESAR/i,
  /TOTAL\s*(?:AMOUNT|BAYAR|HARGA)/i,
];
const SUBTOTAL_PATTERNS = [
  /SUB\s*TOTAL/i,
  /TOTAL/i,
  /JUMLAH/i,
  /AMOUNT/i,
  /BAYAR/i,
];

function parseAmount(text) {
  const lines = text.split('\n');

  for (const patterns of [TOTAL_PATTERNS, SUBTOTAL_PATTERNS]) {
    for (const line of lines) {
      for (const pat of patterns) {
        if (pat.test(line)) {
          const amounts = [...line.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})/g)]
            .map(m => parseFloat(m[1].replace(/,/g, '')))
            .filter(v => v > 0);
          if (amounts.length) return Math.max(...amounts);
        }
      }
    }
  }

  const rmLines = lines.filter(l => /RM|MYR/i.test(l));
  for (const line of rmLines) {
    const amounts = [...line.matchAll(/(?:RM|MYR)\s*([\d,]+\.\d{2})/gi)]
      .map(m => parseFloat(m[1].replace(/,/g, '')))
      .filter(v => v > 0);
    if (amounts.length) return Math.max(...amounts);
  }

  const allAmounts = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})/g)]
    .map(m => parseFloat(m[1].replace(/,/g, '')))
    .filter(v => v > 0);
  return allAmounts.length ? Math.max(...allAmounts) : null;
}

function parseDate(text) {
  let match = MALAY_DATE_RE.exec(text);
  MALAY_DATE_RE.lastIndex = 0;
  if (match) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase().slice(0, 3);
    const month = MONTH_MAP[monthStr];
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dateMatches = [...text.matchAll(DATE_RE)];
  for (const m of dateMatches) {
    let [, a, b, c] = m;
    let day, month, year;
    c = parseInt(c);
    if (c < 100) c += 2000;
    if (c >= 2000 && c <= 2099) {
      day = parseInt(a);
      month = parseInt(b);
      year = c;
    } else {
      continue;
    }
    if (month > 12) { [day, month] = [month, day]; }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseMerchant(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  const skipRe = /^(date|tarikh|masa|time|tel|fax|no\.|tax|gst|sst|invoice|receipt|resit|order|cashier|welcome|qty|item|disc)/i;
  const junkRe = /RM|MYR|\d{2}[\/\-.]\d{2}/i;

  for (const line of lines.slice(0, 8)) {
    const clean = line.replace(/[^a-zA-Z0-9\s&'.,-]/g, '').trim();
    if (clean.length < 3) continue;
    if (/^\d+$/.test(clean)) continue;
    if (skipRe.test(clean)) continue;
    if (junkRe.test(clean)) continue;

    const letters = clean.replace(/[^a-zA-Z]/g, '').length;
    if (letters < 3) continue;

    return clean.slice(0, 80);
  }
  return '';
}

function parseLineItems(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  const stopRe = /^(sub\s*total|total|jumlah|nett|grand|tax|sst|gst|rounding|voucher|change|tunai|kad|cash|plastik\b.*(?:bag|beg))/i;
  const priceLineRe = /(\d+)\s*[xX×]\s*(\d{1,3}(?:,\d{3})*\.\d{2})/;
  const trailingPriceRe = /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/;

  let itemName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (stopRe.test(line)) break;

    const qtyMatch = priceLineRe.exec(line);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1]);
      const unitPrice = parseFloat(qtyMatch[2].replace(/,/g, ''));

      const nettMatch = trailingPriceRe.exec(line);
      const nett = nettMatch ? parseFloat(nettMatch[1].replace(/,/g, '')) : qty * unitPrice;

      if (itemName && unitPrice > 0) {
        items.push({
          name: itemName.slice(0, 120),
          qty,
          unit_price: unitPrice,
          amount: nett,
        });
      }
      itemName = '';
      continue;
    }

    if (/^(SKU|Disc\s|disc\s|\*\*)/i.test(line)) continue;

    const priceMatch = trailingPriceRe.exec(line);
    if (priceMatch) {
      const amount = parseFloat(priceMatch[1].replace(/,/g, ''));
      const name = line.replace(trailingPriceRe, '').replace(/RM|MYR/gi, '').trim();
      if (name.length > 2 && amount > 0 && !stopRe.test(line)) {
        items.push({ name: name.slice(0, 120), qty: 1, unit_price: amount, amount });
        itemName = '';
        continue;
      }
    }

    const cleaned = line.replace(/[^a-zA-Z0-9\s&'.,()\-]/g, '').trim();
    if (cleaned.length > 2 && /[a-zA-Z]{2}/.test(cleaned)) {
      itemName = itemName ? itemName + ' ' + cleaned : cleaned;
    }
  }

  return items;
}

function guessCategory(text) {
  const lower = text.toLowerCase();
  let bestCat = 'Other';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }
  return bestScore > 0 ? bestCat : 'Other';
}

function guessDocType(text) {
  const lower = text.toLowerCase();
  if (/zakat|fitrah|lembaga\s*zakat/i.test(lower)) return 'zakat';
  if (/cp\s*500|ansuran\s*cukai|instalment/i.test(lower)) return 'cp500';
  if (/salary|gaji|payslip|pay\s*slip|income\s*statement/i.test(lower)) return 'income_statement';
  return 'receipt';
}

export async function runOCR(file) {
  let imageBlob = file;
  if (file.type.startsWith('image/') && file.size > 300 * 1024) {
    imageBlob = await resizeImage(file, 1200);
  }

  const worker = await Tesseract.createWorker('eng+msa', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
  });

  try {
    const { data } = await worker.recognize(imageBlob);
    const text = data.text || '';
    const confidence = data.confidence || 0;

    if (!text.trim()) {
      return null;
    }

    const lineItems = parseLineItems(text);
    const totalFromItems = lineItems.reduce((s, it) => s + it.amount, 0);

    return {
      document_type: guessDocType(text),
      merchant: parseMerchant(text),
      date: parseDate(text),
      amount: parseAmount(text) || (totalFromItems > 0 ? totalFromItems : null),
      category: guessCategory(text),
      line_items: lineItems,
      description: text.split('\n').filter(l => l.trim()).slice(0, 3).join(' ').slice(0, 120),
      confidence: Math.round(confidence),
      raw_text: text,
    };
  } finally {
    await worker.terminate();
  }
}
