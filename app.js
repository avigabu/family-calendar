// KINSHIP - Client Application State
let token = localStorage.getItem('kinship_token');
let currentUser = null;
let currentFamily = null;
let familyMembers = [];
let events = [];
let activeFilters = []; // User IDs that are visible on the calendar

let activeView = 'calendar'; // 'calendar' | 'family' | 'settings'
let calendarMode = 'month';  // 'month' | 'week'
let currentDate = new Date(); // Anchor date for calendar grid calculations
let selectedDay = new Date().toISOString().split('T')[0]; // For daily list in monthly view

const isLocalMode = window.location.protocol === 'file:' || 
                     window.location.hostname === '' || 
                     window.location.hostname.includes('github.io') || 
                     window.location.hostname.includes('netlify.app');

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyD86BH1L9T0V5CyLJRitOtt140RwbYYaDg",
  authDomain: "kinship-14ac4.firebaseapp.com",
  projectId: "kinship-14ac4",
  storageBucket: "kinship-14ac4.firebasestorage.app",
  messagingSenderId: "49614095892",
  appId: "1:49614095892:web:0de9e0df57530d4e040901",
  measurementId: "G-01587NC605"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const dbFirestore = firebase.firestore();

let dbInMemory = null;

// Helper to calculate SHA-256 of the passphrase for document lookup
async function getPassphraseHash(passphrase) {
  return sha256Pure(passphrase);
}

let firestoreListener = null;

// Fetch database from Firebase Firestore using the passphrase hash as the document ID, and listen for live updates
function loadDatabaseFromCloud() {
  return new Promise(async (resolve, reject) => {
    const passphrase = localStorage.getItem('kinship_sync_passphrase');
    if (!passphrase) {
      reject(new Error("Sync Passphrase not set"));
      return;
    }
    
    try {
      const docId = await getPassphraseHash(passphrase);
      const docRef = dbFirestore.collection("calendars").doc(docId);
      
      if (firestoreListener) {
        firestoreListener(); // unsubscribe from previous listener if active
      }
      
      let isFirstEmission = true;
      
      firestoreListener = docRef.onSnapshot(async (doc) => {
        if (!doc.exists) {
          // If the calendar is brand new, seed it with default Adams family values
          dbInMemory = getSeedDatabase();
          try {
            await docRef.set(dbInMemory);
          } catch (err) {
            console.error("Firestore write error during seeding:", err);
            if (isFirstEmission) {
              reject(new Error("Failed to initialize database in Firestore. Check rules."));
              return;
            }
          }
        } else {
          dbInMemory = doc.data();
        }
        
        if (isFirstEmission) {
          isFirstEmission = false;
          resolve();
        } else {
          // Sync changes from other clients to the UI in real time
          await syncUIWithDatabase();
        }
      }, (err) => {
        console.error("Firestore live listener error:", err);
        if (isFirstEmission) {
          reject(new Error("Failed to load database. Ensure Firestore is set up in test mode."));
        } else {
          showToast("Sync connection lost. Check internet connection.", "error");
        }
      });
      
    } catch (err) {
      reject(err);
    }
  });
}

// Synchronize client UI state when database is updated from Firestore in real time
async function syncUIWithDatabase() {
  if (!currentUser) return;
  
  const freshUser = dbInMemory.users.find(u => u.id === currentUser.id);
  if (!freshUser) {
    handleTokenExpired();
    return;
  }
  currentUser = freshUser;
  
  if (currentUser.familyId) {
    currentFamily = dbInMemory.families.find(f => f.id === currentUser.familyId);
    await loadFamilyMembers();
    await loadEvents();
  } else {
    currentFamily = null;
    familyMembers = [];
    activeFilters = [];
    document.getElementById('calendar-filter-options').innerHTML = '';
  }
  
  updateHeaderAndProfile();
  if (activeView === 'family') {
    renderFamilyHub();
  }
}

// Write the database back to Firebase Firestore
async function saveDatabaseToCloud() {
  if (!dbInMemory) return;
  
  const passphrase = localStorage.getItem('kinship_sync_passphrase');
  if (!passphrase) return;
  
  const docId = await getPassphraseHash(passphrase);
  
  try {
    await dbFirestore.collection("calendars").doc(docId).set(dbInMemory);
  } catch (err) {
    console.error("Firestore write error:", err);
    showToast("Cloud sync failed. Ensure Firestore is set up in test mode.", "error");
  }
}

// Displays a premium lock screen asking for the sync password
function promptForPassphrase() {
  if (document.getElementById('sync-overlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'sync-overlay';
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '9999';
  
  overlay.innerHTML = `
    <div class="auth-card" style="margin: auto; max-width: 400px; text-align: center;">
      <div class="auth-header">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <h1>Secure Sync</h1>
        </div>
        <p class="auth-subtitle">Enter your secret family password to link your Firebase calendar</p>
      </div>
      <form id="sync-form" onsubmit="submitSyncPassphrase(event)">
        <div class="form-group">
          <label for="sync-key-input">Family Passphrase</label>
          <input type="password" id="sync-key-input" placeholder="Enter password" required>
        </div>
        <button type="submit" class="btn btn-primary btn-block">Link Calendar</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Handler for the passphrase entry
async function submitSyncPassphrase(e) {
  e.preventDefault();
  const passphrase = document.getElementById('sync-key-input').value;
  localStorage.setItem('kinship_sync_passphrase', passphrase);
  
  const submitButton = document.querySelector('#sync-form button');
  submitButton.innerText = 'Linking...';
  submitButton.disabled = true;
  
  try {
    await loadDatabaseFromCloud();
    document.getElementById('sync-overlay').remove();
    showToast('Calendar synced with Firebase!');
    
    if (token) {
      checkAuth();
    } else {
      showScreen('auth');
    }
  } catch (err) {
    localStorage.removeItem('kinship_sync_passphrase');
    showToast(err.message, 'error');
    submitButton.innerText = 'Link Calendar';
    submitButton.disabled = false;
  }
}

// ================= INITIALIZATION & AUTH =================

document.addEventListener('DOMContentLoaded', () => {
  if (isLocalMode) {
    showToast('Connecting to Firebase Sync...', 'info');
    const passphrase = localStorage.getItem('kinship_sync_passphrase');
    if (!passphrase) {
      promptForPassphrase();
      return;
    }
  }
  
  if (token) {
    checkAuth();
  } else {
    showScreen('auth');
  }
});

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Clean up element after animation
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Show/Hide page views
function showScreen(screen) {
  const authScreen = document.getElementById('auth-screen');
  const appView = document.getElementById('app-view');
  
  if (screen === 'auth') {
    authScreen.style.display = 'flex';
    appView.style.display = 'none';
  } else {
    authScreen.style.display = 'none';
    appView.style.display = 'flex';
    navigateTo('calendar');
  }
}

// Fetch API wrapper with auth token injector and local fallback
async function apiFetch(url, options = {}) {
  // Inject headers first so they are available to both handleLocalRoute and real fetch
  options.headers = options.headers || {};
  options.headers['Content-Type'] = 'application/json';
  
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    if (isLocalMode) {
      return await handleLocalRoute(url, options);
    }
    
    const res = await fetch(url, options);
    
    // Check if session token expired
    if (res.status === 401) {
      handleTokenExpired();
      throw new Error('Session expired');
    }
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong');
    }
    return data;
  } catch (err) {
    if (err.message !== 'Session expired') {
      showToast(err.message, 'error');
    }
    throw err;
  }
}

function handleTokenExpired() {
  token = null;
  localStorage.removeItem('kinship_token');
  currentUser = null;
  currentFamily = null;
  familyMembers = [];
  showToast('Session expired. Please log in again.', 'error');
  showScreen('auth');
}

// Check current session validation
async function checkAuth() {
  try {
    const data = await apiFetch('/api/auth/me');
    currentUser = data.user;
    currentFamily = data.family;
    
    initApp();
  } catch (err) {
    showScreen('auth');
  }
}

// Initialise application layout once authenticated
async function initApp() {
  showScreen('app');
  updateHeaderAndProfile();
  
  if (currentFamily) {
    await loadFamilyMembers();
    await loadEvents();
  } else {
    // Clear old family state to prevent profile leakage from previous sessions
    familyMembers = [];
    activeFilters = [];
    document.getElementById('calendar-filter-options').innerHTML = '';
    
    showToast('Please create or join a family group to start.', 'info');
    navigateTo('family');
  }
}

function updateHeaderAndProfile() {
  const familyNameSpan = document.getElementById('header-family-name');
  if (currentFamily) {
    familyNameSpan.innerText = currentFamily.name;
    document.getElementById('header-family-badge').style.display = 'block';
  } else {
    document.getElementById('header-family-badge').style.display = 'none';
  }
  
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const avatar = document.getElementById('header-avatar');
  avatar.innerText = initials;
  avatar.style.backgroundColor = currentUser.color;
  
  document.getElementById('settings-avatar').innerText = initials;
  document.getElementById('settings-avatar').style.backgroundColor = currentUser.color;
  document.getElementById('settings-user-name').innerText = currentUser.name;
  document.getElementById('settings-username-handle').innerText = `@${currentUser.username}`;
  document.getElementById('settings-family-name').innerText = currentFamily ? currentFamily.name : 'No Family Group';
}

// Switch registration / login tabs
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active-form'));
  
  if (tab === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('login-form').classList.add('active-form');
  } else {
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('register-form').classList.add('active-form');
  }
}

function toggleFamilyInput(mode) {
  const createGroup = document.getElementById('family-create-group');
  const joinGroup = document.getElementById('family-join-group');
  const nameInput = document.getElementById('family-name-input');
  const codeInput = document.getElementById('family-code-input');
  
  if (mode === 'create') {
    createGroup.style.display = 'block';
    joinGroup.style.display = 'none';
    nameInput.required = true;
    codeInput.required = false;
  } else {
    createGroup.style.display = 'none';
    joinGroup.style.display = 'block';
    nameInput.required = false;
    codeInput.required = true;
  }
}

// Auth actions handlers
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    token = data.token;
    localStorage.setItem('kinship_token', token);
    currentUser = data.user;
    currentFamily = data.family;
    
    showToast('Logged in successfully!');
    initApp();
  } catch (err) {
    // API fetch handles error toast
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const color = document.querySelector('input[name="user-color"]:checked').value;
  const familyMode = document.querySelector('input[name="family-mode"]:checked').value;
  
  try {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, name, color, email })
    });
    
    token = data.token;
    localStorage.setItem('kinship_token', token);
    currentUser = data.user;
    
    if (familyMode === 'create') {
      const familyName = document.getElementById('family-name-input').value;
      const familyData = await apiFetch('/api/family/create', {
        method: 'POST',
        body: JSON.stringify({ name: familyName })
      });
      currentFamily = familyData.family;
      currentUser = familyData.user;
    } else {
      const inviteCode = document.getElementById('family-code-input').value;
      const familyData = await apiFetch('/api/family/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode })
      });
      currentFamily = familyData.family;
      currentUser = familyData.user;
    }
    
    showToast('Account created successfully!');
    initApp();
  } catch (err) {
    // error handled by fetch
  }
}

async function handleLogout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch(e) {}
  
  token = null;
  localStorage.removeItem('kinship_token');
  currentUser = null;
  currentFamily = null;
  familyMembers = [];
  events = [];
  
  showScreen('auth');
  showToast('Logged out.');
}

// ================= PASSWORD RESET FLOW =================

function showForgotPassword(e) {
  if (e) e.preventDefault();
  document.getElementById('forgot-modal').classList.add('active');
  document.getElementById('forgot-verify-form').style.display = 'block';
  document.getElementById('forgot-reset-form').style.display = 'none';
  document.getElementById('forgot-verify-form').reset();
}

function closeForgotPassword() {
  document.getElementById('forgot-modal').classList.remove('active');
}

async function handleForgotPasswordVerify(e) {
  e.preventDefault();
  const username = document.getElementById('forgot-username').value;
  const email = document.getElementById('forgot-email').value;
  
  const submitButton = document.querySelector('#forgot-verify-form button');
  submitButton.innerText = 'Verifying...';
  submitButton.disabled = true;
  
  try {
    const data = await apiFetch('/api/auth/verify-reset', {
      method: 'POST',
      body: JSON.stringify({ username, email })
    });
    
    // Switch forms
    document.getElementById('forgot-verify-form').style.display = 'none';
    document.getElementById('forgot-reset-form').style.display = 'block';
    document.getElementById('forgot-reset-form').reset();
    document.getElementById('forgot-reset-userId').value = data.userId;
  } catch (err) {
    // apiFetch already toasts the error
  } finally {
    submitButton.innerText = 'Verify Identity';
    submitButton.disabled = false;
  }
}

async function handleForgotPasswordReset(e) {
  e.preventDefault();
  const userId = document.getElementById('forgot-reset-userId').value;
  const newPassword = document.getElementById('forgot-new-password').value;
  const confirmPassword = document.getElementById('forgot-confirm-password').value;
  
  if (newPassword !== confirmPassword) {
    showToast("Passwords do not match.", "error");
    return;
  }
  
  const submitButton = document.querySelector('#forgot-reset-form button');
  submitButton.innerText = 'Updating...';
  submitButton.disabled = true;
  
  try {
    const data = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword })
    });
    
    token = data.token;
    localStorage.setItem('kinship_token', token);
    currentUser = data.user;
    currentFamily = data.family;
    
    closeForgotPassword();
    showToast('Password updated and logged in successfully!');
    initApp();
  } catch (err) {
    // apiFetch handles toast
  } finally {
    submitButton.innerText = 'Update Password';
    submitButton.disabled = false;
  }
}

// ================= ROUTING & VIEW CONTROLLER =================

function navigateTo(view) {
  activeView = view;
  
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nav-btn-${view}`);
  if (btn) btn.classList.add('active');
  
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active-section'));
  document.getElementById(`view-${view}`).classList.add('active-section');
  
  const floatBtn = document.getElementById('floating-add-btn');
  if (view === 'calendar' && currentFamily) {
    floatBtn.style.display = 'flex';
  } else {
    floatBtn.style.display = 'none';
  }
  
  if (view === 'family') {
    renderFamilyHub();
  }
}

// ================= FAMILY HUB MANAGEMENT =================

async function loadFamilyMembers() {
  const data = await apiFetch('/api/family/members');
  familyMembers = data.members;
  
  const newMemberIds = familyMembers.map(m => m.id);
  activeFilters = newMemberIds;
  
  updateFilterBarMarkup();
}

function updateFilterBarMarkup() {
  const container = document.getElementById('calendar-filter-options');
  container.innerHTML = '';
  
  familyMembers.forEach(member => {
    const isChecked = activeFilters.includes(member.id);
    const tag = document.createElement('label');
    tag.className = `filter-tag ${isChecked ? '' : 'inactive'}`;
    tag.style.setProperty('--member-color', member.color);
    
    tag.innerHTML = `
      <input type="checkbox" value="${member.id}" ${isChecked ? 'checked' : ''} onchange="toggleFilter('${member.id}')">
      <span class="dot"></span>
      <span>${member.name.split(' ')[0]}</span>
    `;
    container.appendChild(tag);
  });
}

function toggleFilter(memberId) {
  const index = activeFilters.indexOf(memberId);
  if (index === -1) {
    activeFilters.push(memberId);
  } else {
    if (activeFilters.length > 1) {
      activeFilters.splice(index, 1);
    } else {
      showToast('At least one member filter must be active.', 'error');
      updateFilterBarMarkup();
      return;
    }
  }
  updateFilterBarMarkup();
  renderCalendar();
}

function renderFamilyHub() {
  const activeDiv = document.getElementById('family-hub-active');
  const emptyDiv = document.getElementById('family-hub-empty');
  
  if (!currentFamily) {
    if (activeDiv) activeDiv.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'block';
    return;
  }
  
  if (activeDiv) activeDiv.style.display = 'block';
  if (emptyDiv) emptyDiv.style.display = 'none';
  
  document.getElementById('family-invite-code').innerText = currentFamily.inviteCode;
  
  const list = document.getElementById('family-members-list');
  list.innerHTML = '';
  
  familyMembers.forEach(m => {
    const div = document.createElement('div');
    div.className = 'member-item';
    div.style.setProperty('--member-color', m.color);
    
    const isMe = m.id === currentUser.id;
    
    div.innerHTML = `
      <div class="member-info-col">
        <div class="member-color-indicator"></div>
        <span class="member-name">${m.name} ${isMe ? '(You)' : ''}</span>
      </div>
      <div class="member-badge">@${m.username}</div>
    `;
    list.appendChild(div);
  });
}

function copyInviteCode() {
  const inviteCode = document.getElementById('family-invite-code').innerText;
  navigator.clipboard.writeText(inviteCode).then(() => {
    showToast('Invite code copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy. Invite code: ' + inviteCode, 'error');
  });
}

async function handleAddFamilyMember(e) {
  e.preventDefault();
  const name = document.getElementById('new-member-name').value;
  const email = document.getElementById('new-member-email').value;
  const username = document.getElementById('new-member-username').value;
  const password = document.getElementById('new-member-password').value;
  const color = document.querySelector('input[name="new-user-color"]:checked').value;
  
  try {
    await apiFetch('/api/family/add-member', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, color, email })
    });
    
    showToast(`${name} added to family!`);
    
    document.getElementById('add-member-form').reset();
    
    await loadFamilyMembers();
    renderFamilyHub();
    renderCalendar();
  } catch (err) {
    // API wrapper handles error message
  }
}

// ================= CALENDAR CORE SCHEDULER =================

async function loadEvents() {
  if (!currentFamily) return;
  
  try {
    const data = await apiFetch('/api/events');
    events = data.events;
    renderCalendar();
  } catch (err) {
    console.error('Failed to load events', err);
  }
}

function setCalendarMode(mode) {
  calendarMode = mode;
  document.getElementById('btn-mode-month').classList.toggle('active', mode === 'month');
  document.getElementById('btn-mode-week').classList.toggle('active', mode === 'week');
  
  document.getElementById('monthly-calendar-container').style.display = mode === 'month' ? 'block' : 'none';
  document.getElementById('weekly-calendar-container').style.display = mode === 'week' ? 'block' : 'none';
  
  renderCalendar();
}

function setToday() {
  currentDate = new Date();
  selectedDay = currentDate.toISOString().split('T')[0];
  renderCalendar();
}

function changeDateRange(direction) {
  if (calendarMode === 'month') {
    currentDate.setMonth(currentDate.getMonth() + direction);
  } else {
    currentDate.setDate(currentDate.getDate() + (direction * 7));
  }
  renderCalendar();
}

function renderCalendar() {
  if (!currentFamily) {
    const monthGrid = document.getElementById('monthly-grid');
    if (monthGrid) monthGrid.innerHTML = '<p class="empty-day-message" style="grid-column: span 7; text-align: center; padding: 2rem;">Please join or create a family group first.</p>';
    const weekGrid = document.getElementById('weekly-grid');
    if (weekGrid) weekGrid.innerHTML = '<p class="empty-day-message" style="text-align: center; padding: 2rem;">Please join or create a family group first.</p>';
    
    // Also clear the daily agenda list
    const oldPanel = document.getElementById('daily-agenda-panel');
    if (oldPanel) oldPanel.remove();
    return;
  }
  
  if (calendarMode === 'month') {
    renderMonthlyGrid();
  } else {
    renderWeeklyLayout();
  }
}

function renderMonthlyGrid() {
  const grid = document.getElementById('monthly-grid');
  grid.innerHTML = '';
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('calendar-title').innerText = `${monthNames[month]} ${year}`;
  
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  const cells = [];
  
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthTotalDays - i);
    cells.push({
      date: d,
      isCurrentMonth: false,
      dayNum: prevMonthTotalDays - i
    });
  }
  
  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    cells.push({
      date: d,
      isCurrentMonth: true,
      dayNum: i
    });
  }
  
  const nextMonthPadding = 42 - cells.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({
      date: d,
      isCurrentMonth: false,
      dayNum: i
    });
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  
  cells.forEach(cell => {
    const cellDateStr = cell.date.toISOString().split('T')[0];
    const isToday = cellDateStr === todayStr;
    const isSelected = cellDateStr === selectedDay;
    
    const div = document.createElement('div');
    div.className = `month-day ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''}`;
    if (isSelected) {
      div.style.borderColor = 'var(--accent-primary)';
      div.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
    }
    
    div.onclick = () => selectDayInMonth(cellDateStr);
    
    const dayEvents = getFilteredEventsForDate(cellDateStr);
    
    let dotsHtml = '';
    dayEvents.slice(0, 4).forEach(evt => {
      const creator = familyMembers.find(m => m.id === evt.createdBy);
      const color = creator ? creator.color : 'var(--accent-primary)';
      dotsHtml += `<span class="event-dot" style="--event-color: ${color}"></span>`;
    });
    if (dayEvents.length > 4) {
      dotsHtml += `<span class="event-dot" style="--event-color: #ffffff; opacity: 0.8"></span>`;
    }
    
    div.innerHTML = `
      <span class="day-number">${cell.dayNum}</span>
      <div class="day-events-indicator">${dotsHtml}</div>
    `;
    
    grid.appendChild(div);
  });
  
  renderDailyAgenda();
}

function selectDayInMonth(dateStr) {
  selectedDay = dateStr;
  renderMonthlyGrid();
}

function renderDailyAgenda() {
  const container = document.getElementById('monthly-calendar-container');
  
  const oldPanel = document.getElementById('daily-agenda-panel');
  if (oldPanel) oldPanel.remove();
  
  const panel = document.createElement('div');
  panel.id = 'daily-agenda-panel';
  panel.className = 'section-card';
  panel.style.marginTop = '16px';
  
  const dateObj = new Date(selectedDay);
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  const dateFormatted = dateObj.toLocaleDateString('en-US', options);
  
  const dayEvents = getFilteredEventsForDate(selectedDay);
  
  let eventsListHtml = '';
  if (dayEvents.length === 0) {
    eventsListHtml = `<p class="empty-day-message">No events scheduled for this day.</p>`;
  } else {
    dayEvents.forEach(evt => {
      const creator = familyMembers.find(m => m.id === evt.createdBy);
      const color = creator ? creator.color : 'var(--accent-primary)';
      
      let avatarsHtml = '';
      if (Array.isArray(evt.relevantTo)) {
        evt.relevantTo.forEach(uid => {
          const user = familyMembers.find(m => m.id === uid);
          if (user) {
            const initials = user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            avatarsHtml += `<span class="mini-avatar" style="--avatar-color: ${user.color}" title="${user.name}">${initials}</span>`;
          }
        });
      }
      
      eventsListHtml += `
        <div class="event-card" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
          <div class="event-info">
            <div class="event-title-text">${escapeHtml(evt.title)}</div>
            <div class="event-time-text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${evt.startTime} - ${evt.endTime}</span>
            </div>
          </div>
          <div class="event-avatars">${avatarsHtml}</div>
        </div>
      `;
    });
  }
  
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin-bottom: 0;">Agenda: ${dateFormatted}</h3>
      <button class="btn btn-outline btn-sm" onclick="openEventModalForDate('${selectedDay}')">
        <span>+ Add</span>
      </button>
    </div>
    <div class="week-events-list">${eventsListHtml}</div>
  `;
  
  container.appendChild(panel);
}

function renderWeeklyLayout() {
  const grid = document.getElementById('weekly-grid');
  grid.innerHTML = '';
  
  const anchor = new Date(currentDate);
  const diff = anchor.getDate() - anchor.getDay();
  const sunday = new Date(anchor.setDate(diff));
  
  const endOfWeek = new Date(sunday);
  endOfWeek.setDate(sunday.getDate() + 6);
  
  const options = { month: 'short', day: 'numeric' };
  document.getElementById('calendar-title').innerText = `${sunday.toLocaleDateString('en-US', options)} - ${endOfWeek.toLocaleDateString('en-US', options)}, ${endOfWeek.getFullYear()}`;
  
  const todayStr = new Date().toISOString().split('T')[0];
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(sunday);
    dayDate.setDate(sunday.getDate() + i);
    const dayDateStr = dayDate.toISOString().split('T')[0];
    const isToday = dayDateStr === todayStr;
    
    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dayDate.getDate();
    
    const dayRow = document.createElement('div');
    dayRow.className = 'week-day-row';
    
    const dayEvents = getFilteredEventsForDate(dayDateStr);
    
    let eventsHtml = '';
    if (dayEvents.length === 0) {
      eventsHtml = `<p class="empty-day-message">No events scheduled.</p>`;
    } else {
      dayEvents.forEach(evt => {
        const creator = familyMembers.find(m => m.id === evt.createdBy);
        const color = creator ? creator.color : 'var(--accent-primary)';
        
        let avatarsHtml = '';
        if (Array.isArray(evt.relevantTo)) {
          evt.relevantTo.forEach(uid => {
            const user = familyMembers.find(m => m.id === uid);
            if (user) {
              const initials = user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
              avatarsHtml += `<span class="mini-avatar" style="--avatar-color: ${user.color}" title="${user.name}">${initials}</span>`;
            }
          });
        }
        
        eventsHtml += `
          <div class="event-card" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
            <div class="event-info">
              <div class="event-title-text">${escapeHtml(evt.title)}</div>
              <div class="event-time-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>${evt.startTime} - ${evt.endTime}</span>
              </div>
            </div>
            <div class="event-avatars">${avatarsHtml}</div>
          </div>
        `;
      });
    }
    
    dayRow.innerHTML = `
      <div class="week-day-header">
        <div class="week-day-title ${isToday ? 'today' : ''}">
          <span>${dayName}</span>
          <span class="week-date">${dayNum}</span>
        </div>
        <button class="btn btn-icon btn-sm" onclick="openEventModalForDate('${dayDateStr}')" style="width: 24px; height: 24px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>
      <div class="week-events-list">${eventsHtml}</div>
    `;
    
    grid.appendChild(dayRow);
  }
}

function getFilteredEventsForDate(dateStr) {
  return events.filter(evt => {
    if (evt.date !== dateStr) return false;
    
    const creatorMatches = activeFilters.includes(evt.createdBy);
    const relevantMatch = Array.isArray(evt.relevantTo) && 
      evt.relevantTo.some(uid => activeFilters.includes(uid));
      
    return creatorMatches || relevantMatch;
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ================= EVENT CREATION / EDITING FORM =================

function openEventModalForDate(dateStr) {
  openEventModal();
  document.getElementById('event-date').value = dateStr;
}

function openEventModal(eventToEdit = null) {
  const modal = document.getElementById('event-modal');
  const form = document.getElementById('event-form');
  const actionTitle = document.getElementById('modal-event-title-action');
  const btnDelete = document.getElementById('btn-delete-event');
  
  form.reset();
  modal.classList.add('active');
  
  const relevancyList = document.getElementById('event-relevancy-list');
  relevancyList.innerHTML = '';
  
  familyMembers.forEach(member => {
    const wrapper = document.createElement('label');
    wrapper.className = 'relevancy-checkbox-wrapper';
    
    let isChecked = false;
    if (eventToEdit) {
      isChecked = Array.isArray(eventToEdit.relevantTo) && eventToEdit.relevantTo.includes(member.id);
    } else {
      isChecked = member.id === currentUser.id;
    }
    
    wrapper.innerHTML = `
      <input type="checkbox" name="event-relevant-member" value="${member.id}" ${isChecked ? 'checked' : ''}>
      <span class="checkbox-label-text">
        <span class="checkbox-dot" style="--member-color: ${member.color}"></span>
        <span>${member.name}</span>
      </span>
    `;
    relevancyList.appendChild(wrapper);
  });
  
  if (eventToEdit) {
    actionTitle.innerText = 'Edit Event';
    btnDelete.style.display = 'block';
    
    document.getElementById('event-form-id').value = eventToEdit.id;
    document.getElementById('event-title').value = eventToEdit.title;
    document.getElementById('event-date').value = eventToEdit.date;
    document.getElementById('event-start-time').value = eventToEdit.startTime;
    document.getElementById('event-end-time').value = eventToEdit.endTime;
    document.getElementById('event-category').value = eventToEdit.category;
    document.getElementById('event-description').value = eventToEdit.description || '';
  } else {
    actionTitle.innerText = 'New Event';
    btnDelete.style.display = 'none';
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-date').value = selectedDay;
    
    const now = new Date();
    const currentHourStr = String(now.getHours()).padStart(2, '0') + ':00';
    const nextHourStr = String((now.getHours() + 1) % 24).padStart(2, '0') + ':00';
    
    document.getElementById('event-start-time').value = currentHourStr;
    document.getElementById('event-end-time').value = nextHourStr;
  }
}

function closeEventModal() {
  document.getElementById('event-modal').classList.remove('active');
}

async function handleEventSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('event-form-id').value;
  const title = document.getElementById('event-title').value;
  const date = document.getElementById('event-date').value;
  const startTime = document.getElementById('event-start-time').value;
  const endTime = document.getElementById('event-end-time').value;
  const category = document.getElementById('event-category').value;
  const description = document.getElementById('event-description').value;
  
  const checkedBoxes = document.querySelectorAll('input[name="event-relevant-member"]:checked');
  const relevantTo = Array.from(checkedBoxes).map(box => box.value);
  
  if (relevantTo.length === 0) {
    showToast('Select at least one family member for this event.', 'error');
    return;
  }
  
  const eventPayload = {
    title,
    description,
    date,
    startTime,
    endTime,
    category,
    relevantTo
  };
  
  try {
    if (id) {
      await apiFetch(`/api/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify(eventPayload)
      });
      showToast('Event updated successfully!');
    } else {
      await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify(eventPayload)
      });
      showToast('Event scheduled!');
    }
    
    closeEventModal();
    await loadEvents();
  } catch (err) {
    // handled
  }
}

async function handleDeleteEvent() {
  const id = document.getElementById('event-form-id').value;
  if (!id) return;
  
  if (!confirm('Are you sure you want to delete this event?')) return;
  
  try {
    await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
    showToast('Event deleted.');
    closeEventModal();
    await loadEvents();
  } catch (err) {
    // handled
  }
}

// ================= EVENT DETAILS VIEWER POPUP =================

let selectedEvent = null;

function openDetailsModal(eventId) {
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  
  selectedEvent = event;
  const modal = document.getElementById('details-modal');
  modal.classList.add('active');
  
  const categoryBadge = document.getElementById('details-category-badge');
  const categoriesMap = {
    chore: 'Chore 🧹',
    appointment: 'Appointment 🏥',
    fun: 'Fun Activity 🎉',
    school: 'School / Ed 📚',
    work: 'Work 💼',
    other: 'Other 🗓️'
  };
  categoryBadge.innerText = categoriesMap[event.category] || 'Other 🗓️';
  
  document.getElementById('details-title').innerText = event.title;
  const descBox = document.getElementById('details-desc-box');
  const descText = document.getElementById('details-description');
  if (event.description && event.description.trim()) {
    descText.innerText = event.description;
    descBox.style.display = 'block';
  } else {
    descBox.style.display = 'none';
  }
  
  const dateObj = new Date(event.date);
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('details-date-text').innerText = dateObj.toLocaleDateString('en-US', options);
  document.getElementById('details-time-text').innerText = `${event.startTime} - ${event.endTime}`;
  
  const creator = familyMembers.find(m => m.id === event.createdBy);
  const creatorName = creator ? creator.name : 'Unknown Member';
  const creatorColor = creator ? creator.color : '#fff';
  
  document.getElementById('details-creator-name').innerText = creatorName;
  document.getElementById('details-creator-dot').style.backgroundColor = creatorColor;
  
  const tagsContainer = document.getElementById('details-members-tags');
  tagsContainer.innerHTML = '';
  
  if (Array.isArray(event.relevantTo)) {
    event.relevantTo.forEach(uid => {
      const user = familyMembers.find(m => m.id === uid);
      if (user) {
        const span = document.createElement('span');
        span.className = 'member-tag-badge';
        span.innerHTML = `
          <span class="avatar-dot" style="background-color: ${user.color}"></span>
          <span>${user.name}</span>
        `;
        tagsContainer.appendChild(span);
      }
    });
  }
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('active');
  selectedEvent = null;
}

function editEventFromDetails() {
  if (!selectedEvent) return;
  const eventToEdit = { ...selectedEvent };
  closeDetailsModal();
  openEventModal(eventToEdit);
}

// Hub actions for joining/creating family groups
async function handleCreateFamilyFromHub(e) {
  e.preventDefault();
  const name = document.getElementById('hub-create-name').value;
  try {
    const data = await apiFetch('/api/family/create', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    currentFamily = data.family;
    currentUser = data.user;
    showToast('Family group created successfully!');
    
    // Reload and redraw
    await initApp();
  } catch (err) {
    // Handled by apiFetch
  }
}

async function handleJoinFamilyFromHub(e) {
  e.preventDefault();
  const inviteCode = document.getElementById('hub-join-code').value;
  try {
    const data = await apiFetch('/api/family/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode })
    });
    currentFamily = data.family;
    currentUser = data.user;
    showToast('Joined family group successfully!');
    
    // Reload and redraw
    await initApp();
  } catch (err) {
    // Handled by apiFetch
  }
}

// Close modal when tapping on dark overlay
function closeModalOnOverlayClick(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
}

// HTML escape helper
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================================
// ============ STANDALONE LOCAL STORAGE DATABASE ============
// ==========================================================

// Helper client-side password hashing (SHA-256)
async function clientHashPassword(password, salt) {
  const message = password + salt;
  
  if (window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(message);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn("crypto.subtle failed, falling back to pure JS hashing", e);
    }
  }
  
  return sha256Pure(message);
}

// Pure JavaScript SHA-256 Implementation (works under file:// protocol)
function sha256Pure(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words = [];
  const asciiLength = ascii.length;
  
  const hash = [];
  const k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = 1;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return ''; // ASCII only
    words[i >> 2] |= j << (24 - (i % 4) * 8);
  }
  words[words.length] = ((asciiLength * 8) / maxWord) | 0;
  words[words.length] = (asciiLength * 8);
  
  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = [...hash];
    
    for (let i = 0; i < 64; i++) {
      let wItem = w[i];
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const _maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const sigma0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const sigma1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      
      const temp1 = (hash[7] + sigma1 + ch + k[i] + wItem) | 0;
      const temp2 = (sigma0 + _maj) | 0;
      
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.length = 8;
    }
    
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (let i = 0; i < 8; i++) {
    const val = hash[i] >>> 0;
    result += val.toString(16).padStart(8, '0');
  }
  
  return result;
}

// Mock backend Router for when running as local file
async function handleLocalRoute(url, options) {
  // Delay slightly to simulate server request latency
  await new Promise(r => setTimeout(r, 150));
  
  // Ensure we have a passphrase
  const passphrase = localStorage.getItem('kinship_sync_passphrase');
  if (!passphrase) {
    promptForPassphrase();
    throw new Error("Please enter your family passphrase to sync with Firebase.");
  }
  
  // Ensure the database is loaded from Firebase
  if (!dbInMemory) {
    try {
      await loadDatabaseFromCloud();
    } catch (e) {
      throw new Error("Failed to load database from Firebase: " + e.message);
    }
  }
  
  let db = dbInMemory;
  
  // Helper to save database updates dynamically in the background to Firebase
  const saveDb = () => {
    dbInMemory = db;
    saveDatabaseToCloud().catch(err => {
      showToast("Cloud sync failed. Check internet connection.", "error");
      console.error(err);
    });
  };
  
  // Parse session user
  let sessionUser = null;
  const authHeader = options.headers ? options.headers['Authorization'] : '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const sToken = authHeader.substring(7);
    const session = db.sessions[sToken];
    if (session) {
      sessionUser = db.users.find(u => u.id === session.userId);
    }
  }
  
  const body = options.body ? JSON.parse(options.body) : {};

  // Router matching
  if (url === '/api/auth/me') {
    if (!sessionUser) throw new Error('Unauthorized');
    const { passwordHash, salt, ...safeUser } = sessionUser;
    const family = sessionUser.familyId ? db.families.find(f => f.id === sessionUser.familyId) : null;
    return { user: safeUser, family };
    
  } else if (url === '/api/auth/register') {
    const { username, password, name, color, email } = body;
    if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already taken.');
    }
    const uSalt = generateUUID().substring(0, 8);
    const uHash = await clientHashPassword(password, uSalt);
    const newUser = {
      id: 'usr_' + generateUUID(),
      username,
      email: email || '',
      passwordHash: uHash,
      salt: uSalt,
      name,
      color,
      familyId: null
    };
    db.users.push(newUser);
    
    // Login automatically
    const tokenVal = 'tok_' + generateUUID();
    db.sessions[tokenVal] = { userId: newUser.id };
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = newUser;
    return { token: tokenVal, user: safeUser };
    
  } else if (url === '/api/auth/login') {
    const { username, password } = body;
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error('Invalid username or password.');
    
    const hash = await clientHashPassword(password, user.salt);
    if (user.passwordHash !== hash) throw new Error('Invalid username or password.');
    
    const tokenVal = 'tok_' + generateUUID();
    db.sessions[tokenVal] = { userId: user.id };
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = user;
    const family = user.familyId ? db.families.find(f => f.id === user.familyId) : null;
    return { token: tokenVal, user: safeUser, family };
    
  } else if (url === '/api/auth/verify-reset') {
    const { username, email } = body;
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && 
                                    u.email && u.email.toLowerCase() === email.toLowerCase().trim());
    if (!user) {
      throw new Error('Identity verification failed. Username and Email do not match.');
    }
    return { success: true, userId: user.id };
    
  } else if (url === '/api/auth/reset-password') {
    const { userId, newPassword } = body;
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      throw new Error('User not found.');
    }
    const hash = await clientHashPassword(newPassword, user.salt);
    user.passwordHash = hash;
    
    const tokenVal = 'tok_' + generateUUID();
    db.sessions[tokenVal] = { userId: user.id };
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = user;
    const family = user.familyId ? db.families.find(f => f.id === user.familyId) : null;
    return { token: tokenVal, user: safeUser, family };
    
  } else if (url === '/api/auth/logout') {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const sToken = authHeader.substring(7);
      delete db.sessions[sToken];
      saveDb();
    }
    return { success: true };
    
  } else if (url === '/api/family/create') {
    if (!sessionUser) throw new Error('Unauthorized');
    const { name } = body;
    const familyCode = 'FAM-' + generateUUID().substring(0, 6).toUpperCase();
    const newFamily = {
      id: 'fam_' + generateUUID(),
      name,
      inviteCode: familyCode
    };
    db.families.push(newFamily);
    
    // Join family
    sessionUser.familyId = newFamily.id;
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = sessionUser;
    return { family: newFamily, user: safeUser };
    
  } else if (url === '/api/family/join') {
    if (!sessionUser) throw new Error('Unauthorized');
    const { inviteCode } = body;
    const family = db.families.find(f => f.inviteCode.toUpperCase() === inviteCode.toUpperCase().trim());
    if (!family) throw new Error('Invalid invite code.');
    
    sessionUser.familyId = family.id;
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = sessionUser;
    return { family, user: safeUser };
    
  } else if (url === '/api/family/members') {
    if (!sessionUser || !sessionUser.familyId) return { members: [] };
    const members = db.users
      .filter(u => u.familyId === sessionUser.familyId)
      .map(({ passwordHash, salt, username, ...safeUser }) => safeUser);
    return { members };
    
  } else if (url === '/api/family/add-member') {
    if (!sessionUser || !sessionUser.familyId) throw new Error('You must belong to a family.');
    const { username, password, name, color, email } = body;
    if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already taken.');
    }
    const uSalt = generateUUID().substring(0, 8);
    const uHash = await clientHashPassword(password, uSalt);
    const newUser = {
      id: 'usr_' + generateUUID(),
      username,
      email: email || '',
      passwordHash: uHash,
      salt: uSalt,
      name,
      color,
      familyId: sessionUser.familyId
    };
    db.users.push(newUser);
    saveDb();
    
    const { passwordHash: h, salt: s, ...safeUser } = newUser;
    return { user: safeUser };
    
  } else if (url === '/api/events') {
    if (!sessionUser || !sessionUser.familyId) return { events: [] };
    
    if (options.method === 'POST') {
      const { title, description, date, startTime, endTime, category, relevantTo } = body;
      const newEvent = {
        id: 'evt_' + generateUUID(),
        familyId: sessionUser.familyId,
        createdBy: sessionUser.id,
        title,
        description,
        date,
        startTime,
        endTime,
        category,
        relevantTo: Array.isArray(relevantTo) ? relevantTo : [sessionUser.id]
      };
      db.events.push(newEvent);
      saveDb();
      return { event: newEvent };
    }
    
    // GET request logic: visibility checks
    const fEvents = db.events.filter(e => e.familyId === sessionUser.familyId);
    const visibleEvents = fEvents.filter(e => {
      const isCreator = e.createdBy === sessionUser.id;
      const isRelevant = Array.isArray(e.relevantTo) && e.relevantTo.includes(sessionUser.id);
      return isCreator || isRelevant;
    });
    return { events: visibleEvents };
    
  } else if (url.startsWith('/api/events/')) {
    if (!sessionUser) throw new Error('Unauthorized');
    const eventId = url.substring('/api/events/'.length);
    const index = db.events.findIndex(e => e.id === eventId && e.familyId === sessionUser.familyId);
    
    if (index === -1) throw new Error('Event not found');
    
    if (options.method === 'DELETE') {
      db.events.splice(index, 1);
      saveDb();
      return { success: true };
    } else if (options.method === 'PUT') {
      const { title, description, date, startTime, endTime, category, relevantTo } = body;
      const existing = db.events[index];
      db.events[index] = {
        ...existing,
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        date: date !== undefined ? date : existing.date,
        startTime: startTime !== undefined ? startTime : existing.startTime,
        endTime: endTime !== undefined ? endTime : existing.endTime,
        category: category !== undefined ? category : existing.category,
        relevantTo: relevantTo !== undefined ? relevantTo : existing.relevantTo
      };
      saveDb();
      return { event: db.events[index] };
    }
  }
  
  throw new Error('Not Found');
}

// Generate simple mock UUIDs client side
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Generates seed data for local storage sandbox on first load
function getSeedDatabase() {
  const seedDb = {
    users: [
      {
        id: 'usr_sarah',
        username: 'sarah',
        email: 'sarah@adams.com',
        passwordHash: '3698271d39176bca27b41e28f3eb805984fefc677f474c92b9a64a42a3e26696', // hash of password123 with salt 'salt_sarah'
        salt: 'salt_sarah',
        name: 'Sarah (Mom)',
        familyId: 'fam_adams',
        color: '#ec4899'
      },
      {
        id: 'usr_john',
        username: 'john',
        email: 'john@adams.com',
        passwordHash: '688b4e1dca656b1a54bbb648d37bc8efb516915f8d975316f67ad1a9b63c73db', // hash of password123 with salt 'salt_john'
        salt: 'salt_john',
        name: 'John (Dad)',
        familyId: 'fam_adams',
        color: '#3b82f6'
      },
      {
        id: 'usr_leo',
        username: 'leo',
        email: 'leo@adams.com',
        passwordHash: '1d8070db727094cebc36a22e86f963a3e01df2e223c502f84295a2b4455f55b8', // hash of password123 with salt 'salt_leo'
        salt: 'salt_leo',
        name: 'Leo (Son)',
        familyId: 'fam_adams',
        color: '#10b981'
      },
      {
        id: 'usr_maya',
        username: 'maya',
        email: 'maya@adams.com',
        passwordHash: 'dc0519c2bdbf1f11ec2f4a7f343fb3a9580f48757d6515f9a33c582ffc330a09', // hash of password123 with salt 'salt_maya'
        salt: 'salt_maya',
        name: 'Maya (Daughter)',
        familyId: 'fam_adams',
        color: '#f59e0b'
      }
    ],
    families: [
      {
        id: 'fam_adams',
        name: 'Adams Family',
        inviteCode: 'ADAMS123'
      }
    ],
    events: [],
    sessions: {}
  };
  
  // Seed dates relative to today
  const today = new Date();
  const formatOffsetDate = (offsetDays) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  };
  
  seedDb.events = [
    {
      id: 'evt_1',
      familyId: 'fam_adams',
      createdBy: 'usr_sarah',
      title: 'Weekly Family Dinner 🍽️',
      description: 'Sunday night dinner. Everyone must attend!',
      date: formatOffsetDate(-today.getDay()),
      startTime: '18:30',
      endTime: '20:30',
      category: 'fun',
      relevantTo: ['usr_sarah', 'usr_john', 'usr_leo', 'usr_maya']
    },
    {
      id: 'evt_2',
      familyId: 'fam_adams',
      createdBy: 'usr_leo',
      title: 'Soccer Practice ⚽',
      description: 'Leo practice session. Dad to drive him.',
      date: formatOffsetDate(2 - today.getDay()),
      startTime: '16:00',
      endTime: '17:30',
      category: 'school',
      relevantTo: ['usr_leo', 'usr_john', 'usr_sarah']
    },
    {
      id: 'evt_3',
      familyId: 'fam_adams',
      createdBy: 'usr_john',
      title: 'Dentist Appointment 🦷',
      description: 'Routine checkup for Dad.',
      date: formatOffsetDate(3 - today.getDay()),
      startTime: '09:00',
      endTime: '10:00',
      category: 'appointment',
      relevantTo: ['usr_john']
    },
    {
      id: 'evt_4',
      familyId: 'fam_adams',
      createdBy: 'usr_sarah',
      title: 'Piano Lesson 🎹',
      description: 'Maya piano practice. Mom driving.',
      date: formatOffsetDate(4 - today.getDay()),
      startTime: '15:00',
      endTime: '16:00',
      category: 'school',
      relevantTo: ['usr_maya', 'usr_sarah']
    },
    {
      id: 'evt_5',
      familyId: 'fam_adams',
      createdBy: 'usr_sarah',
      title: 'Date Night ❤️',
      description: 'Dinner date at the Italian restaurant.',
      date: formatOffsetDate(5 - today.getDay()),
      startTime: '20:00',
      endTime: '22:30',
      category: 'fun',
      relevantTo: ['usr_sarah', 'usr_john']
    }
  ];
  
  return seedDb;
}
