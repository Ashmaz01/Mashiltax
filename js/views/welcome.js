import { signUp, signIn } from '../supabase.js';
import { generateAccessCode, showToast, escapeHtml } from '../utils.js';

export function renderWelcome(container, onSuccess) {
  let mode = 'register';
  let generatedCode = null;

  function render() {
    if (mode === 'code-display') {
      container.innerHTML = `
      <div class="welcome-page">
        <div class="welcome-card">
          <div class="welcome-header">
            <div class="brand">Mashil<span>Tax</span></div>
            <p>Account created successfully!</p>
          </div>
          <div class="welcome-body">
            <div class="access-code-display">
              <div class="label">Your Access Code</div>
              <div class="code">${escapeHtml(generatedCode)}</div>
              <div class="hint">Save this code — you will need it to sign in from other devices. Take a screenshot or write it down.</div>
            </div>
            <button class="btn btn-block btn-lg btn-brass" id="btn-continue">Continue to MashilTax</button>
          </div>
        </div>
      </div>`;
      document.getElementById('btn-continue').addEventListener('click', onSuccess);
      return;
    }

    const isLogin = mode === 'login';
    container.innerHTML = `
    <div class="welcome-page">
      <div class="welcome-card">
        <div class="welcome-header">
          <div class="brand">Mashil<span>Tax</span></div>
          <p>${isLogin ? 'Sign in to your account.' : 'Your simple personal tax assistant.'}</p>
        </div>
        <div class="welcome-body">
          ${isLogin ? '' : `
          <div class="form-group">
            <label>Full Name</label>
            <input class="form-input" id="w-name" placeholder="As per IC" autocomplete="name">
          </div>`}
          <div class="form-group">
            <label>MyKad / IC Number</label>
            <input class="form-input" id="w-ic" placeholder="e.g. 800101-10-1234" autocomplete="off" inputmode="text">
          </div>
          ${isLogin ? `
          <div class="form-group">
            <label>Access Code</label>
            <input class="form-input" id="w-code" placeholder="XXX-XXX" autocomplete="off" style="text-transform:uppercase; letter-spacing:0.1em;">
          </div>` : ''}
          <div id="w-error" style="color:var(--rust); font-size:13px; margin-bottom:12px; display:none;"></div>
          <button class="btn btn-block btn-lg" id="btn-submit" style="margin-bottom:8px;">
            ${isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </div>
        <div class="welcome-footer">
          ${isLogin
            ? 'New to MashilTax? <button id="switch-mode">Create account</button>'
            : 'Already have an account? <button id="switch-mode">Sign in</button>'}
        </div>
      </div>
    </div>`;

    document.getElementById('switch-mode').addEventListener('click', () => {
      mode = isLogin ? 'register' : 'login';
      render();
    });

    const submitBtn = document.getElementById('btn-submit');
    const errorEl = document.getElementById('w-error');

    submitBtn.addEventListener('click', async () => {
      errorEl.style.display = 'none';
      const ic = (document.getElementById('w-ic')?.value || '').trim();
      if (!ic || ic.replace(/[^0-9]/g, '').length < 6) {
        errorEl.textContent = 'Please enter a valid IC number.';
        errorEl.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = isLogin ? 'Signing in...' : 'Creating account...';

      try {
        if (isLogin) {
          const code = (document.getElementById('w-code')?.value || '').trim().toUpperCase();
          if (!code) {
            errorEl.textContent = 'Please enter your access code.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            return;
          }
          await signIn(ic, code);
          onSuccess();
        } else {
          const name = (document.getElementById('w-name')?.value || '').trim();
          if (!name) {
            errorEl.textContent = 'Please enter your name.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            return;
          }
          generatedCode = generateAccessCode();
          await signUp(name, ic, generatedCode);
          mode = 'code-display';
          render();
        }
      } catch (err) {
        errorEl.textContent = err.message || 'Something went wrong. Please try again.';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = isLogin ? 'Sign In' : 'Create Account';
      }
    });

    const inputs = container.querySelectorAll('.form-input');
    const lastInput = inputs[inputs.length - 1];
    if (lastInput) {
      lastInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
      });
    }
  }

  render();
}
