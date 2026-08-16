import { CONFIG } from './config.js';
import { icToEmail } from './utils.js';

const { createClient } = window.supabase;
export const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);

export async function signUp(name, icNumber, accessCode) {
  const email = icToEmail(icNumber);
  const { data, error } = await sb.auth.signUp({ email, password: accessCode });
  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('This IC number is already registered. Please sign in instead.');
    }
    throw error;
  }
  const user = data.user;
  if (!user) throw new Error('Registration failed. Please try again.');

  const { error: profileError } = await sb.from('profiles').insert({
    user_id: user.id,
    name,
    ic_number: icNumber,
  });
  if (profileError) throw profileError;
  return user;
}

export async function signIn(icNumber, accessCode) {
  const email = icToEmail(icNumber);
  const { data, error } = await sb.auth.signInWithPassword({ email, password: accessCode });
  if (error) throw new Error('Invalid IC number or access code. Please try again.');
  return data.user;
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

export async function getProfile() {
  const { data } = await sb.from('profiles').select('*').single();
  return data;
}

export async function updateProfile(updates) {
  const session = await getSession();
  const { data, error } = await sb.from('profiles')
    .update(updates)
    .eq('user_id', session.user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveIncomeRecord(record) {
  const session = await getSession();
  const payload = { ...record, user_id: session.user.id };
  const { data, error } = await sb.from('income_records')
    .upsert(payload, { onConflict: 'user_id,year,month' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getIncomeRecords(year) {
  const { data, error } = await sb.from('income_records')
    .select('*')
    .eq('year', year)
    .order('month');
  if (error) throw error;
  return data || [];
}

export async function getIncomeRecord(year, month) {
  const { data } = await sb.from('income_records')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  return data;
}

export async function deleteIncomeRecord(id) {
  const { error } = await sb.from('income_records').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadDocument(file, userId) {
  const ext = file.name.split('.').pop() || 'jpg';
  const safeName = `${Date.now()}.${ext}`;
  const path = `${userId}/${safeName}`;
  const { error } = await sb.storage.from('documents').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getDocumentUrl(path) {
  const { data } = await sb.storage.from('documents').createSignedUrl(path, 3600);
  return data?.signedUrl || '';
}

export async function saveDocument(doc) {
  const session = await getSession();
  const payload = { ...doc, user_id: session.user.id };
  const { data, error } = await sb.from('documents').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDocument(id, updates) {
  const { data, error } = await sb.from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDocuments(filters = {}) {
  let query = sb.from('documents').select('*').order('created_at', { ascending: false });
  if (filters.type && filters.type !== 'all') query = query.eq('document_type', filters.type);
  if (filters.search) query = query.or(`merchant.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getDocument(id) {
  const { data } = await sb.from('documents').select('*').eq('id', id).single();
  return data;
}

export async function deleteDocument(id) {
  const doc = await getDocument(id);
  if (doc?.file_path) {
    await sb.storage.from('documents').remove([doc.file_path]);
  }
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) throw error;
}

export async function saveReliefs(taxYear, reliefData, totalRelief) {
  const session = await getSession();
  const { data, error } = await sb.from('tax_reliefs')
    .upsert({
      user_id: session.user.id,
      tax_year: taxYear,
      relief_data: reliefData,
      total_relief: totalRelief,
    }, { onConflict: 'user_id,tax_year' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getReliefs(taxYear) {
  const { data } = await sb.from('tax_reliefs')
    .select('*')
    .eq('tax_year', taxYear)
    .maybeSingle();
  return data;
}

export async function saveAnnualRecord(record) {
  const session = await getSession();
  const { data, error } = await sb.from('annual_records')
    .upsert({ ...record, user_id: session.user.id }, { onConflict: 'user_id,tax_year' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAnnualRecord(taxYear) {
  const { data } = await sb.from('annual_records')
    .select('*')
    .eq('tax_year', taxYear)
    .maybeSingle();
  return data;
}

export async function getDashboardStats() {
  const year = new Date().getFullYear();
  const [income, docs, reliefs] = await Promise.all([
    sb.from('income_records').select('net_payment').eq('year', year),
    sb.from('documents').select('id', { count: 'exact', head: true }),
    sb.from('tax_reliefs').select('total_relief').eq('tax_year', year).maybeSingle(),
  ]);
  const annualIncome = (income.data || []).reduce((s, r) => s + parseFloat(r.net_payment || 0), 0);
  const totalRelief = reliefs.data ? parseFloat(reliefs.data.total_relief || 0) : 0;
  return {
    annualIncome,
    totalRelief,
    documentCount: docs.count || 0,
    chargeableIncome: Math.max(0, annualIncome - totalRelief),
  };
}

export async function processOCR(file) {
  const formData = new FormData();
  formData.append('image', file);
  const session = await getSession();
  const resp = await fetch(CONFIG.ocrEndpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` },
    body: formData,
  });
  if (!resp.ok) throw new Error('OCR processing failed');
  return resp.json();
}
