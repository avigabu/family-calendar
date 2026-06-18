// SYNCUP - Client Application State
let currentUser = null;       // Firebase Auth User object
let userProfile = null;       // Firestore document data from /users/{uid} (name, email, color, families)
let activeFamilyId = null;    // Current selected family/group ID
let currentFamily = null;     // Firestore document data for active family (name, inviteCode, members)
let familyMembers = [];       // Array of user profiles belonging to the active family
let events = [];              // Array of events belonging to the active family
let activeFilters = [];       // User IDs that are visible on the calendar
let userFamilies = [];        // List of family documents the current user belongs to

let activeView = 'calendar'; // 'calendar' | 'family' | 'settings'
let calendarMode = 'month';  // 'month' | 'week'
let currentDate = new Date(); // Anchor date for calendar grid calculations
// Helper to format Date object into local YYYY-MM-DD string
function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to format date string (YYYY-MM-DD) or Date object into local DD/MM/YYYY string
function formatDateDMY(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const parts = date.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const dObj = new Date(date);
    const d = String(dObj.getDate()).padStart(2, '0');
    const m = String(dObj.getMonth() + 1).padStart(2, '0');
    const y = dObj.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Helper to parse local DD/MM/YYYY string into YYYY-MM-DD string
function parseDMYtoYMD(dmyStr) {
  if (!dmyStr) return '';
  const parts = dmyStr.split('/');
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }
  return dmyStr;
}

// Helper to determine if an event is all-day (represented as spanning solid color bar)
function isEventAllDay(evt) {
  if (!evt) return false;
  if (evt.category === 'flight' || evt.category === 'school_vacation' || evt.category === 'family_vacation') {
    return true;
  }
  if (evt.category === 'regular' && evt.endDate && evt.endDate !== evt.date) {
    return true;
  }
  return false;
}

let selectedDay = formatDateLocal(new Date()); // For daily list in monthly view

// ================= INTERNATIONALIZATION & THEME SETTINGS =================
const TRANSLATIONS = {
  en: {
    calendar: "Calendar",
    family: "Family",
    settings: "Profile",
    today: "Today",
    month: "Month",
    week: "Week",
    my_profile: "My Profile",
    current_family_group: "Current Family Group",
    no_family_joined: "No Family Joined",
    start_of_week: "Start of Week",
    language: "Language",
    display_mode: "Display Mode",
    log_out: "Log Out",
    delete_account: "Delete Account",
    sunday: "Sunday",
    monday: "Monday",
    dark_mode: "Dark Mode",
    light_mode: "Light Mode",
    sunday_short: "Sun",
    monday_short: "Mon",
    tuesday_short: "Tue",
    wednesday_short: "Wed",
    thursday_short: "Thu",
    friday_short: "Fri",
    saturday_short: "Sat",
    january: "January",
    february: "February",
    march: "March",
    april: "April",
    may: "May",
    june: "June",
    july: "July",
    august: "August",
    september: "September",
    october: "October",
    november: "November",
    december: "December",
    january_short: "Jan",
    february_short: "Feb",
    march_short: "Mar",
    april_short: "Apr",
    may_short: "May",
    june_short: "Jun",
    july_short: "Jul",
    august_short: "Aug",
    september_short: "Sep",
    october_short: "Okt",
    november_short: "Nov",
    december_short: "Dec",
    no_events_scheduled: "No events scheduled.",
    more_events: "+{count} more",
    confirm_delete_event: "Are you sure you want to delete this event?",
    confirm_delete_account: "WARNING: This will permanently delete your account, your profile, and remove you from all family groups. This action cannot be undone.\n\nAre you sure you want to proceed?",
    created_by: "Created By:",
    visible_to: "Visible to:",
    edit_event: "Edit Event",
    no_description: "No description provided.",
    event_title: "Title",
    event_date: "Date",
    start_date: "Start Date",
    end_date: "End Date",
    event_category: "Type",
    event_starts: "Starts",
    event_ends: "Ends",
    event_description: "Description",
    event_relevancy_label: "Who is this relevant to?",
    event_relevancy_desc: "Select which family members will see this event on their calendar.",
    save_event: "Save Event",
    delete_event: "Delete Event",
    cat_regular: "Regular Event 🗓️",
    cat_school_vacation: "School Vacation 🎒",
    cat_family_vacation: "Family Vacation 🏖️",
    cat_flight: "Flight ✈️",
    filter_label: "Filter:",
    agenda_prefix: "Agenda:",
    no_events_today: "No events scheduled for this day.",
    add_btn_text: "Add",
    family_hub: "Family Hub",
    family_subtitle: "Manage group members and invite others",
    invite_code_label: "Family Invite Code:",
    invite_code_desc: "Share this code with family members so they can join this group.",
    copy: "Copy",
    add_member_no_account: "Add Child / Member without Account",
    member_name: "Member Name",
    add_to_group: "Add to Group",
    groups_and_circles: "Groups & Circles",
    create_or_join_group: "Create or Join Another Group",
    create_new_group: "Create a New Group",
    join_existing_group: "Join an Existing Group",
    create_group: "Create Group",
    join_group: "Join Group",
    placeholder_member_name: "e.g. Leo (Son)",
    placeholder_group_name: "e.g. Parents & Brothers",
    placeholder_join_code: "e.g. FAM-A1B2C3",
    placeholder_family_name: "e.g. Smith Family",
    join_or_create_family: "Join or Create a Family",
    no_family_joined_desc: "You are not part of any family group yet.",
    create_new_family_group: "Create a New Family Group",
    family_name_label: "Family Surname / Group Name",
    create_family_group: "Create Family Group",
    or_join_existing_family: "Or Join Existing Family",
    join_with_invite_code: "Join with Invite Code",
    join_family_group: "Join Family Group",
    members: "Members",
    adding: "Adding...",
    saving: "Saving...",
    you: "(You)",
    child_no_account: "Child / No Account",
    new_event: "New Event",
    flight_details: "Flight Details ✈️",
    flight_dep_date: "Departure Date",
    flight_dep_takeoff: "Takeoff",
    flight_dep_landing: "Landing",
    flight_ret_date: "Return Date",
    flight_ret_takeoff: "Takeoff",
    flight_ret_landing: "Landing",
    flight_passengers: "Who is flying?",
    flight_passengers_placeholder: "e.g. Mom & Dad",
    flight_destination: "Where to?",
    flight_destination_placeholder: "Destination",
    flight_booking_ref: "Booking Reference",
    flight_booking_ref_placeholder: "Booking code"
  },
  de: {
    calendar: "Kalender",
    family: "Familie",
    settings: "Profil",
    today: "Heute",
    month: "Monat",
    week: "Woche",
    my_profile: "Mein Profil",
    current_family_group: "Aktuelle Familiengruppe",
    no_family_joined: "Keiner Familie beigetreten",
    start_of_week: "Wochenbeginn",
    language: "Sprache",
    display_mode: "Anzeigemodus",
    log_out: "Abmelden",
    delete_account: "Konto löschen",
    sunday: "Sonntag",
    monday: "Montag",
    dark_mode: "Dunkler Modus",
    light_mode: "Heller Modus",
    sunday_short: "So",
    monday_short: "Mo",
    tuesday_short: "Di",
    wednesday_short: "Mi",
    thursday_short: "Do",
    friday_short: "Fr",
    saturday_short: "Sa",
    january: "Januar",
    february: "Februar",
    march: "März",
    april: "April",
    may: "Mai",
    june: "Juni",
    july: "Juli",
    august: "August",
    september: "September",
    october: "Oktober",
    november: "November",
    december: "Dezember",
    january_short: "Jan",
    february_short: "Feb",
    march_short: "Mär",
    april_short: "Apr",
    may_short: "Mai",
    june_short: "Jun",
    july_short: "Jul",
    august_short: "Aug",
    september_short: "Sep",
    october_short: "Okt",
    november_short: "Nov",
    december_short: "Dez",
    no_events_scheduled: "Keine Termine geplant.",
    more_events: "+{count} weitere",
    confirm_delete_event: "Möchtest du diesen Termin wirklich löschen?",
    confirm_delete_account: "WARNUNG: Dies wird Ihr Konto und Ihr Profil dauerhaft löschen und Sie aus allen Familiengruppen entfernen. Diese Aktion kann nicht rückgängig gemacht werden.\n\nMöchten Sie wirklich fortfahren?",
    created_by: "Erstellt von:",
    visible_to: "Sichtbar für:",
    edit_event: "Termin bearbeiten",
    no_description: "Keine Beschreibung vorhanden.",
    event_title: "Titel",
    event_date: "Datum",
    start_date: "Startdatum",
    end_date: "Enddatum",
    event_category: "Typ",
    event_starts: "Beginnt",
    event_ends: "Endet",
    event_description: "Beschreibung",
    event_relevancy_label: "Für wen ist das relevant?",
    event_relevancy_desc: "Wähle aus, welche Familienmitglieder diesen Termin in ihrem Kalender sehen.",
    save_event: "Termin speichern",
    delete_event: "Termin löschen",
    cat_regular: "Reguläre Veranstaltung 🗓️",
    cat_school_vacation: "Schulferien 🎒",
    cat_family_vacation: "Familienurlaub 🏖️",
    cat_flight: "Flug ✈️",
    filter_label: "Filtern:",
    agenda_prefix: "Termine:",
    no_events_today: "Keine Termine für diesen Tag geplant.",
    add_btn_text: "Hinzufügen",
    family_hub: "Familien-Hub",
    family_subtitle: "Mitglieder verwalten und andere einladen",
    invite_code_label: "Familien-Einladungscode:",
    invite_code_desc: "Teile diesen Code mit Familienmitgliedern, damit sie dieser Gruppe beitreten können.",
    copy: "Kopieren",
    add_member_no_account: "Kind / Mitglied ohne Konto hinzufügen",
    member_name: "Name des Mitglieds",
    add_to_group: "Zur Gruppe hinzufügen",
    groups_and_circles: "Gruppen & Kreise",
    create_or_join_group: "Weitere Gruppe erstellen oder beitreten",
    create_new_group: "Neue Gruppe erstellen",
    join_existing_group: "Bestehender Gruppe beitreten",
    create_group: "Gruppe erstellen",
    join_group: "Gruppe beitreten",
    placeholder_member_name: "z.B. Leo (Sohn)",
    placeholder_group_name: "z.B. Eltern & Brüder",
    placeholder_join_code: "z.B. FAM-A1B2C3",
    placeholder_family_name: "z.B. Familie Müller",
    join_or_create_family: "Familie beitreten oder erstellen",
    no_family_joined_desc: "Du bist noch Mitglied keiner Familiengruppe.",
    create_new_family_group: "Neue Familiengruppe erstellen",
    family_name_label: "Familienname / Gruppenname",
    create_family_group: "Familiengruppe erstellen",
    or_join_existing_family: "Oder bestehender Familie beitreten",
    join_with_invite_code: "Mit Einladungscode beitreten",
    join_family_group: "Familiengruppe beitreten",
    members: "Mitglieder",
    adding: "Wird hinzugefügt...",
    saving: "Wird gespeichert...",
    you: "(Du)",
    child_no_account: "Kind / Kein Konto",
    new_event: "Neuer Termin",
    flight_details: "Flugdetails ✈️",
    flight_dep_date: "Hinflugsdatum",
    flight_dep_takeoff: "Abflug",
    flight_dep_landing: "Ankunft",
    flight_ret_date: "Rückflugsdatum",
    flight_ret_takeoff: "Abflug",
    flight_ret_landing: "Ankunft",
    flight_passengers: "Wer fliegt?",
    flight_passengers_placeholder: "z.B. Mama & Papa",
    flight_destination: "Wohin?",
    flight_destination_placeholder: "Reiseziel",
    flight_booking_ref: "Buchungscode",
    flight_booking_ref_placeholder: "Buchungscode"
  },
  he: {
    calendar: "לוח שנה",
    family: "משפחה",
    settings: "פרופיל",
    today: "היום",
    month: "חודש",
    week: "שבוע",
    my_profile: "הפרופיל שלי",
    current_family_group: "קבוצה משפחתית",
    no_family_joined: "לא הצטרפת למשפחה",
    start_of_week: "תחילת השבוע",
    language: "שפה",
    display_mode: "מצב תצוגה",
    log_out: "התנתק",
    delete_account: "מחק חשבון",
    sunday: "יום ראשון",
    monday: "יום שני",
    dark_mode: "מצב כהה",
    light_mode: "מצב בהיר",
    sunday_short: "א'",
    monday_short: "ב'",
    tuesday_short: "ג'",
    wednesday_short: "ד'",
    thursday_short: "ה'",
    friday_short: "ו'",
    saturday_short: "ש'",
    january: "ינואר",
    february: "פברואר",
    march: "מרץ",
    april: "אפריל",
    may: "מאי",
    june: "יוני",
    july: "יולי",
    august: "אוגוסט",
    september: "ספטמבר",
    october: "אוקטובר",
    november: "נובמבר",
    december: "דצמבר",
    january_short: "ינו׳",
    february_short: "פבר׳",
    march_short: "מרץ",
    april_short: "אפר׳",
    may_short: "מאי",
    june_short: "יוני",
    july_short: "יולי",
    august_short: "אוג׳",
    september_short: "ספט׳",
    october_short: "אוק׳",
    november_short: "נוב׳",
    december_short: "דצמ׳",
    no_events_scheduled: "אין אירועים מתוכננים.",
    more_events: "עוד +{count}",
    confirm_delete_event: "האם אתה בטוח שברצונך למחוק אירוע זה?",
    confirm_delete_account: "אזהרה: פעולה זו תמחק לצמיתות את החשבון והפרופיל שלך ותסיר אותך מכל הקבוצות המשפחתיות. לא ניתן לבטל פעולה זו.\n\nהאם אתה בטוח שברצונך להמשיך?",
    created_by: "נוצר על ידי:",
    visible_to: "גלוי עבור:",
    edit_event: "ערוך אירוע",
    no_description: "לא צוין תיאור.",
    event_title: "כותרת",
    event_date: "תאריך",
    start_date: "תאריך התחלה",
    end_date: "תאריך סיום",
    event_category: "סוג",
    event_starts: "התחלה",
    event_ends: "סיום",
    event_description: "תיאור",
    event_relevancy_label: "עבור מי האירוע?",
    event_relevancy_desc: "בחר אילו בני משפחה יראו את האירוע בלוח השנה שלהם.",
    save_event: "שמור אירוע",
    delete_event: "מחק אירוע",
    cat_regular: "אירוע רגיל 🗓️",
    cat_school_vacation: "חופשת בית ספר 🎒",
    cat_family_vacation: "חופשה משפחתית 🏖️",
    cat_flight: "טיסה ✈️",
    filter_label: "סינון:",
    agenda_prefix: "סדר יום:",
    no_events_today: "אין אירועים מתוכננים ליום זה.",
    add_btn_text: "הוספה",
    family_hub: "מרכז המשפחה",
    family_subtitle: "ניהול חברי הקבוצה והזמנת אחרים",
    invite_code_label: "קוד הזמנה למשפחה:",
    invite_code_desc: "שתף קוד זה עם בני משפחה כדי שיוכלו להצטרף לקבוצה.",
    copy: "העתק",
    add_member_no_account: "הוסף ילד / חבר ללא חשבון",
    member_name: "שם החבר",
    add_to_group: "הוסף לקבוצה",
    groups_and_circles: "קבוצות ומעגלים",
    create_or_join_group: "צור או הצטרף לקבוצה נוספת",
    create_new_group: "צור קבוצה חדשה",
    join_existing_group: "הצטרף לקבוצה קיימת",
    create_group: "צור קבוצה",
    join_group: "הצטרף לקבוצה",
    placeholder_member_name: "למשל: ליאו (בן)",
    placeholder_group_name: "למשל: הורים ואחים",
    placeholder_join_code: "למשל: FAM-A1B2C3",
    placeholder_family_name: "למשל: משפחת כהן",
    join_or_create_family: "הצטרף או צור משפחה",
    no_family_joined_desc: "אינך חלק מקבוצה משפחתית עדיין.",
    create_new_family_group: "צור קבוצה משפחתית חדשה",
    family_name_label: "שם משפחה / שם קבוצה",
    create_family_group: "צור קבוצה משפחתית",
    or_join_existing_family: "או הצטרף למשפחה קיימת",
    join_with_invite_code: "הצטרף באמצעות קוד הזמנה",
    join_family_group: "הצטרף לקבוצה משפחתית",
    members: "חברים",
    adding: "מוסיף...",
    saving: "שומר...",
    you: "(אני)",
    child_no_account: "ילד / ללא חשבון",
    new_event: "אירוע חדש",
    flight_details: "פרטי טיסה ✈️",
    flight_dep_date: "תאריך הלוך",
    flight_dep_takeoff: "המראה",
    flight_dep_landing: "נחיתה",
    flight_ret_date: "תאריך חזור",
    flight_ret_takeoff: "המראה",
    flight_ret_landing: "נחיתה",
    flight_passengers: "מי טס?",
    flight_passengers_placeholder: "לדוגמה: אמא ואבא",
    flight_destination: "לאן טסים?",
    flight_destination_placeholder: "יעד",
    flight_booking_ref: "מספר הזמנה",
    flight_booking_ref_placeholder: "קוד הזמנה"
  }
};

function t(key, count = null) {
  const lang = userProfile?.settings?.language || 'en';
  let str = TRANSLATIONS[lang]?.[key] || TRANSLATIONS['en']?.[key] || key;
  if (count !== null) {
    str = str.replace('{count}', count);
  }
  return str;
}

async function updateUserSetting(key, value) {
  if (!currentUser) return;
  if (!userProfile) userProfile = {};
  if (!userProfile.settings) userProfile.settings = {};
  
  userProfile.settings[key] = value;
  
  try {
    showToast('Updating settings...', 'info');
    await dbFirestore.collection("users").doc(currentUser.uid).update({
      settings: userProfile.settings
    });
    applyUserSettings();
  } catch (err) {
    console.error("Failed to save setting:", err);
    showToast("Failed to save setting: " + err.message, "error");
  }
}

function applyUserSettings() {
  if (!userProfile) return;
  
  const settings = userProfile.settings || {};
  const theme = settings.theme || 'dark';
  const lang = settings.language || 'en';
  const weekStart = settings.weekStart || 'sunday';
  
  // 1. Theme toggle
  if (theme === 'light') {
    document.documentElement.classList.add('theme-light');
  } else {
    document.documentElement.classList.remove('theme-light');
  }
  
  // 2. Sync Settings select dropdowns
  const selectTheme = document.getElementById('settings-theme');
  if (selectTheme) selectTheme.value = theme;
  
  const selectLang = document.getElementById('settings-language');
  if (selectLang) selectLang.value = lang;
  
  const selectWeek = document.getElementById('settings-week-start');
  if (selectWeek) selectWeek.value = weekStart;
  
  // 3. Apply translations
  applyLanguageUI();
}

function applyLanguageUI() {
  const lang = userProfile?.settings?.language || 'en';
  
  // Set reading direction for RTL (Hebrew)
  if (lang === 'he') {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
  
  // Translate static UI elements marked with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerText = t(key);
  });

  // Translate input placeholders marked with data-i18n-placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.setAttribute('placeholder', t(key));
  });

  // Re-render currently active view to update date formatting, titles, and dynamic strings
  if (activeView === 'calendar') {
    if (calendarMode === 'month') {
      renderMonthlyGrid();
    } else {
      renderWeeklyLayout();
    }
  } else if (activeView === 'family') {
    renderFamilyHub();
  }
}

// Color palette for automatic member colors
const PALETTE_COLORS = [
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#10b981', // Green
  '#8b5cf6', // Purple
  '#f59e0b', // Yellow/Orange
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#84cc16', // Lime
  '#14b8a6', // Teal
  '#a855f7', // Light Purple
  '#f97316'  // Deep Orange
];

async function getUnusedColorForFamily(familyId, memberUids) {
  if (!memberUids || memberUids.length === 0) {
    return PALETTE_COLORS[0];
  }
  const takenColors = new Set();
  try {
    const promises = memberUids.map(uid => dbFirestore.collection("users").doc(uid).get());
    const docs = await Promise.all(promises);
    docs.forEach(doc => {
      if (doc.exists && doc.data().color) {
        takenColors.add(doc.data().color.toLowerCase());
      }
    });
  } catch (err) {
    console.error("Error finding taken colors:", err);
  }
  for (const c of PALETTE_COLORS) {
    if (!takenColors.has(c.toLowerCase())) {
      return c;
    }
  }
  return PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)];
}

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
  setupSwipeGestures();
  setupDateInputs();
  // Listen for authentication changes
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      showToast('Signing in...', 'info');
      currentUser = user;
      
      // Listen to user profile changes in real-time
      if (userProfileUnsubscribe) userProfileUnsubscribe();
      userProfileUnsubscribe = dbFirestore.collection("users").doc(user.uid).onSnapshot(async (doc) => {
        if (!doc.exists) {
          const isGoogleUser = user.providerData.some(p => p.providerId === 'google.com');
          if (isGoogleUser) {
            // Automatically initialize Google user profile (username is removed, email is used)
            const userProfileData = {
              name: user.displayName || "Family Member",
              email: user.email,
              color: PALETTE_COLORS[0],
              families: [],
              settings: {
                weekStart: 'sunday',
                language: 'en',
                theme: 'dark'
              }
            };
            try {
              await dbFirestore.collection("users").doc(user.uid).set(userProfileData);
              showToast('Google profile initialized!', 'success');
            } catch (err) {
              console.error("Failed to initialize Google profile:", err);
              showToast("Error creating profile: " + err.message, "error");
            }
          } else {
            console.warn("User profile does not exist for user, restoring empty profile:", user.uid);
            const userProfileData = {
              name: user.displayName || user.email.split('@')[0] || "Family Member",
              email: user.email,
              color: PALETTE_COLORS[0],
              families: [],
              settings: {
                weekStart: 'sunday',
                language: 'en',
                theme: 'dark'
              }
            };
            try {
              await dbFirestore.collection("users").doc(user.uid).set(userProfileData);
              showToast('Restored default profile data.', 'info');
            } catch (err) {
              console.error("Failed to restore profile:", err);
              showToast("Error creating profile: " + err.message, "error");
            }
          }
          return;
        }
        
        userProfile = doc.data();
        applyUserSettings();
        await loadUserFamilies();
      }, err => {
        console.error("Profile load failed:", err);
      });
      
    } else {
      handleLogoutCleanup();
    }
  });
});

function setupDateInputMask(inputEl) {
  if (!inputEl) return;
  
  inputEl.addEventListener('keydown', (e) => {
    inputEl.isDeleting = (e.key === 'Backspace');
  });

  inputEl.addEventListener('input', (e) => {
    let cursorPosition = e.target.selectionStart;
    const originalLength = e.target.value.length;
    
    const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
    
    // Format to dd/mm/yyyy
    let formatted = '';
    if (value.length > 0) {
      formatted += value.substring(0, 2);
    }
    if (value.length > 2) {
      formatted += '/' + value.substring(2, 4);
    }
    if (value.length > 4) {
      formatted += '/' + value.substring(4, 8);
    }
    
    e.target.value = formatted;
    
    // Adjust cursor position if backspace wasn't just pressed
    if (!inputEl.isDeleting) {
      if (formatted.length > originalLength) {
        const addedChars = formatted.length - originalLength;
        cursorPosition += addedChars;
      }
    }
    e.target.setSelectionRange(cursorPosition, cursorPosition);
  });

  inputEl.addEventListener('blur', (e) => {
    const val = e.target.value;
    if (val) {
      const parts = val.split('/');
      let isValid = false;
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        if (d > 0 && d <= 31 && m > 0 && m <= 12 && y >= 1900 && y <= 2100) {
          isValid = true;
        }
      }
      if (!isValid) {
        showToast('Please enter a valid date in dd/mm/yyyy format', 'error');
        inputEl.style.borderColor = 'var(--danger-color)';
      } else {
        inputEl.style.borderColor = '';
      }
    } else {
      inputEl.style.borderColor = '';
    }
  });
}

function setupDateInputs() {
  setupDateInputMask(document.getElementById('event-date'));
  setupDateInputMask(document.getElementById('event-end-date'));
  setupDateInputMask(document.getElementById('flight-dep-date'));
  setupDateInputMask(document.getElementById('flight-ret-date'));
}

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
      .where("members", "array-contains", currentUser.uid)
      .get();
      
    userFamilies = [];
    snap.forEach(doc => {
      userFamilies.push({ id: doc.id, ...doc.data() });
    });
    
    if (userFamilies.length > 0) {
      const savedActive = localStorage.getItem('syncup_active_family_id');
      if (savedActive && userFamilies.some(f => f.id === savedActive)) {
        activeFamilyId = savedActive;
      } else {
        activeFamilyId = userFamilies[0].id;
        localStorage.setItem('syncup_active_family_id', activeFamilyId);
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
    if (activeView === 'calendar') {
      container.style.setProperty('display', 'none', 'important');
    } else {
      container.style.display = 'block';
    }
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
  localStorage.setItem('syncup_active_family_id', activeFamilyId);
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
    .where("families", "array-contains", activeFamilyId)
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
  
  if (type === 'error') {
    toast.innerHTML = `
      <span style="flex: 1; user-select: text;">${message}</span>
      <button class="toast-close-btn" style="background: transparent; border: none; color: var(--text-secondary); cursor: pointer; font-weight: 700; font-size: 16px; padding: 0 4px; line-height: 1; transition: color 0.2s;" onmouseover="this.style.color='var(--text-primary)'" onmouseout="this.style.color='var(--text-secondary)'">×</button>
    `;
    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.onclick = () => toast.remove();
  } else {
    toast.innerHTML = `
      <span>${message}</span>
    `;
    // Clean up element after animation
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
  
  container.appendChild(toast);
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

let isEditingName = false;
let isEditingFamilyName = false;

function updateHeaderAndProfile() {
  if (!currentUser || !userProfile) return;
  
  const initials = userProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const avatar = document.getElementById('header-avatar');
  if (avatar) {
    avatar.innerText = initials;
    avatar.style.backgroundColor = userProfile.color;
  }
  
  const settingsAvatar = document.getElementById('settings-avatar');
  if (settingsAvatar) {
    settingsAvatar.innerText = initials;
    settingsAvatar.style.backgroundColor = userProfile.color;
  }
  
  const settingsName = document.getElementById('settings-user-name');
  if (settingsName && !isEditingName) {
    settingsName.innerText = userProfile.name;
  }
  
  const settingsEmail = document.getElementById('settings-username-handle');
  if (settingsEmail) {
    settingsEmail.innerText = userProfile.email;
  }
  
  const settingsFamilyName = document.getElementById('settings-family-name');
  if (settingsFamilyName && !isEditingFamilyName) {
    settingsFamilyName.innerText = currentFamily ? currentFamily.name : t('no_family_joined');
  }
  
  const btnEditFamilyName = document.getElementById('btn-edit-family-name');
  if (btnEditFamilyName) {
    btnEditFamilyName.style.display = currentFamily ? 'inline-flex' : 'none';
  }
}

// Inline edit for display name
function toggleEditName() {
  const nameEl = document.getElementById('settings-user-name');
  const btnEl = document.getElementById('btn-edit-name');
  if (!nameEl || !btnEl) return;
  
  if (!isEditingName) {
    isEditingName = true;
    const currentVal = userProfile.name;
    nameEl.innerHTML = `
      <input type="text" id="input-new-name" value="${escapeHtml(currentVal)}" class="inline-edit-input" style="width: auto; max-width: 180px; padding: 4px 8px; font-size: 14px; height: 28px; margin: 0;">
    `;
    btnEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" style="color: var(--success-color);">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    btnEl.title = "Save Name";
    
    const input = document.getElementById('input-new-name');
    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          saveNewName();
        } else if (e.key === 'Escape') {
          cancelEditName(currentVal);
        }
      });
    }
  } else {
    saveNewName();
  }
}

async function saveNewName() {
  const input = document.getElementById('input-new-name');
  if (!input) return;
  
  const newVal = input.value.trim();
  if (!newVal) {
    showToast("Name cannot be empty", "error");
    return;
  }
  
  isEditingName = false;
  try {
    showToast("Updating display name...", "info");
    await dbFirestore.collection("users").doc(currentUser.uid).update({
      name: newVal
    });
    
    userProfile.name = newVal;
    updateHeaderAndProfile();
    
    // Also trigger update of members list if they are in a family
    if (activeFamilyId) {
      // The onSnapshot listener on members will automatically trigger renderFamilyHub,
      // but let's update header avatar instantly.
      const initials = newVal.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const headerAvatar = document.getElementById('header-avatar');
      if (headerAvatar) headerAvatar.innerText = initials;
    }
    
    showToast("Display name updated!", "success");
  } catch (err) {
    console.error("Failed to update name:", err);
    showToast("Error: " + err.message, "error");
    updateHeaderAndProfile();
  }
}

function cancelEditName(originalVal) {
  isEditingName = false;
  updateHeaderAndProfile();
  const btnEl = document.getElementById('btn-edit-name');
  if (btnEl) {
    btnEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    `;
    btnEl.title = "Edit Name";
  }
}

// Inline edit for family group name
function toggleEditFamilyName() {
  if (!currentFamily) return;
  const nameEl = document.getElementById('settings-family-name');
  const btnEl = document.getElementById('btn-edit-family-name');
  if (!nameEl || !btnEl) return;
  
  if (!isEditingFamilyName) {
    isEditingFamilyName = true;
    const currentVal = currentFamily.name;
    nameEl.innerHTML = `
      <input type="text" id="input-new-family-name" value="${escapeHtml(currentVal)}" class="inline-edit-input" style="width: auto; max-width: 180px; padding: 4px 8px; font-size: 13px; height: 28px; margin: 0;">
    `;
    btnEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" style="color: var(--success-color);">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    btnEl.title = "Save Family Name";
    
    const input = document.getElementById('input-new-family-name');
    if (input) {
      input.focus();
      input.select();
      input.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
          saveNewFamilyName();
        } else if (e.key === 'Escape') {
          cancelEditFamilyName(currentVal);
        }
      });
    }
  } else {
    saveNewFamilyName();
  }
}

async function saveNewFamilyName() {
  if (!currentFamily) return;
  const input = document.getElementById('input-new-family-name');
  if (!input) return;
  
  const newVal = input.value.trim();
  if (!newVal) {
    showToast("Family group name cannot be empty", "error");
    return;
  }
  
  isEditingFamilyName = false;
  try {
    showToast("Updating family name...", "info");
    await dbFirestore.collection("families").doc(activeFamilyId).update({
      name: newVal
    });
    
    currentFamily.name = newVal;
    const fIdx = userFamilies.findIndex(f => f.id === activeFamilyId);
    if (fIdx !== -1) {
      userFamilies[fIdx].name = newVal;
    }
    
    updateFamilySwitcherUI();
    updateHeaderAndProfile();
    showToast("Family group name updated!", "success");
  } catch (err) {
    console.error("Failed to update family name:", err);
    showToast("Error: " + err.message, "error");
    updateHeaderAndProfile();
  }
}

function cancelEditFamilyName(originalVal) {
  isEditingFamilyName = false;
  updateHeaderAndProfile();
  const btnEl = document.getElementById('btn-edit-family-name');
  if (btnEl) {
    btnEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    `;
    btnEl.title = "Edit Family Name";
  }
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
  const password = document.getElementById('register-password').value;
  const familyMode = document.querySelector('input[name="family-mode"]:checked').value;
  
  const submitButton = document.querySelector('#register-form button');
  submitButton.innerText = 'Registering...';
  submitButton.disabled = true;
  
  let credential = null;
  try {
    // 1. Create the Firebase Auth account first (this automatically signs the user in)
    credential = await auth.createUserWithEmailAndPassword(email, password);
    const user = credential.user;
    
    const userProfileData = {
      name,
      email,
      color: PALETTE_COLORS[0], // Default placeholder, will be updated if joining
      families: [],
      settings: {
        weekStart: 'sunday',
        language: 'en',
        theme: 'dark'
      }
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
      let inviteCode = document.getElementById('family-code-input').value.trim().toUpperCase();
      if (inviteCode && !inviteCode.startsWith('FAM-')) {
        inviteCode = 'FAM-' + inviteCode;
      }
      const fSnap = await dbFirestore.collection("families").where("inviteCode", "==", inviteCode).get();
      if (fSnap.empty) {
        // Invite code is invalid! Delete the newly created auth account
        await user.delete();
        throw new Error("Invalid invitation code. Registration cancelled.");
      }
      
      const familyDoc = fSnap.docs[0];
      const familyId = familyDoc.id;
      const familyData = familyDoc.data();
      
      // Auto-assign unique color for joining user
      const assignedColor = await getUnusedColorForFamily(familyId, familyData.members || []);
      userProfileData.color = assignedColor;
      
      const updatedMembers = [...(familyData.members || []), user.uid];
      await dbFirestore.collection("families").doc(familyId).update({ members: updatedMembers });
      
      userProfileData.families.push(familyId);
    }
    
    await dbFirestore.collection("users").doc(user.uid).set(userProfileData);
    showToast('Account registered successfully!');
    
  } catch (err) {
    showToast(err.message, 'error');
    // If registration failed for another reason, delete the auth user if it was created
    if (credential && credential.user) {
      try {
        await credential.user.delete();
      } catch (cleanUpErr) {
        console.error("Cleanup user failed:", cleanUpErr);
      }
    }
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

let isGoogleSigningIn = false;
async function handleGoogleSignIn() {
  if (isGoogleSigningIn) return;
  isGoogleSigningIn = true;
  
  const googleBtns = document.querySelectorAll('.btn-google');
  googleBtns.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  });
  
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    showToast('Signing in with Google...');
  } catch (err) {
    console.error("Google sign in failed:", err);
    // Ignore user-closed popup errors to keep the interface clean
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      showToast(err.message, 'error');
    }
  } finally {
    isGoogleSigningIn = false;
    googleBtns.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
  }
}



async function handleDeleteAccount() {
  if (!currentUser || !userProfile) return;
  
  const confirmation = confirm(t('confirm_delete_account'));
  
  if (!confirmation) return;
  
  const deleteBtn = document.getElementById('btn-delete-account');
  const originalText = deleteBtn.innerHTML;
  deleteBtn.innerText = 'Deleting account...';
  deleteBtn.disabled = true;
  
  // For security reasons, check if the user has signed in recently before making database changes
  const lastSignInTime = currentUser.metadata.lastSignInTime ? new Date(currentUser.metadata.lastSignInTime).getTime() : 0;
  const now = Date.now();
  if (now - lastSignInTime > 5 * 60 * 1000) {
    showToast('For security reasons, deleting your account requires a recent login. Please log out, log back in, and try again.', 'error');
    deleteBtn.innerHTML = originalText;
    deleteBtn.disabled = false;
    return;
  }
  
  try {
    const uid = currentUser.uid;
    const joinedFamilies = [...(userProfile.families || [])];
    
    // 1. Delete events created by the user if only relevant to them, and update if relevant to others
    if (joinedFamilies.length > 0) {
      const eventsSnap = await dbFirestore.collection("events")
        .where("familyId", "in", joinedFamilies)
        .get();
        
      const batch = dbFirestore.batch();
      eventsSnap.forEach(doc => {
        const eventData = doc.data();
        if (eventData.createdBy === uid) {
          const otherRelevant = (eventData.relevantTo || []).filter(id => id !== uid);
          if (otherRelevant.length > 0) {
            // Keep the event since it's relevant to others, just remove the deleting user from relevantTo
            batch.update(doc.ref, { relevantTo: otherRelevant });
          } else {
            // Delete the event since it's only relevant to the deleting user
            batch.delete(doc.ref);
          }
        } else if (Array.isArray(eventData.relevantTo) && eventData.relevantTo.includes(uid)) {
          const updatedRelevant = eventData.relevantTo.filter(id => id !== uid);
          batch.update(doc.ref, { relevantTo: updatedRelevant });
        }
      });
      await batch.commit();
    }
    
    // 2. Remove user UID from families (DO THIS SECOND)
    for (const familyId of joinedFamilies) {
      const familyRef = dbFirestore.collection("families").doc(familyId);
      const doc = await familyRef.get();
      if (doc.exists) {
        const familyData = doc.data();
        const updatedMembers = (familyData.members || []).filter(m => m !== uid);
        
        if (updatedMembers.length === 0) {
          // If no members are left in this family group, we can delete the family document
          await familyRef.delete();
        } else {
          await familyRef.update({ members: updatedMembers });
        }
      }
    }
    
    // 3. Delete user profile document
    await dbFirestore.collection("users").doc(uid).delete();
    
    // 4. Delete Auth user account
    await currentUser.delete();
    
    showToast('Your account has been permanently deleted.');
    
  } catch (err) {
    console.error("Account deletion failed:", err);
    if (err.code === 'auth/requires-recent-login') {
      showToast('For security reasons, deleting your account requires a recent login. Please log out, log back in, and try again.', 'error');
    } else {
      showToast('Error deleting account: ' + err.message, 'error');
    }
    // Re-enable delete button
    deleteBtn.innerHTML = originalText;
    deleteBtn.disabled = false;
  }
}

// ================= PASSWORD RESET FLOW =================

function showForgotPassword(e) {
  if (e) e.preventDefault();
  document.getElementById('forgot-modal').classList.add('active');
  document.body.classList.add('modal-open');
  document.getElementById('forgot-verify-form').style.display = 'block';
  document.getElementById('forgot-reset-form').style.display = 'none';
  document.getElementById('forgot-verify-form').reset();
}

function closeForgotPassword() {
  document.getElementById('forgot-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
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
  
  // Toggle header elements based on active view to maximize space
  const headerCalNav = document.getElementById('header-calendar-nav');
  const headerTodayBtn = document.getElementById('header-btn-today');
  const headerFamilyBadge = document.getElementById('header-family-badge');
  const headerCalModes = document.querySelector('.header-actions .calendar-modes');
  
  if (view === 'calendar') {
    if (headerCalNav) headerCalNav.style.display = ''; // let CSS display rule apply
    if (headerTodayBtn) headerTodayBtn.style.display = ''; // let CSS display rule apply
    if (headerFamilyBadge) {
      headerFamilyBadge.style.setProperty('display', 'none', 'important');
    }
    if (headerCalModes) {
      headerCalModes.style.display = ''; // let CSS media query display rules apply
    }
  } else {
    if (headerCalNav) headerCalNav.style.setProperty('display', 'none', 'important');
    if (headerTodayBtn) headerTodayBtn.style.setProperty('display', 'none', 'important');
    if (headerFamilyBadge) {
      headerFamilyBadge.style.display = userFamilies.length > 0 ? 'block' : 'none';
    }
    if (headerCalModes) {
      headerCalModes.style.setProperty('display', 'none', 'important');
    }
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
    
    const badgeText = m.isChild ? t('child_no_account') : m.email;
    div.innerHTML = `
      <div class="member-info-col">
        <div class="member-color-indicator"></div>
        <span class="member-name">${m.name} ${isMe ? t('you') : ''}</span>
      </div>
      <div class="member-badge">${badgeText}</div>
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

async function handleAddChildMember(e) {
  e.preventDefault();
  const name = document.getElementById('new-member-name').value.trim();
  if (!name) return;
  
  const submitButton = document.querySelector('#add-member-form button');
  submitButton.innerText = t('adding');
  submitButton.disabled = true;
  
  // Auto-assign unique color that is not taken by any active family member
  const takenColors = new Set(familyMembers.map(m => m.color.toLowerCase()));
  let color = PALETTE_COLORS[0];
  for (const c of PALETTE_COLORS) {
    if (!takenColors.has(c.toLowerCase())) {
      color = c;
      break;
    }
  }
  
  const childId = 'child_' + generateUUID();
  
  try {
    // Create virtual child profile document in Firestore
    await dbFirestore.collection("users").doc(childId).set({
      name,
      email: "", // Child has no email
      color,
      families: [activeFamilyId],
      isChild: true,
      parentUid: currentUser.uid
    });
    
    // Add childId to the family's member array
    const updatedMembers = [...(currentFamily.members || []), childId];
    await dbFirestore.collection("families").doc(activeFamilyId).update({ members: updatedMembers });
    
    showToast(`${name} added to family!`);
    document.getElementById('add-member-form').reset();
  } catch (err) {
    console.error("Failed to add child member:", err);
    showToast("Error: " + err.message, 'error');
  } finally {
    submitButton.innerText = t('add_to_group');
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

function getEventColor(evt) {
  if (Array.isArray(evt.relevantTo) && evt.relevantTo.length === 1) {
    const memberId = evt.relevantTo[0];
    const member = familyMembers.find(m => m.id === memberId);
    if (member && member.color) {
      return member.color;
    }
  }
  const creator = familyMembers.find(m => m.id === evt.createdBy);
  return creator ? creator.color : 'var(--accent-primary)';
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
  
  const monthKeys = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const titleText = `${t(monthKeys[month])} ${year}`;
  const calTitle = document.getElementById('calendar-title');
  if (calTitle) calTitle.innerText = titleText;
  
  const weekStart = userProfile?.settings?.weekStart || 'sunday';
  
  // Render weekday headers dynamically
  const headerContainer = document.getElementById('month-days-header');
  if (headerContainer) {
    headerContainer.innerHTML = '';
    const dayKeys = (weekStart === 'monday') 
      ? ['monday_short', 'tuesday_short', 'wednesday_short', 'thursday_short', 'friday_short', 'saturday_short', 'sunday_short']
      : ['sunday_short', 'monday_short', 'tuesday_short', 'wednesday_short', 'thursday_short', 'friday_short', 'saturday_short'];
    
    dayKeys.forEach(k => {
      const div = document.createElement('div');
      div.innerText = t(k);
      headerContainer.appendChild(div);
    });
  }

  let firstDayIndex = new Date(year, month, 1).getDay();
  if (weekStart === 'monday') {
    firstDayIndex = (firstDayIndex + 6) % 7;
  }
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
  
  const totalCellsNeeded = (firstDayIndex + totalDays <= 35) ? 35 : 42;
  const nextMonthPadding = totalCellsNeeded - cells.length;
  for (let i = 1; i <= nextMonthPadding; i++) {
    const d = new Date(year, month + 1, i);
    cells.push({
      date: d,
      isCurrentMonth: false,
      dayNum: i
    });
  }
  
  const todayStr = formatDateLocal(new Date());
  
  cells.forEach(cell => {
    const cellDateStr = formatDateLocal(cell.date);
    const isToday = cellDateStr === todayStr;
    const isSelected = cellDateStr === selectedDay;
    
    const div = document.createElement('div');
    div.className = `month-day ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
    
    div.onclick = () => selectDayInMonth(cellDateStr);
    
    const dayEvents = getFilteredEventsForDate(cellDateStr);
    
    let dotsHtml = '';
    dayEvents.slice(0, 4).forEach(evt => {
      const color = getEventColor(evt);
      dotsHtml += `<span class="event-dot" style="--event-color: ${color}"></span>`;
    });
    if (dayEvents.length > 4) {
      dotsHtml += `<span class="event-dot" style="--event-color: #ffffff; opacity: 0.8"></span>`;
    }
    
    // Create text pills for desktop view
    let pillsHtml = '';
    dayEvents.slice(0, 3).forEach(evt => {
      const color = getEventColor(evt);
      const shortTime = formatShortTime(evt.startTime);
      const isAllDay = isEventAllDay(evt);
      
      const depDate = evt.category === 'flight' ? (evt.flightDepDate || evt.date) : evt.date;
      const retDate = evt.category === 'flight' ? evt.flightRetDate : evt.endDate;
      const isFirstDay = cellDateStr === depDate;
      
      const dayOfWeek = cell.date.getDay();
      const isFirstDayOfWeek = (weekStart === 'sunday' && dayOfWeek === 0) || (weekStart === 'monday' && dayOfWeek === 1);
      const isLastDayOfWeek = (weekStart === 'sunday' && dayOfWeek === 6) || (weekStart === 'monday' && dayOfWeek === 0);
      
      const displayTitle = !isAllDay || isFirstDay || isFirstDayOfWeek;
      
      const connectLeft = isAllDay && cellDateStr > depDate && !isFirstDayOfWeek;
      const connectRight = isAllDay && retDate && cellDateStr < retDate && !isLastDayOfWeek;
      const connClass = (connectLeft ? ' connect-left' : '') + (connectRight ? ' connect-right' : '');
      
      pillsHtml += `
        <div class="month-event-pill ${isAllDay ? 'all-day' : ''}${connClass}" style="--event-color: ${color}" title="${escapeHtml(evt.title)}">
          ${!isAllDay ? `<span class="pill-time">${shortTime}</span>` : ''}
          <span class="pill-title">${displayTitle ? escapeHtml(evt.title) : '&nbsp;'}</span>
        </div>
      `;
    });
    if (dayEvents.length > 3) {
      pillsHtml += `<div class="month-event-more">${t('more_events', dayEvents.length - 3)}</div>`;
    }
    
    div.innerHTML = `
      <div class="day-header-row">
        <span class="day-number">${cell.dayNum}</span>
      </div>
      <div class="day-events-indicator">${dotsHtml}</div>
      <div class="day-events-pills">${pillsHtml}</div>
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
  
  const lang = userProfile?.settings?.language || 'en';
  const locale = lang === 'he' ? 'he-IL' : (lang === 'de' ? 'de-DE' : 'en-US');
  const dateObj = new Date(selectedDay);
  const weekday = dateObj.toLocaleDateString(locale, { weekday: 'long' });
  const dateFormatted = `${weekday}, ${formatDateDMY(selectedDay)}`;
  
  const dayEvents = getFilteredEventsForDate(selectedDay);
  
  let eventsListHtml = '';
  if (dayEvents.length === 0) {
    eventsListHtml = `<p class="empty-day-message">${t('no_events_today')}</p>`;
  } else {
    dayEvents.forEach(evt => {
      const color = getEventColor(evt);
      const isAllDay = isEventAllDay(evt);
      
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
        <div class="event-card ${isAllDay ? 'all-day' : ''}" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
          <div class="event-info">
            <div class="event-title-text">${escapeHtml(evt.title)}</div>
            ${!isAllDay ? `
            <div class="event-time-text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${evt.startTime} - ${evt.endTime}</span>
            </div>
            ` : ''}
          </div>
          <div class="event-avatars">${avatarsHtml}</div>
        </div>
      `;
    });
  }
  
  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin-bottom: 0;">${t('agenda_prefix')} ${dateFormatted}</h3>
      <button class="btn btn-outline btn-sm" onclick="openEventModalForDate('${selectedDay}')">
        <span>+ ${t('add_btn_text')}</span>
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
  const weekStart = userProfile?.settings?.weekStart || 'sunday';
  let diff = anchor.getDate() - anchor.getDay();
  if (weekStart === 'monday') {
    const day = anchor.getDay();
    diff = anchor.getDate() - (day === 0 ? 6 : day - 1);
  }
  const startDay = new Date(anchor.setDate(diff));
  
  const endOfWeek = new Date(startDay);
  endOfWeek.setDate(startDay.getDate() + 6);
  
  const lang = userProfile?.settings?.language || 'en';
  const locale = lang === 'he' ? 'he-IL' : (lang === 'de' ? 'de-DE' : 'en-US');
  const titleText = `${formatDateDMY(formatDateLocal(startDay))} - ${formatDateDMY(formatDateLocal(endOfWeek))}`;
  const calTitle = document.getElementById('calendar-title');
  if (calTitle) calTitle.innerText = titleText;
  
  const todayStr = formatDateLocal(new Date());
  
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(startDay);
    dayDate.setDate(startDay.getDate() + i);
    const dayDateStr = formatDateLocal(dayDate);
    const isToday = dayDateStr === todayStr;
    
    const dayOfWeekIndex = dayDate.getDay();
    const dayKeys = ['sunday_short', 'monday_short', 'tuesday_short', 'wednesday_short', 'thursday_short', 'friday_short', 'saturday_short'];
    const dayName = t(dayKeys[dayOfWeekIndex]);
    const dayNum = dayDate.getDate();
    
    const dayRow = document.createElement('div');
    dayRow.className = 'week-day-row';
    
    const dayEvents = getFilteredEventsForDate(dayDateStr);
    
    let eventsHtml = '';
    if (dayEvents.length === 0) {
      eventsHtml = `<p class="empty-day-message">${t('no_events_scheduled')}</p>`;
    } else {
      dayEvents.forEach(evt => {
        const color = getEventColor(evt);
        const isAllDay = isEventAllDay(evt);
        
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
          <div class="event-card ${isAllDay ? 'all-day' : ''}" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
            <div class="event-info">
              <div class="event-title-text">${escapeHtml(evt.title)}</div>
              ${!isAllDay ? `
              <div class="event-time-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>${evt.startTime} - ${evt.endTime}</span>
              </div>
              ` : ''}
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
    const isFlight = evt.category === 'flight';
    const depDate = isFlight ? (evt.flightDepDate || evt.date) : evt.date;
    const retDate = isFlight ? evt.flightRetDate : evt.endDate;
    
    if (retDate) {
      if (dateStr < depDate || dateStr > retDate) return false;
    } else {
      if (dateStr !== depDate) return false;
    }
    
    const creatorMatches = activeFilters.includes(evt.createdBy);
    const relevantMatch = Array.isArray(evt.relevantTo) && 
      evt.relevantTo.some(uid => activeFilters.includes(uid));
      
    return creatorMatches || relevantMatch;
  }).sort((a, b) => {
    const isAAllDay = isEventAllDay(a);
    const isBAllDay = isEventAllDay(b);
    if (isAAllDay && !isBAllDay) return -1;
    if (!isAAllDay && isBAllDay) return 1;
    
    if (isAAllDay && isBAllDay) {
      const catOrder = { 'flight': 1, 'school_vacation': 2, 'family_vacation': 3, 'regular': 4 };
      const orderA = catOrder[a.category] || 99;
      const orderB = catOrder[b.category] || 99;
      if (orderA !== orderB) return orderA - orderB;
    }
    
    const timeA = a.startTime || '';
    const timeB = b.startTime || '';
    return timeA.localeCompare(timeB);
  });
}

// ================= EVENT CREATION / EDITING FORM =================

function toggleFlightFields(category) {
  const flightFields = document.getElementById('flight-fields');
  const standardFields = document.getElementById('standard-fields');
  if (!flightFields) return;
  
  const titleInput = document.getElementById('event-title');
  const dateInput = document.getElementById('event-date');
  const startTimeInput = document.getElementById('event-start-time');
  const endTimeInput = document.getElementById('event-end-time');
  const eventTimeRow = document.getElementById('event-time-row');
  
  const flightDepDateInput = document.getElementById('flight-dep-date');
  const flightDepTakeoffInput = document.getElementById('flight-dep-takeoff');
  
  if (category === 'flight') {
    flightFields.style.display = 'block';
    if (standardFields) standardFields.style.display = 'none';
    
    // Auto-fill departure date & takeoff from standard date/time inputs if they are empty
    if (dateInput && dateInput.value && flightDepDateInput && !flightDepDateInput.value) {
      flightDepDateInput.value = dateInput.value;
    }
    if (startTimeInput && startTimeInput.value && flightDepTakeoffInput && !flightDepTakeoffInput.value) {
      flightDepTakeoffInput.value = startTimeInput.value;
    }
    
    // Prevent HTML5 validation errors on hidden fields by removing required
    if (titleInput) titleInput.removeAttribute('required');
    if (dateInput) dateInput.removeAttribute('required');
    if (startTimeInput) startTimeInput.removeAttribute('required');
    if (endTimeInput) endTimeInput.removeAttribute('required');
    
    // Add required to essential flight fields
    if (flightDepDateInput) flightDepDateInput.setAttribute('required', 'required');
    if (flightDepTakeoffInput) flightDepTakeoffInput.setAttribute('required', 'required');
  } else {
    flightFields.style.display = 'none';
    if (standardFields) standardFields.style.display = 'block';
    
    // Restore required attributes to title and start date
    if (titleInput) titleInput.setAttribute('required', 'required');
    if (dateInput) dateInput.setAttribute('required', 'required');
    
    // Remove required from flight fields
    if (flightDepDateInput) flightDepDateInput.removeAttribute('required');
    if (flightDepTakeoffInput) flightDepTakeoffInput.removeAttribute('required');
    
    if (category === 'school_vacation' || category === 'family_vacation') {
      // Hide times row and remove required attributes
      if (eventTimeRow) eventTimeRow.style.display = 'none';
      if (startTimeInput) startTimeInput.removeAttribute('required');
      if (endTimeInput) endTimeInput.removeAttribute('required');
    } else {
      // Regular event: show times row and restore required attributes
      if (eventTimeRow) eventTimeRow.style.display = 'flex';
      if (startTimeInput) startTimeInput.setAttribute('required', 'required');
      if (endTimeInput) endTimeInput.setAttribute('required', 'required');
    }
    
    // Clear flight inputs when hidden
    const fields = [
      'flight-dep-date', 'flight-dep-takeoff', 'flight-dep-landing',
      'flight-ret-date', 'flight-ret-takeoff', 'flight-ret-landing',
      'flight-passengers', 'flight-destination', 'flight-booking-ref'
    ];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }
}

function openEventModalForDate(dateStr) {
  openEventModal();
  document.getElementById('event-date').value = formatDateDMY(dateStr);
  document.getElementById('event-end-date').value = formatDateDMY(dateStr);
}

function openEventModal(eventToEdit = null) {
  const modal = document.getElementById('event-modal');
  const form = document.getElementById('event-form');
  const actionTitle = document.getElementById('modal-event-title-action');
  const btnDelete = document.getElementById('btn-delete-event');
  
  form.reset();
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  
  // Reset border colors for date inputs
  ['event-date', 'event-end-date', 'flight-dep-date', 'flight-ret-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
  });
  
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
    actionTitle.innerText = t('edit_event');
    btnDelete.style.display = 'block';
    
    document.getElementById('event-form-id').value = eventToEdit.id;
    document.getElementById('event-title').value = eventToEdit.title;
    document.getElementById('event-date').value = formatDateDMY(eventToEdit.date);
    document.getElementById('event-end-date').value = formatDateDMY(eventToEdit.endDate || eventToEdit.date);
    document.getElementById('event-start-time').value = eventToEdit.startTime || '';
    document.getElementById('event-end-time').value = eventToEdit.endTime || '';
    document.getElementById('event-category').value = eventToEdit.category;
    document.getElementById('event-description').value = eventToEdit.description || '';
    
    toggleFlightFields(eventToEdit.category);
    if (eventToEdit.category === 'flight') {
      document.getElementById('flight-dep-date').value = formatDateDMY(eventToEdit.flightDepDate);
      document.getElementById('flight-dep-takeoff').value = eventToEdit.flightDepTakeoff || '';
      document.getElementById('flight-dep-landing').value = eventToEdit.flightDepLanding || '';
      document.getElementById('flight-ret-date').value = formatDateDMY(eventToEdit.flightRetDate);
      document.getElementById('flight-ret-takeoff').value = eventToEdit.flightRetTakeoff || '';
      document.getElementById('flight-ret-landing').value = eventToEdit.flightRetLanding || '';
      document.getElementById('flight-passengers').value = eventToEdit.flightPassengers || '';
      document.getElementById('flight-destination').value = eventToEdit.flightDestination || '';
      document.getElementById('flight-booking-ref').value = eventToEdit.flightBookingRef || '';
    }
  } else {
    actionTitle.innerText = t('new_event');
    btnDelete.style.display = 'none';
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-date').value = formatDateDMY(selectedDay);
    document.getElementById('event-end-date').value = formatDateDMY(selectedDay);
    
    const now = new Date();
    const currentHourStr = String(now.getHours()).padStart(2, '0') + ':00';
    const nextHourStr = String((now.getHours() + 1) % 24).padStart(2, '0') + ':00';
    
    document.getElementById('event-start-time').value = currentHourStr;
    document.getElementById('event-end-time').value = nextHourStr;
    
    toggleFlightFields('regular');
  }
}

function closeEventModal() {
  document.getElementById('event-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
}

async function handleEventSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('event-form-id').value;
  const category = document.getElementById('event-category').value;
  
  let title = '';
  let date = '';
  let endDate = '';
  let startTime = '';
  let endTime = '';
  let description = '';
  let relevantTo = [];
  
  if (category === 'flight') {
    const destination = document.getElementById('flight-destination').value;
    title = destination || t('cat_flight');
    
    // Flight specific payload overrides
    date = parseDMYtoYMD(document.getElementById('flight-dep-date').value);
    startTime = document.getElementById('flight-dep-takeoff').value;
    endTime = document.getElementById('flight-dep-landing').value || startTime;
    description = '';
    
    const checkedBoxes = document.querySelectorAll('input[name="event-relevant-member"]:checked');
    relevantTo = Array.from(checkedBoxes).map(box => box.value);
    
    if (relevantTo.length === 0) {
      showToast('Select at least one family member for this event.', 'error');
      return;
    }
  } else {
    title = document.getElementById('event-title').value;
    date = parseDMYtoYMD(document.getElementById('event-date').value);
    endDate = parseDMYtoYMD(document.getElementById('event-end-date').value);
    if (!endDate) endDate = date;
    
    if (category === 'school_vacation' || category === 'family_vacation') {
      startTime = '';
      endTime = '';
    } else {
      startTime = document.getElementById('event-start-time').value;
      endTime = document.getElementById('event-end-time').value;
    }
    
    description = document.getElementById('event-description').value;
    
    const checkedBoxes = document.querySelectorAll('input[name="event-relevant-member"]:checked');
    relevantTo = Array.from(checkedBoxes).map(box => box.value);
    
    if (relevantTo.length === 0) {
      showToast('Select at least one family member for this event.', 'error');
      return;
    }
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
  
  if (category === 'flight') {
    eventPayload.flightDepDate = parseDMYtoYMD(document.getElementById('flight-dep-date').value);
    eventPayload.flightDepTakeoff = document.getElementById('flight-dep-takeoff').value;
    eventPayload.flightDepLanding = document.getElementById('flight-dep-landing').value;
    eventPayload.flightRetDate = parseDMYtoYMD(document.getElementById('flight-ret-date').value);
    eventPayload.flightRetTakeoff = document.getElementById('flight-ret-takeoff').value;
    eventPayload.flightRetLanding = document.getElementById('flight-ret-landing').value;
    eventPayload.flightPassengers = document.getElementById('flight-passengers').value;
    eventPayload.flightDestination = document.getElementById('flight-destination').value;
    eventPayload.flightBookingRef = document.getElementById('flight-booking-ref').value;
    if (id) {
      eventPayload.endDate = firebase.firestore.FieldValue.delete();
    }
  } else {
    eventPayload.endDate = endDate;
    if (id) {
      eventPayload.flightDepDate = firebase.firestore.FieldValue.delete();
      eventPayload.flightDepTakeoff = firebase.firestore.FieldValue.delete();
      eventPayload.flightDepLanding = firebase.firestore.FieldValue.delete();
      eventPayload.flightRetDate = firebase.firestore.FieldValue.delete();
      eventPayload.flightRetTakeoff = firebase.firestore.FieldValue.delete();
      eventPayload.flightRetLanding = firebase.firestore.FieldValue.delete();
      eventPayload.flightPassengers = firebase.firestore.FieldValue.delete();
      eventPayload.flightDestination = firebase.firestore.FieldValue.delete();
      eventPayload.flightBookingRef = firebase.firestore.FieldValue.delete();
    }
  }
  
  const submitButton = document.querySelector('#event-form button[type="submit"]');
  submitButton.innerText = t('saving');
  submitButton.disabled = true;
  
  try {
    if (id) {
      const originalEvent = events.find(e => e.id === id);
      if (originalEvent && !canEditEvent(originalEvent)) {
        showToast("You do not have permission to edit this event.", "error");
        submitButton.innerText = t('save_event');
        submitButton.disabled = false;
        return;
      }
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
    submitButton.innerText = t('save_event');
    submitButton.disabled = false;
  }
}

async function handleDeleteEvent() {
  const id = document.getElementById('event-form-id').value;
  if (!id) return;
  
  const originalEvent = events.find(e => e.id === id);
  if (originalEvent && !canEditEvent(originalEvent)) {
    showToast("You do not have permission to delete this event.", "error");
    return;
  }
  
  if (!confirm(t('confirm_delete_event'))) return;
  
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

function canEditEvent(event) {
  if (!currentUser) return false;
  const uid = currentUser.uid;
  const isCreator = event.createdBy === uid;
  const isRelevant = Array.isArray(event.relevantTo) && event.relevantTo.includes(uid);
  return isCreator || isRelevant;
}

function openDetailsModal(eventId) {
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  
  selectedEvent = event;
  const modal = document.getElementById('details-modal');
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  
  const categoryBadge = document.getElementById('details-category-badge');
  const categoriesMap = {
    regular: t('cat_regular'),
    school_vacation: t('cat_school_vacation'),
    family_vacation: t('cat_family_vacation'),
    flight: t('cat_flight')
  };
  categoryBadge.innerText = categoriesMap[event.category] || t('cat_regular');
  
  // Render flight details boarding pass if the event is a flight
  const detailsFlightInfo = document.getElementById('details-flight-info');
  if (detailsFlightInfo) {
    if (event.category === 'flight') {
      detailsFlightInfo.style.display = 'block';
      document.getElementById('details-flight-booking-ref').innerText = event.flightBookingRef || 'N/A';
      document.getElementById('details-flight-destination').innerText = event.flightDestination || 'N/A';
      document.getElementById('details-flight-passengers').innerText = event.flightPassengers || 'N/A';
      
      document.getElementById('details-flight-dep-date').innerText = event.flightDepDate ? formatDateDMY(event.flightDepDate) : 'N/A';
      document.getElementById('details-flight-dep-takeoff').innerText = event.flightDepTakeoff || '--:--';
      document.getElementById('details-flight-dep-landing').innerText = event.flightDepLanding || '--:--';
      
      const returnContainer = document.getElementById('details-flight-ret-container');
      if (returnContainer) {
        if (event.flightRetDate) {
          returnContainer.style.display = 'block';
          document.getElementById('details-flight-ret-date').innerText = formatDateDMY(event.flightRetDate);
          document.getElementById('details-flight-ret-takeoff').innerText = event.flightRetTakeoff || '--:--';
          document.getElementById('details-flight-ret-landing').innerText = event.flightRetLanding || '--:--';
        } else {
          returnContainer.style.display = 'none';
        }
      }
    } else {
      detailsFlightInfo.style.display = 'none';
    }
  }
  
  document.getElementById('details-title').innerText = event.title;
  const descBox = document.getElementById('details-desc-box');
  const descText = document.getElementById('details-description');
  if (event.description && event.description.trim()) {
    descText.innerText = event.description;
    descBox.style.display = 'block';
  } else {
    descBox.style.display = 'none';
  }
  
  const lang = userProfile?.settings?.language || 'en';
  const locale = lang === 'he' ? 'he-IL' : (lang === 'de' ? 'de-DE' : 'en-US');
  
  const isAllDay = isEventAllDay(event);
  const depDate = event.category === 'flight' ? (event.flightDepDate || event.date) : event.date;
  const retDate = event.category === 'flight' ? event.flightRetDate : event.endDate;
  
  let dateText = '';
  if (retDate && retDate !== depDate) {
    dateText = `${formatDateDMY(depDate)} - ${formatDateDMY(retDate)}`;
  } else {
    const dateObj = new Date(depDate);
    const weekday = dateObj.toLocaleDateString(locale, { weekday: 'long' });
    dateText = `${weekday}, ${formatDateDMY(depDate)}`;
  }
  document.getElementById('details-date-text').innerText = dateText;
  
  const timeTextEl = document.getElementById('details-time-text');
  if (timeTextEl) {
    if (isAllDay) {
      timeTextEl.style.display = 'none';
    } else {
      timeTextEl.style.display = 'block';
      timeTextEl.innerText = `${event.startTime} - ${event.endTime}`;
    }
  }
  
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
  
  // Enforce editing permissions
  const editBtnContainer = document.querySelector('.details-actions');
  if (editBtnContainer) {
    if (canEditEvent(event)) {
      editBtnContainer.style.display = 'flex';
    } else {
      editBtnContainer.style.display = 'none';
    }
  }
}

function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
  selectedEvent = null;
}

function editEventFromDetails() {
  if (!selectedEvent) return;
  if (!canEditEvent(selectedEvent)) {
    showToast("You do not have permission to edit this event.", "error");
    return;
  }
  const eventToEdit = { ...selectedEvent };
  closeDetailsModal();
  openEventModal(eventToEdit);
}

// Hub actions for joining/creating family groups
async function handleCreateFamilyFromHub(e) {
  e.preventDefault();
  const name = e.target.querySelector('input').value;
  
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
    localStorage.setItem('syncup_active_family_id', activeFamilyId);
    
    e.target.reset();
    
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleJoinFamilyFromHub(e) {
  e.preventDefault();
  let inviteCode = e.target.querySelector('input').value.trim().toUpperCase();
  if (inviteCode && !inviteCode.startsWith('FAM-')) {
    inviteCode = 'FAM-' + inviteCode;
  }
  
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
    
    // Find unique color in the family they are joining
    const newColor = await getUnusedColorForFamily(familyId, familyData.members || []);
    
    // Update family members
    const updatedMembers = [...(familyData.members || []), currentUser.uid];
    await dbFirestore.collection("families").doc(familyId).update({ members: updatedMembers });
    
    // Update user profile with the new unique color
    const updatedFamilies = [...(userProfile.families || []), familyId];
    await dbFirestore.collection("users").doc(currentUser.uid).update({ 
      families: updatedFamilies,
      color: newColor
    });
    
    userProfile.color = newColor; // Keep local state in sync
    
    showToast('Successfully joined the group!');
    
    // Set as active family
    activeFamilyId = familyId;
    localStorage.setItem('syncup_active_family_id', activeFamilyId);
    
    e.target.reset();
    
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Close modal when tapping on dark overlay
function closeModalOnOverlayClick(e) {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
    document.body.classList.remove('modal-open');
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

// Password toggle helper
function togglePasswordVisibility(inputId, buttonEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (input.type === 'password') {
    input.type = 'text';
    buttonEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    `;
  } else {
    input.type = 'password';
    buttonEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    `;
  }
}

function formatShortTime(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hour = parseInt(parts[0], 10);
  let minutes = parts[1];
  if (minutes === '00') {
    return String(hour);
  }
  return `${hour}:${minutes}`;
}

// ================= SWIPE GESTURE DETECTION (MOBILE) =================
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function setupSwipeGestures() {
  const monthlyGrid = document.getElementById('monthly-grid');
  const weeklyGrid = document.getElementById('weekly-grid');
  
  const bindGrid = (gridEl) => {
    if (!gridEl) return;
    
    gridEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    
    gridEl.addEventListener('touchmove', (e) => {
      if (touchStartX === 0 && touchStartY === 0) return;
      if (e.touches.length !== 1) return;
      
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const diffX = curX - touchStartX;
      const diffY = curY - touchStartY;
      
      // Prevent browser default scroll only for horizontal swipes (view toggling)
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
    
    gridEl.addEventListener('touchend', (e) => {
      if (touchStartX === 0 && touchStartY === 0) return;
      if (e.changedTouches.length !== 1) return;
      
      touchEndX = e.changedTouches[0].clientX;
      touchEndY = e.changedTouches[0].clientY;
      
      handleSwipeGesture();
      
      touchStartX = 0;
      touchStartY = 0;
    }, { passive: true });
  };
  
  bindGrid(monthlyGrid);
  bindGrid(weeklyGrid);
}

function handleSwipeGesture() {
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  const threshold = 50; // threshold for a swipe in px
  
  if (Math.abs(diffX) > Math.abs(diffY)) {
    // Horizontal swipe -> Mode switch (Month / Week)
    if (Math.abs(diffX) > threshold) {
      if (diffX > 0) {
        // Swipe Right -> Switch to Month view
        if (calendarMode !== 'month') {
          setCalendarMode('month');
          showToast('Switched to Month view', 'info');
        }
      } else {
        // Swipe Left -> Switch to Week view
        if (calendarMode !== 'week') {
          setCalendarMode('week');
          showToast('Switched to Week view', 'info');
        }
      }
    }
  }
}
