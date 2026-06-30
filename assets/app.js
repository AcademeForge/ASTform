// ============================================================
// AST shared app module — Supabase client + auth + small utils
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ------------------------------------------------------------
// 1. REQUIRED SETUP — paste your project's values here.
//    Find them in Supabase Dashboard → Project Settings → API.
//    This is the ONLY place you need to put credentials.
// ------------------------------------------------------------
export const SUPABASE_URL = 'https://afooyyydhlwngzssgqih.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmb295eXlkaGx3bmd6c3NncWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NDQxMjgsImV4cCI6MjA5NDIyMDEyOH0.KG0XO0oP_2MpewHoIwTtbrKg5FkyOYRUtVzLH1MSJiE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});


// Name of the existing public storage bucket used for photos & signatures
export const STORAGE_BUCKET = 'story';
// Name of the single edge function that saves registrations + sends email
export const REGISTER_FUNCTION = 'ast-register';

// ------------------------------------------------------------
// Auth — CUSTOM Student ID/phone system (NOT Supabase Auth).
// Mirrors the main AcademeForge app's pattern: a bearer token from the
// ast-auth edge function, cached in localStorage. supabase-js above is
// still used (anon key) for plain data reads like the school directory,
// but never for auth.
// ------------------------------------------------------------
export const AUTH_FUNCTION = 'ast-auth';

const LS_TOKEN = 'ast_session_token';
const LS_ACCOUNT = 'ast_account';
const LS_DEVICE_ID = 'ast_device_id';

function getDeviceId() {
  let id = localStorage.getItem(LS_DEVICE_ID);
  if (!id) {
    id = 'astdev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(LS_DEVICE_ID, id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android Browser';
  if (/iPhone|iPad/i.test(ua)) return 'iOS Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  if (/Mac/i.test(ua)) return 'Mac Browser';
  return 'Web Browser';
}

async function callAuth(action, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${AUTH_FUNCTION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && json.error) || `Something went wrong (HTTP ${res.status}). Please try again.`);
  }
  return json;
}

function saveSession(token, account) {
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_ACCOUNT, JSON.stringify(account));
}

/** Logs in with a Student ID / phone number + password. */
export async function signInWithPassword(login_id, password) {
  const result = await callAuth('login', {
    login_id, password, device_id: getDeviceId(), device_name: getDeviceName(),
  });
  saveSession(result.session_token, result.account);
  return result.account;
}

/** Creates a new account with a Student ID / phone number + password. */
export async function signUp(login_id, full_name, password, email) {
  const result = await callAuth('signup', {
    login_id, full_name, password, email, device_id: getDeviceId(), device_name: getDeviceName(),
  });
  saveSession(result.session_token, result.account);
  return result.account;
}

/** Returns a session-shaped object ({ access_token, user }) or null — kept
 *  the same shape as the old Supabase Auth session so existing pages
 *  (which read session.user.id / session.access_token) don't need changes. */
export async function getSession() {
  const token = localStorage.getItem(LS_TOKEN);
  const accountRaw = localStorage.getItem(LS_ACCOUNT);
  if (!token || !accountRaw) return null;
  let account;
  try { account = JSON.parse(accountRaw); } catch { return null; }
  return { access_token: token, user: account };
}

export async function getCurrentUser() {
  const session = await getSession();
  return session ? session.user : null;
}

/** Redirects to login.html (carrying ?next=) if there is no active session. */
export async function requireSession() {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname.split('/').pop() + location.search);
    location.href = `login.html?next=${next}`;
    return null;
  }
  return session;
}

export async function signOut() {
  const token = localStorage.getItem(LS_TOKEN);
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_ACCOUNT);
  if (token) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/${AUTH_FUNCTION}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch { /* token is already cleared locally either way */ }
  }
  location.href = 'index.html';
}

// ------------------------------------------------------------
// Header auth-state wiring — call on every page that has the
// standard navbar markup (data-auth-area attribute).
// ------------------------------------------------------------
export async function wireAuthHeader() {
  const area = document.querySelector('[data-auth-area]');
  if (!area) return;
  const user = await getCurrentUser();
  if (user) {
    const label = user.full_name || user.login_id || 'Account';
    area.innerHTML = `
      <a href="my-registrations.html" class="nav-user-chip" title="${escapeHtml(user.login_id || '')}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>
        ${escapeHtml(label)}
      </a>
      <button class="btn btn-ghost btn-sm" id="navLogoutBtn" type="button">Log out</button>
    `;
    document.getElementById('navLogoutBtn')?.addEventListener('click', signOut);
  } else {
    area.innerHTML = `
      <a href="login.html" class="btn btn-ghost btn-sm">Log in</a>
      <a href="register-student.html" class="btn btn-gold btn-sm">Register</a>
    `;
  }
}

// ------------------------------------------------------------
// Mobile drawer wiring — standard markup with #navBurger / #mobileDrawer
// ------------------------------------------------------------
export function wireMobileDrawer() {
  const burger = document.getElementById('navBurger');
  const drawer = document.getElementById('mobileDrawer');
  const closeBtn = document.getElementById('mobileDrawerClose');
  if (!burger || !drawer) return;
  const open = () => drawer.classList.add('open');
  const close = () => drawer.classList.remove('open');
  burger.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) close(); });
}

// ------------------------------------------------------------
// Logo fallback — shows a generated monogram if the real
// image file (e.g. /IMG/af_logo.png) isn't present yet.
// ------------------------------------------------------------
export function wireLogoFallbacks() {
  document.querySelectorAll('img[data-logo-fallback]').forEach((img) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const fb = img.nextElementSibling;
      if (fb && fb.classList.contains('brand-logo-fallback')) fb.style.display = 'flex';
    }, { once: true });
  });
}

// ------------------------------------------------------------
// Toasts
// ------------------------------------------------------------
function ensureToastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

export function showToast(message, type = 'info', duration = 4200) {
  const stack = ensureToastStack();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ------------------------------------------------------------
// Small utils
// ------------------------------------------------------------
export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return value; }
}

export function setYear(id = 'yearNow') {
  const el = document.getElementById(id);
  if (el) el.textContent = new Date().getFullYear();
}

// ------------------------------------------------------------
// Storage upload helper — uploads a Blob to the shared "story"
// bucket under the signed-in user's own folder, returns the
// public URL. Used for both student photo and signature.
// ------------------------------------------------------------
export async function uploadToStory(userId, blob, kind, ext = 'png') {
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || `image/${ext}`,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed (${kind}): ${error.message}`);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ------------------------------------------------------------
// Data reads that used to be direct table SELECTs under Supabase Auth RLS.
// Now that auth is custom, ast_registrations is locked to the service role,
// so these go through ast-register's action-based endpoints instead.
// ------------------------------------------------------------
export async function fetchMyRegistrations() {
  const session = await getSession();
  if (!session) throw new Error('Please log in again — your session expired.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${REGISTER_FUNCTION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'list_my_registrations' }),
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && json.error) || `Something went wrong (HTTP ${res.status}). Please try again.`);
  }
  return json.registrations;
}

export async function fetchRegistrationById(id) {
  const session = await getSession();
  if (!session) throw new Error('Please log in again — your session expired.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${REGISTER_FUNCTION}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action: 'get_registration', id }),
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && json.error) || `Something went wrong (HTTP ${res.status}). Please try again.`);
  }
  return json.registration;
}

// ------------------------------------------------------------
// Calls the single edge function that saves a registration row
// and triggers the email notification.
// ------------------------------------------------------------
export async function submitRegistration(payload) {
  const session = await getSession();
  if (!session) throw new Error('Please log in again — your session expired.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${REGISTER_FUNCTION}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  let json;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok || !json || json.ok === false) {
    throw new Error((json && json.error) || `Something went wrong (HTTP ${res.status}). Please try again.`);
  }
  return json;
}
