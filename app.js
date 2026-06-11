// KINSHIP - Client Application State
let currentUser = null;       // Firebase Auth User object
let userProfile = null;       // Firestore document data from /users/{uid} (name, email, username, color, families)
let activeFamilyId = null;    // Current selected family/group ID
let currentFamily = null;     // Firestore document data for active family (name, inviteCode, members)
let familyMembers = [];       // Array of user profiles belonging to the active family
let events = [];              // Array of events belonging to the active family
let activeFilters = [];       // User IDs that are visible on the calendar
let userFamilies = [];        // List of family documents the current user belongs to

let activeView = 'calendar'; // 'calendar' | 'family' | 'settings'
let calendarMode = 'month';  // 'month' | 'week'
let currentDate = new Date(); // Anchor date for calendar grid calculations
let selectedDay = new Date().toISOString().split('T')[0]; // For daily list in monthly view

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
const auth = firebase.auth();

// Enable offline persistence in Firestore
dbFirestore.enablePersistence().catch(err => {
  if (err.code == 'failed-precondition') {
    console.warn("Multiple tabs open, persistence can only be enabled in one tab at a time.");
  } else if (err.code == 'unimplemented') {
    console.warn("The current browser does not support persistence.");
  }
});

let eventsUnsubscribe = null;
let membersUnsubscribe = null;
let userProfileUnsubscribe = null;

// ================= INITIALIZATION & AUTH =================

document.addEventListener('DOMContentLoaded', () => {
  // Listen for authentication changes
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      showToast('Signing in...', 'info');
      currentUser = user;
      
      // Listen to user profile changes in real-time
      if (userProfileUnsubscribe) userProfileUnsubscribe();
      userProfileUnsubscribe = dbFirestore.collection("users").doc(user.uid).onSnapshot(async (doc) => {
        if (!doc.exists) {
          // If this is a Google sign-in user who hasn't completed onboarding yet, show the modal
          const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
          if (isGoogleUser) {
            const onboardingModal = document.getElementById('google-onboarding-modal');
            if (onboardingModal) onboardingModal.classList.add('active');
          } else {
            console.warn("User profile does not exist for user:", user.uid);
          }
          return;
        }
        
        // Profile exists, make sure onboarding modal is closed
        const onboardingModal = document.getElementById('google-onboarding-modal');
        if (onboardingModal) onboardingModal.classList.remove('active');
        
        userProfile = doc.data();
        await loadUserFamilies();
      }, err => {
        console.error("Profile load failed:", err);
      });
      
    } else {
      handleLogoutCleanup();
    }
  });
});

function handleLogoutCleanup() {
  currentUser = null;
  userProfile = null;
  activeFamilyId = null;
  currentFamily = null;
  userFamilies = [];
  familyMembers = [];
  events = [];
  activeFilters = [];
  
  if (eventsUnsubscribe) { eventsUnsubscribe(); eventsUnsubscribe = null; }
  if (membersUnsubscribe) { membersUnsubscribe(); membersUnsubscribe = null; }
  if (userProfileUnsubscribe) { userProfileUnsubscribe(); userProfileUnsubscribe = null; }
  
  showScreen('auth');
  
  // Reset forms if elements exist
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  if (loginForm) loginForm.reset();
  if (registerForm) registerForm.reset();
  
  const onboardingModal = document.getElementById('google-onboarding-modal');
  if (onboardingModal) onboardingModal.classList.remove('active');
  const onboardingForm = document.getElementById('google-onboarding-form');
  if (onboardingForm) onboardingForm.reset();
}

async function loadUserFamilies() {
  if (!userProfile) return;
  
  try {
    // Query families where members array contains the user's uid
    const snap = await dbFirestore.collection("families")
      .where("members", "arrayContains", currentUser.uid)
      .get();
      
    userFamilies = [];
    snap.forEach(doc => {
      userFamilies.push({ id: doc.id, ...doc.data() });
    });
    
    if (userFamilies.length > 0) {
      const savedActive = localStorage.getItem('kinship_active_family_id');
      if (savedActive && userFamilies.some(f => f.id === savedActive)) {
        activeFamilyId = savedActive;
      } else {
        activeFamilyId = userFamilies[0].id;
        localStorage.setItem('kinship_active_family_id', activeFamilyId);
      }
      currentFamily = userFamilies.find(f => f.id === activeFamilyId);
      
      updateFamilySwitcherUI();
      setupActiveFamilyListeners();
      
      showScreen('app');
      updateHeaderAndProfile();
    } else {
      activeFamilyId = null;
      currentFamily = null;
      document.getElementById('header-family-badge').style.display = 'none';
      
      showScreen('app');
      updateHeaderAndProfile();
      
      renderFamilyHub();
      navigateTo('family');
      showToast('Please create or join a family group to start.', 'info');
    }
  } catch (err) {
    console.error("Failed to load families:", err);
    showToast("Error loading families: " + err.message, "error");
  }
}

function updateFamilySwitcherUI() {
  const container = document.getElementById('header-family-badge');
  const select = document.getElementById('header-family-select');
  
  if (userFamilies.length > 0) {
    container.style.display = 'block';
    select.innerHTML = '';
    
    userFamilies.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.innerText = f.name;
      if (f.id === activeFamilyId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  } else {
    container.style.display = 'none';
  }
}

function switchActiveFamily(familyId) {
  if (familyId === activeFamilyId) return;
  activeFamilyId = familyId;
  localStorage.setItem('kinship_active_family_id', activeFamilyId);
  currentFamily = userFamilies.find(f => f.id === activeFamilyId);
  
  setupActiveFamilyListeners();
  updateHeaderAndProfile();
  
  if (activeView === 'family') {
    renderFamilyHub();
  }
  showToast(`Switched to ${currentFamily.name}`);
}

function setupActiveFamilyListeners() {
  if (eventsUnsubscribe) eventsUnsubscribe();
  if (membersUnsubscribe) membersUnsubscribe();
  
  if (!activeFamilyId) return;
  
  eventsUnsubscribe = dbFirestore.collection("events")
    .where("familyId", "==", activeFamilyId)
    .onSnapshot(snap => {
      events = [];
      snap.forEach(doc => {
        events.push({ id: doc.id, ...doc.data() });
      });
      renderCalendar();
    }, err => {
      console.error("Events sync failed:", err);
    });
    
  membersUnsubscribe = dbFirestore.collection("users")
    .where("families", "arrayContains", activeFamilyId)
    .onSnapshot(snap => {
      familyMembers = [];
      snap.forEach(doc => {
        familyMembers.push({ id: doc.id, ...doc.data() });
      });
      
      const newMemberIds = familyMembers.map(m => m.id);
      if (!activeFilters || activeFilters.length === 0) {
        activeFilters = newMemberIds;
      } else {
        activeFilters = activeFilters.filter(id => newMemberIds.includes(id));
        if (activeFilters.length === 0) activeFilters = newMemberIds;
      }
      
      updateFilterBarMarkup();
      renderFamilyHub();
      renderCalendar();
    }, err => {
      console.error("Members sync failed:", err);
    });
}

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

// Initialise application layout once authenticated
async function initApp() {
  showScreen('app');
  updateHeaderAndProfile();
}

function updateHeaderAndProfile() {
  if (!currentUser || !userProfile) return;
  
  const initials = userProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const avatar = document.getElementById('header-avatar');
  avatar.innerText = initials;
  avatar.style.backgroundColor = userProfile.color;
  
  document.getElementById('settings-avatar').innerText = initials;
  document.getElementById('settings-avatar').style.backgroundColor = userProfile.color;
  document.getElementById('settings-user-name').innerText = userProfile.name;
  document.getElementById('settings-username-handle').innerText = `@${userProfile.username}`;
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

// Auth actions handlers using Firebase Auth
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  const submitButton = document.querySelector('#login-form button');
  submitButton.innerText = 'Logging In...';
  submitButton.disabled = true;
  
  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('Logged in successfully!');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitButton.innerHTML = '<span>Log In</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    submitButton.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('register-name').value;
  const email = document.getElementById('register-email').value;
  const username = document.getElementById('register-username').value.trim().toLowerCase();
  const password = document.getElementById('register-password').value;
  const color = document.querySelector('input[name="user-color"]:checked').value;
  const familyMode = document.querySelector('input[name="family-mode"]:checked').value;
  
  const submitButton = document.querySelector('#register-form button');
  submitButton.innerText = 'Registering...';
  submitButton.disabled = true;
  
  try {
    const uSnap = await dbFirestore.collection("users").where("username", "==", username).get();
    if (!uSnap.empty) {
      throw new Error("Username already taken. Please choose another one.");
    }
    
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;
    
    const userProfileData = {
      name,
      email,
      username,
      color,
      families: []
    };
    
    let createdFamilyId = null;
    
    if (familyMode === 'create') {
      const familyName = document.getElementById('family-name-input').value;
      const inviteCode = 'FAM-' + generateUUID().substring(0, 6).toUpperCase();
      
      const newFamilyRef = dbFirestore.collection("families").doc();
      createdFamilyId = newFamilyRef.id;
      
      await newFamilyRef.set({
        name: familyName,
        inviteCode: inviteCode,
        members: [user.uid]
      });
      
      userProfileData.families.push(createdFamilyId);
    } else {
      const inviteCode = document.getElementById('family-code-input').value.trim().toUpperCase();
      const fSnap = await dbFirestore.collection("families").where("inviteCode", "==", inviteCode).get();
      if (fSnap.empty) {
        throw new Error("Invalid invitation code. Profile created, please join via Family Hub.");
      }
      
      const familyDoc = fSnap.docs[0];
      const familyId = familyDoc.id;
      const familyData = familyDoc.data();
      
      const updatedMembers = [...(familyData.members || []), user.uid];
      await dbFirestore.collection("families").doc(familyId).update({ members: updatedMembers });
      
      userProfileData.families.push(familyId);
    }
    
    await dbFirestore.collection("users").doc(user.uid).set(userProfileData);
    showToast('Account registered successfully!');
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitButton.innerHTML = '<span>Create Account</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    submitButton.disabled = false;
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
    showToast('Logged out.');
  } catch (err) {
    showToast('Failed to log out: ' + err.message, 'error');
  }
}

async function handleGoogleSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    showToast('Signing in with Google...');
  } catch (err) {
    console.error("Google sign in failed:", err);
    showToast(err.message, 'error');
  }
}

async function submitGoogleOnboarding(e) {
  e.preventDefault();
  if (!currentUser) {
    showToast('No user signed in.', 'error');
    return;
  }
  
  const username = document.getElementById('onboarding-username').value.trim().toLowerCase();
  const color = document.querySelector('input[name="onboarding-color"]:checked').value;
  const name = currentUser.displayName || username;
  const email = currentUser.email;
  
  const submitButton = document.querySelector('#google-onboarding-form button[type="submit"]');
  submitButton.innerText = 'Finishing Setup...';
  submitButton.disabled = true;
  
  try {
    // Check if username is already taken
    const uSnap = await dbFirestore.collection("users").where("username", "==", username).get();
    if (!uSnap.empty) {
      throw new Error("Username already taken. Please choose another.");
    }
    
    const userProfileData = {
      name,
      email,
      username,
      color,
      families: []
    };
    
    await dbFirestore.collection("users").doc(currentUser.uid).set(userProfileData);
    showToast('Profile completed successfully!');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitButton.innerText = 'Finish Setup';
    submitButton.disabled = false;
  }
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
  const email = document.getElementById('forgot-email').value;
  
  const submitButton = document.querySelector('#forgot-verify-form button');
  submitButton.innerText = 'Sending...';
  submitButton.disabled = true;
  
  try {
    await auth.sendPasswordResetEmail(email);
    showToast("Password reset link sent to your email!");
    closeForgotPassword();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitButton.innerText = 'Verify Identity';
    submitButton.disabled = false;
  }
}

// Reset form is skipped since Firebase handles email reset natively
async function handleForgotPasswordReset(e) {
  e.preventDefault();
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
    
    const isMe = currentUser && m.id === currentUser.uid;
    
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
  const username = document.getElementById('new-member-username').value.trim().toLowerCase();
  const password = document.getElementById('new-member-password').value;
  const color = document.querySelector('input[name="new-user-color"]:checked').value;
  
  const submitButton = document.querySelector('#add-member-form button');
  submitButton.innerText = 'Creating Account...';
  submitButton.disabled = true;
  
  let secondaryApp = null;
  try {
    const uSnap = await dbFirestore.collection("users").where("username", "==", username).get();
    if (!uSnap.empty) {
      throw new Error("Username already taken. Please choose another.");
    }
    
    const secondaryAppName = "temp_" + generateUUID().substring(0, 8);
    secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = secondaryApp.auth();
    
    const credential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const newUid = credential.user.uid;
    
    await secondaryAuth.signOut();
    
    await dbFirestore.collection("users").doc(newUid).set({
      name,
      email,
      username,
      color,
      families: [activeFamilyId]
    });
    
    const updatedMembers = [...(currentFamily.members || []), newUid];
    await dbFirestore.collection("families").doc(activeFamilyId).update({ members: updatedMembers });
    
    showToast(`${name} added to family!`);
    document.getElementById('add-member-form').reset();
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (secondaryApp) {
      try {
        await secondaryApp.delete();
      } catch (e) {}
    }
    submitButton.innerText = 'Add Member Account';
    submitButton.disabled = false;
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
      isChecked = currentUser && member.id === currentUser.uid;
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
    familyId: activeFamilyId,
    createdBy: currentUser.uid,
    title,
    description,
    date,
    startTime,
    endTime,
    category,
    relevantTo
  };
  
  const submitButton = document.querySelector('#event-form button[type="submit"]');
  submitButton.innerText = 'Saving...';
  submitButton.disabled = true;
  
  try {
    if (id) {
      await dbFirestore.collection("events").doc(id).update(eventPayload);
      showToast('Event updated successfully!');
    } else {
      await dbFirestore.collection("events").add(eventPayload);
      showToast('Event scheduled!');
    }
    closeEventModal();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitButton.innerText = 'Save Event';
    submitButton.disabled = false;
  }
}

async function handleDeleteEvent() {
  const id = document.getElementById('event-form-id').value;
  if (!id) return;
  
  if (!confirm('Are you sure you want to delete this event?')) return;
  
  try {
    await dbFirestore.collection("events").doc(id).delete();
    showToast('Event deleted.');
    closeEventModal();
  } catch (err) {
    showToast(err.message, 'error');
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
    const inviteCode = 'FAM-' + generateUUID().substring(0, 6).toUpperCase();
    
    // Create family document
    const familyRef = dbFirestore.collection("families").doc();
    const familyId = familyRef.id;
    
    await familyRef.set({
      name,
      inviteCode,
      members: [currentUser.uid]
    });
    
    // Update user profile
    const updatedFamilies = [...(userProfile.families || []), familyId];
    await dbFirestore.collection("users").doc(currentUser.uid).update({ families: updatedFamilies });
    
    showToast('New family group created!');
    
    // Set as active family
    activeFamilyId = familyId;
    localStorage.setItem('kinship_active_family_id', activeFamilyId);
    
    document.getElementById('hub-create-name').value = '';
    
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleJoinFamilyFromHub(e) {
  e.preventDefault();
  const inviteCode = document.getElementById('hub-join-code').value.trim().toUpperCase();
  
  try {
    const fSnap = await dbFirestore.collection("families").where("inviteCode", "==", inviteCode).get();
    if (fSnap.empty) {
      throw new Error("Invalid invite code.");
    }
    
    const familyDoc = fSnap.docs[0];
    const familyId = familyDoc.id;
    const familyData = familyDoc.data();
    
    if (familyData.members && familyData.members.includes(currentUser.uid)) {
      throw new Error("You are already a member of this family group.");
    }
    
    // Update family members
    const updatedMembers = [...(familyData.members || []), currentUser.uid];
    await dbFirestore.collection("families").doc(familyId).update({ members: updatedMembers });
    
    // Update user profile
    const updatedFamilies = [...(userProfile.families || []), familyId];
    await dbFirestore.collection("users").doc(currentUser.uid).update({ families: updatedFamilies });
    
    showToast('Successfully joined the group!');
    
    // Set as active family
    activeFamilyId = familyId;
    localStorage.setItem('kinship_active_family_id', activeFamilyId);
    
    document.getElementById('hub-join-code').value = '';
    
  } catch (err) {
    showToast(err.message, 'error');
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

// Generate simple mock UUIDs client side
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
