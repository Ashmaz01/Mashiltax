import { getProfile, updateProfile, signOut } from '../supabase.js';
import { escapeHtml, showToast } from '../utils.js';

export async function renderProfile(container, ctx) {
  const profile = ctx.profile();

  container.innerHTML = `
    <div class="page-header">
      <h1>Profile</h1>
      <p class="greeting-sub">Your personal and tax information</p>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Personal Details</h2>
      </div>
      <div style="padding:16px 22px;">
        <div class="form-group">
          <label>Full Name</label>
          <input class="form-input" id="p-name" value="${escapeHtml(profile?.name || '')}">
        </div>
        <div class="form-group">
          <label>MyKad / IC Number</label>
          <input class="form-input" id="p-ic" value="${escapeHtml(profile?.ic_number || '')}" readonly style="opacity:0.7;">
          <div style="font-size:12px; color:var(--brass); margin-top:4px;">IC number cannot be changed — it's linked to your account.</div>
        </div>
        <div class="form-group">
          <label>Tax Identification Number (TIN)</label>
          <input class="form-input" id="p-tin" value="${escapeHtml(profile?.tin || '')}" placeholder="e.g. SG 12345678012">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input class="form-input" type="email" id="p-email" value="${escapeHtml(profile?.email || '')}" placeholder="Optional">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input class="form-input" type="tel" id="p-phone" value="${escapeHtml(profile?.phone || '')}" placeholder="Optional">
        </div>
        <div class="form-group">
          <label>Address</label>
          <textarea class="form-input" id="p-address" rows="2" placeholder="Optional">${escapeHtml(profile?.address || '')}</textarea>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Spouse Information</h2>
        <span class="tag">Optional</span>
      </div>
      <div style="padding:16px 22px;">
        <div class="form-group">
          <label>Spouse Name</label>
          <input class="form-input" id="p-spouse-name" value="${escapeHtml(profile?.spouse_name || '')}" placeholder="Optional">
        </div>
        <div class="form-group">
          <label>Spouse IC Number</label>
          <input class="form-input" id="p-spouse-ic" value="${escapeHtml(profile?.spouse_ic || '')}" placeholder="Optional">
        </div>
        <div class="form-group">
          <label>Spouse TIN</label>
          <input class="form-input" id="p-spouse-tin" value="${escapeHtml(profile?.spouse_tin || '')}" placeholder="Optional">
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Notes</h2>
      </div>
      <div style="padding:16px 22px;">
        <div class="form-group">
          <label>Personal notes or reminders</label>
          <textarea class="form-input" id="p-notes" rows="3" placeholder="Any notes for your reference...">${escapeHtml(profile?.notes || '')}</textarea>
        </div>
      </div>
    </div>
    <div style="padding:0 0 24px;">
      <button class="btn btn-block btn-lg" id="btn-save-profile" style="margin-bottom:12px;">Save Profile</button>
      <button class="btn btn-block danger" id="btn-signout">Sign Out</button>
    </div>
    <div class="save-status" id="profile-status" style="text-align:center; padding-bottom:16px;"></div>`;

  container.querySelector('#btn-save-profile').addEventListener('click', async () => {
    try {
      const updates = {
        name: container.querySelector('#p-name').value.trim(),
        tin: container.querySelector('#p-tin').value.trim() || null,
        email: container.querySelector('#p-email').value.trim() || null,
        phone: container.querySelector('#p-phone').value.trim() || null,
        address: container.querySelector('#p-address').value.trim() || null,
        spouse_name: container.querySelector('#p-spouse-name').value.trim() || null,
        spouse_ic: container.querySelector('#p-spouse-ic').value.trim() || null,
        spouse_tin: container.querySelector('#p-spouse-tin').value.trim() || null,
        notes: container.querySelector('#p-notes').value.trim() || null,
      };
      if (!updates.name) {
        showToast('Name is required', 'error');
        return;
      }
      await updateProfile(updates);
      await ctx.refreshProfile();
      showToast('Profile saved');
      container.querySelector('#profile-status').textContent = 'Saved just now';
    } catch (err) {
      showToast(err.message || 'Could not save profile', 'error');
    }
  });

  container.querySelector('#btn-signout').addEventListener('click', async () => {
    if (!confirm('Sign out of MashilTax?')) return;
    await signOut();
    window.location.hash = '';
    window.location.reload();
  });
}
