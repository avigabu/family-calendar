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
  if (evt.category === 'regular') {
    if (evt.endDate && evt.endDate !== evt.date) {
      return true;
    }
    if (!evt.startTime && !evt.endTime) {
      return true;
    }
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
    visible_to: "Relevant for:",
    edit_event: "Edit Event",
    everyone: "Everyone",
    everyone_initials: "ALL",
    share_link: "Share Link",
    share_app: "Share the App",
    share_app_desc: "Share a link to this calendar application with others.",
    add_member_btn: "Add Child",
    cancel: "Cancel",
    role_parent: "Parent",
    role_child: "Child",
    role_member: "Member",
    confirm_join_family_via_link: "You have been invited to join the '{familyName}' family group. Would you like to join now?",
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
    flight_to: "Flight to",
    passengers: "passengers",
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
    flight_booking_ref_placeholder: "Booking code",
    google_sync_title: "Google Calendar Sync",
    google_sync_desc: "Automatically sync your events with Google Calendar.",
    google_status_disconnected: "Not Connected",
    google_status_connected: "Connected",
    google_btn_connect: "Connect",
    google_btn_disconnect: "Disconnect",
    google_status_loading: "Checking...",
    parent_privacy_label: "Visibility of my events",
    parent_privacy_desc: "Determine if non-parents can see events relevant only to me.",
    parent_privacy_show: "Show to non-parents",
    parent_privacy_hide: "Hide from non-parents",
    event_recurrence: "Repeat",
    recurrence_none: "None",
    recurrence_daily: "Daily",
    recurrence_weekly: "Weekly",
    recurrence_monthly: "Monthly",
    recurrence_yearly: "Yearly",
    recurrence_count: "Occurrences",
    confirm_edit_series: "This event is part of a recurring series. Do you want to apply changes to the entire series?",
    confirm_delete_series: "This event is part of a recurring series. Do you want to delete the entire series?",
    yes: "Yes",
    only_this_event: "This event only"
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
    visible_to: "Relevant für:",
    edit_event: "Termin bearbeiten",
    everyone: "Alle",
    everyone_initials: "ALL",
    share_link: "Link teilen",
    share_app: "App teilen",
    share_app_desc: "Teilen Sie einen Link zu dieser Kalenderanwendung mit anderen.",
    add_member_btn: "Kind hinzufügen",
    cancel: "Abbrechen",
    role_parent: "Elternteil",
    role_child: "Kind",
    role_member: "Mitglied",
    confirm_join_family_via_link: "Sie wurden eingeladen, der Familiengruppe '{familyName}' beizutreten. Möchten Sie jetzt beitreten?",
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
    flight_to: "Flug nach",
    passengers: "Passagiere",
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
    flight_booking_ref_placeholder: "Buchungscode",
    google_sync_title: "Google Kalender Synchronisation",
    google_sync_desc: "Synchronisieren Sie Ihre Termine automatisch mit Google Kalender.",
    google_status_disconnected: "Nicht verbunden",
    google_status_connected: "Verbunden",
    google_btn_connect: "Verbinden",
    google_btn_disconnect: "Trennen",
    google_status_loading: "Wird geprüft...",
    parent_privacy_label: "Sichtbarkeit meiner Termine",
    parent_privacy_desc: "Festlegen, ob Nicht-Eltern Termine sehen können, die nur für mich relevant sind.",
    parent_privacy_show: "Nicht-Eltern anzeigen",
    parent_privacy_hide: "Vor Nicht-Eltern verbergen",
    event_recurrence: "Wiederholung",
    recurrence_none: "Keine",
    recurrence_daily: "Täglich",
    recurrence_weekly: "Wöchentlich",
    recurrence_monthly: "Monatlich",
    recurrence_yearly: "Jährlich",
    recurrence_count: "Wiederholungen",
    confirm_edit_series: "Dieses Ereignis ist Teil einer wiederkehrenden Serie. Möchten Sie die Änderungen auf die gesamte Serie anwenden?",
    confirm_delete_series: "Dieses Ereignis ist Teil einer wiederkehrenden Serie. Möchten Sie die gesamte Serie löschen?",
    yes: "Ja",
    only_this_event: "Nur dieses Ereignis"
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
    visible_to: "רלוונטי עבור:",
    edit_event: "ערוך אירוע",
    everyone: "כולם",
    everyone_initials: "כולם",
    share_link: "שתף קישור",
    share_app: "שתף את האפליקציה",
    share_app_desc: "שתף קישור לאפליקציית לוח השנה הזו עם אחרים.",
    add_member_btn: "הוסף ילד",
    cancel: "ביטול",
    role_parent: "הורה",
    role_child: "ילד",
    role_member: "חבר",
    confirm_join_family_via_link: "הוזמנת להצטרף לקבוצה המשפחתית '{familyName}'. האם ברצונך להצטרף כעת?",
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
    flight_to: "טיסה ל",
    passengers: "נוסעים",
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
    flight_booking_ref_placeholder: "קוד הזמנה",
    google_sync_title: "סנכרון לוח שנה של גוגל",
    google_sync_desc: "סנכרן את האירועים שלך באופן אוטומטי עם לוח השנה של גוגל.",
    google_status_disconnected: "לא מחובר",
    google_status_connected: "מחובר",
    google_btn_connect: "התחברות",
    google_btn_disconnect: "התנתקות",
    google_status_loading: "בודק...",
    parent_privacy_label: "נראות האירועים שלי",
    parent_privacy_desc: "קבע האם משתמשים שאינם הורים יוכלו לראות אירועים הרלוונטיים רק לי.",
    parent_privacy_show: "הצג למי שאינו הורה",
    parent_privacy_hide: "הסתר ממי שאינו הורה",
    event_recurrence: "חזרה",
    recurrence_none: "ללא",
    recurrence_daily: "יומי",
    recurrence_weekly: "שבועי",
    recurrence_monthly: "חודשי",
    recurrence_yearly: "שנתי",
    recurrence_count: "מספר חזרות",
    confirm_edit_series: "אירוע זה הוא חלק מסדרה חוזרת. האם ברצונך להחיל את השינויים על כל הסדרה?",
    confirm_delete_series: "אירוע זה הוא חלק מסדרה חוזרת. האם ברצונך למחוק את כל הסדרה?",
    yes: "כן",
    only_this_event: "אירוע זה בלבד"
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

  // 2.5 Parent privacy settings select
  const parentPrivacyItem = document.getElementById('settings-parent-privacy-item');
  if (parentPrivacyItem) {
    const isCurrentParent = isUserParent(currentUser?.uid);
    if (isCurrentParent) {
      parentPrivacyItem.style.display = 'flex';
      const selectPrivacy = document.getElementById('settings-parent-privacy');
      if (selectPrivacy) {
        const sharePrivateEvents = settings.sharePrivateEvents !== false;
        selectPrivacy.value = sharePrivateEvents ? 'true' : 'false';
      }
    } else {
      parentPrivacyItem.style.display = 'none';
    }
  }
  
  // 3. Apply translations
  applyLanguageUI();

  // 4. Update Google Sync UI
  updateGoogleSyncUI();
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
let familyUnsubscribe = null;
let userProfileUnsubscribe = null;

// ================= INITIALIZATION & AUTH =================

document.addEventListener('DOMContentLoaded', () => {
  setupSwipeGestures();
  setupDateInputs();
  checkGoogleSyncUrlParams();
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
  
  // Make clicking anywhere on the input open the native calendar picker
  inputEl.addEventListener('click', () => {
    try {
      if (typeof inputEl.showPicker === 'function') {
        inputEl.showPicker();
      }
    } catch (err) {
      console.warn("showPicker failed:", err);
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
  if (familyUnsubscribe) { familyUnsubscribe(); familyUnsubscribe = null; }
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
      
    const tempFamilies = [];
    snap.forEach(doc => {
      tempFamilies.push({ id: doc.id, ...doc.data() });
    });
    userFamilies = tempFamilies;
    
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
    
    // Refresh Google Sync UI target dropdown with loaded families
    updateGoogleSyncUI();

    // Check for pending onboarding
    if (sessionStorage.getItem("pending_google_sync_onboarding") === "true") {
      sessionStorage.removeItem("pending_google_sync_onboarding");
      openGoogleOnboarding();
    }

    // Check for pending invite code
    checkAndApplyPendingInvite();
  } catch (err) {
    console.error("Failed to load families:", err);
    showToast("Error loading families: " + err.message, "error");
  }
}

async function checkAndApplyPendingInvite() {
  if (!currentUser) return;
  const pendingInvite = localStorage.getItem('pendingInviteCode');
  if (!pendingInvite) return;

  // Clear it immediately to avoid infinite confirm loops
  localStorage.removeItem('pendingInviteCode');

  try {
    const fSnap = await dbFirestore.collection("families")
      .where("inviteCode", "==", pendingInvite)
      .get();

    if (fSnap.empty) {
      showToast("The invite link is invalid or has expired.", "error");
      return;
    }

    const familyDoc = fSnap.docs[0];
    const familyId = familyDoc.id;
    const familyData = familyDoc.data();
    const familyName = familyData.name;

    // Check if user is already in this family
    if (familyData.members && familyData.members.includes(currentUser.uid)) {
      if (activeFamilyId !== familyId) {
        await switchActiveFamily(familyId);
      }
      showToast(`You are already a member of the ${familyName} group.`, "info");
      return;
    }

    // Ask user for confirmation to join the group
    const confirmMsg = t('confirm_join_family_via_link').replace('{familyName}', familyName);
    if (confirm(confirmMsg)) {
      // Create a mock event object for handleJoinFamilyFromHub
      const mockEvent = {
        preventDefault: () => {},
        target: {
          reset: () => {},
          querySelector: () => ({ value: pendingInvite })
        }
      };
      await handleJoinFamilyFromHub(mockEvent);
    }
  } catch (err) {
    console.error("Failed to apply pending invite link:", err);
    showToast("Error joining group via link: " + err.message, "error");
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
  updateGoogleSyncUI();
  showToast(`Switched to ${currentFamily.name}`);
}

function setupActiveFamilyListeners() {
  if (eventsUnsubscribe) eventsUnsubscribe();
  if (membersUnsubscribe) membersUnsubscribe();
  if (familyUnsubscribe) familyUnsubscribe();
  
  if (!activeFamilyId) return;
  
  familyUnsubscribe = dbFirestore.collection("families").doc(activeFamilyId)
    .onSnapshot(doc => {
      if (doc.exists) {
        currentFamily = { id: doc.id, ...doc.data() };
        const idx = userFamilies.findIndex(f => f.id === activeFamilyId);
        if (idx !== -1) {
          userFamilies[idx] = currentFamily;
        }
        updateFamilySwitcherUI();
        updateGoogleSyncUI();
        renderFamilyHub();
      }
    }, err => {
      console.error("Family document sync failed:", err);
    });
  
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
      updateHeaderAndProfile();
      applyUserSettings();
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
        members: [user.uid],
        parents: [user.uid]
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
          const updatedParents = (familyData.parents || []).filter(p => p !== uid);
          await familyRef.update({ 
            members: updatedMembers,
            parents: updatedParents
          });
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
  pushModalState();
  document.getElementById('forgot-verify-form').style.display = 'block';
  document.getElementById('forgot-reset-form').style.display = 'none';
  document.getElementById('forgot-verify-form').reset();
}

function closeForgotPassword() {
  document.getElementById('forgot-modal').classList.remove('active');
  document.body.classList.remove('modal-open');
  popModalState();
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
    const isChild = m.isChild === true;
    const isParent = Array.isArray(currentFamily.parents) && currentFamily.parents.includes(m.id);
    
    // Bootstrap rule: if no parents are defined in the group yet, any adult member is treated as a parent.
    const parentsList = currentFamily.parents || [];
    const hasAnyParent = parentsList.some(pId => familyMembers.some(member => member.id === pId && !member.isChild));
    const amIParent = !hasAnyParent ? !isChild : parentsList.includes(currentUser.uid);
    
    let roleBadge = '';
    if (isChild) {
      roleBadge = `<span class="member-role-badge child">${t('role_child')}</span>`;
    } else if (isParent) {
      if (amIParent && m.id !== currentUser.uid) {
        roleBadge = `<span class="member-role-badge parent clickable" onclick="toggleParentRole('${m.id}', false)">${t('role_parent')}</span>`;
      } else {
        roleBadge = `<span class="member-role-badge parent">${t('role_parent')}</span>`;
      }
    } else {
      if (amIParent) {
        roleBadge = `<span class="member-role-badge member clickable" onclick="toggleParentRole('${m.id}', true)">${t('role_member')}</span>`;
      } else {
        roleBadge = `<span class="member-role-badge member">${t('role_member')}</span>`;
      }
    }
    
    const initials = m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const emailText = m.isChild ? '' : `<span class="member-email-sub">${m.email}</span>`;
    div.innerHTML = `
      <div class="member-info-col">
        <div class="member-avatar" style="background-color: ${m.color};">${initials}</div>
        <div class="member-details-box">
          <span class="member-name">${m.name} ${isMe ? t('you') : ''}</span>
          ${emailText}
        </div>
      </div>
      <div class="member-badges-row">
        ${roleBadge}
      </div>
    `;
    list.appendChild(div);
  });
}

async function toggleParentRole(memberId, makeParent) {
  if (!currentFamily || !currentUser || !activeFamilyId) return;
  
  const parentsList = currentFamily.parents || [];
  const hasAnyParent = parentsList.some(pId => familyMembers.some(member => member.id === pId && !member.isChild));
  const isUserChild = familyMembers.some(member => member.id === currentUser.uid && member.isChild);
  const amIParent = !hasAnyParent ? !isUserChild : parentsList.includes(currentUser.uid);
  
  if (!amIParent) {
    showToast('You do not have permission to update member roles.', 'error');
    return;
  }
  
  let updatedParents = [...parentsList];
  
  if (makeParent) {
    if (!updatedParents.includes(memberId)) {
      updatedParents.push(memberId);
    }
  } else {
    // Prevent removing the last parent
    const parentAdults = updatedParents.filter(pId => familyMembers.some(member => member.id === pId && !member.isChild));
    if (parentAdults.length <= 1 && updatedParents.includes(memberId)) {
      showToast('Cannot remove the last parent from the group.', 'error');
      return;
    }
    updatedParents = updatedParents.filter(id => id !== memberId);
  }
  
  try {
    await dbFirestore.collection("families").doc(activeFamilyId).update({
      parents: updatedParents
    });
    showToast('Member role updated!');
  } catch (err) {
    console.error("Failed to update member role:", err);
    showToast('Failed to update role: ' + err.message, 'error');
  }
}

function copyInviteCode() {
  const inviteCode = document.getElementById('family-invite-code').innerText;
  navigator.clipboard.writeText(inviteCode).then(() => {
    showToast('Invite code copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy. Invite code: ' + inviteCode, 'error');
  });
}

function shareInviteLink() {
  if (!currentFamily) return;
  const inviteCode = currentFamily.inviteCode;
  const inviteUrl = `${window.location.origin}/?invite=${inviteCode}`;
  const shareData = {
    title: 'SyncUp Family Calendar',
    text: `Join our family calendar group on SyncUp! Click this link:`,
    url: inviteUrl
  };

  if (navigator.share) {
    navigator.share(shareData)
      .then(() => showToast('Shared successfully!'))
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Web Share failed:", err);
          copyTextToClipboard(inviteUrl);
        }
      });
  } else {
    copyTextToClipboard(inviteUrl);
  }
}

function shareAppUrl() {
  const shareData = {
    title: 'SyncUp Family Calendar',
    text: 'Check out SyncUp - Secure Family Calendar!',
    url: window.location.origin
  };

  if (navigator.share) {
    navigator.share(shareData)
      .then(() => showToast('Shared successfully!'))
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error("Web Share failed:", err);
          copyTextToClipboard(window.location.origin);
        }
      });
  } else {
    copyTextToClipboard(window.location.origin);
  }
}

function toggleAddMemberForm() {
  const container = document.getElementById('add-member-collapsible');
  if (container) {
    const isHidden = container.style.display === 'none' || container.style.display === '';
    container.style.display = isHidden ? 'block' : 'none';
    
    // Focus the input if it's shown
    if (isHidden) {
      setTimeout(() => {
        const input = document.getElementById('new-member-name');
        if (input) input.focus();
      }, 50);
    }
  }
}

function copyTextToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Invite link copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy link. Link: ' + text, 'error');
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
    
    // Collapse the form upon success
    const container = document.getElementById('add-member-collapsible');
    if (container) {
      container.style.display = 'none';
    }
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
  const isFamily = Array.isArray(evt.relevantTo) && (evt.relevantTo.includes("all") || evt.relevantTo.length > 1);
  
  if (isFamily) {
    if (evt.category === 'school_vacation') {
      return 'var(--vacation-school)';
    }
    if (evt.category === 'family_vacation') {
      return 'var(--vacation-family)';
    }
    return 'var(--accent-primary)'; // Default family color
  }

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

function getEventDisplayTitle(evt) {
  if (evt.category === 'flight') {
    const dest = evt.flightDestination || evt.title || '';
    // Strip default fallback values (like 'Flight ✈️') if they match standard translations
    let cleanDest = dest;
    const fallbacks = ['Flight ✈️', 'Flug ✈️', 'טיסה ✈️', t('cat_flight')];
    if (fallbacks.includes(cleanDest)) {
      cleanDest = '';
    }
    
    const pax = evt.flightPassengers;
    let title = '✈️';
    if (cleanDest) {
      title += ` ${cleanDest}`;
    }
    if (pax) {
      title += cleanDest ? `, ${pax}` : ` ${pax}`;
    }
    return title;
  }
  return evt.title;
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
  
  // Group cells into week rows (7 cells each) for vertical slot consistency
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  
  weeks.forEach(weekDays => {
    // 1. Gather and sort all unique events overlapping this week row
    const weekEventsMap = {};
    weekDays.forEach(cell => {
      const cellDateStr = formatDateLocal(cell.date);
      const dayEvents = getFilteredEventsForDate(cellDateStr);
      dayEvents.forEach(evt => {
        weekEventsMap[evt.id] = evt;
      });
    });
    
    // Sort week events prioritizing all-day events and durations
    const weekEvents = Object.values(weekEventsMap).sort((a, b) => {
      const isAAllDay = isEventAllDay(a);
      const isBAllDay = isEventAllDay(b);
      if (isAAllDay && !isBAllDay) return -1;
      if (!isAAllDay && isBAllDay) return 1;
      
      const durA = getEventDuration(a);
      const durB = getEventDuration(b);
      if (durA !== durB) return durB - durA;
      
      if (isAAllDay && isBAllDay) {
        const catOrder = { 'flight': 1, 'school_vacation': 2, 'family_vacation': 3, 'regular': 4 };
        const orderA = catOrder[a.category] || 99;
        const orderB = catOrder[b.category] || 99;
        if (orderA !== orderB) return orderA - orderB;
      }
      
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
    
    // Helper to calculate event duration in days
    function getEventDuration(evt) {
      const isFlight = evt.category === 'flight';
      const depDate = isFlight ? (evt.flightDepDate || evt.date) : evt.date;
      const retDate = isFlight ? evt.flightRetDate : evt.endDate;
      if (!retDate || retDate < depDate) return 1;
      const ms = new Date(retDate).getTime() - new Date(depDate).getTime();
      return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
    }
    
    // 2. Assign consistent vertical slot indices (0, 1, 2) or 99 (pushed to +more indicator)
    const daySlots = Array.from({ length: 7 }, () => new Set());
    weekEvents.forEach(evt => {
      const activeDayIndices = [];
      weekDays.forEach((cell, idx) => {
        const cellDateStr = formatDateLocal(cell.date);
        const isFlight = evt.category === 'flight';
        const depDate = isFlight ? (evt.flightDepDate || evt.date) : evt.date;
        const retDate = isFlight ? evt.flightRetDate : evt.endDate;
        let overlaps = false;
        if (retDate && retDate >= depDate) {
          overlaps = (cellDateStr >= depDate && cellDateStr <= retDate);
        } else {
          overlaps = (cellDateStr === depDate);
        }
        if (overlaps) {
          activeDayIndices.push(idx);
        }
      });
      
      let assignedSlot = 99;
      for (let slot = 0; slot < 5; slot++) {
        const isSlotFree = activeDayIndices.every(dayIdx => !daySlots[dayIdx].has(slot));
        if (isSlotFree) {
          assignedSlot = slot;
          break;
        }
      }
      if (assignedSlot !== 99) {
        activeDayIndices.forEach(dayIdx => {
          daySlots[dayIdx].add(assignedSlot);
        });
      }
      evt.assignedWeekSlot = assignedSlot;
    });
    
    // 3. Render each cell in this week row
    weekDays.forEach((cell, cellIdx) => {
      const cellDateStr = formatDateLocal(cell.date);
      const isToday = cellDateStr === todayStr;
      const isSelected = cellDateStr === selectedDay;
      
      const div = document.createElement('div');
      div.className = `month-day ${cell.isCurrentMonth ? '' : 'other-month'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
      div.onclick = () => selectDayInMonth(cellDateStr);
      
      const dayEvents = getFilteredEventsForDate(cellDateStr);
      
      // Dots for mobile/collapsed view
      let dotsHtml = '';
      dayEvents.slice(0, 4).forEach(evt => {
        const color = getEventColor(evt);
        dotsHtml += `<span class="event-dot" style="--event-color: ${color}"></span>`;
      });
      if (dayEvents.length > 4) {
        dotsHtml += `<span class="event-dot" style="--event-color: #ffffff; opacity: 0.8"></span>`;
      }
      
      // Populate slots (0 to 4)
      const slots = [null, null, null, null, null];
      dayEvents.forEach(evt => {
        if (evt.assignedWeekSlot >= 0 && evt.assignedWeekSlot < 5) {
          slots[evt.assignedWeekSlot] = evt;
        }
      });
      
      const moreEvents = dayEvents.filter(evt => evt.assignedWeekSlot === 99);
      
      // Generate pills HTML with vertical slot placeholders
      let pillsHtml = '';
      for (let slotIdx = 0; slotIdx < 5; slotIdx++) {
        const evt = slots[slotIdx];
        if (evt) {
          const color = getEventColor(evt);
          const shortTime = formatShortTime(evt.startTime);
          const isAllDay = isEventAllDay(evt);
          
          const depDate = evt.category === 'flight' ? (evt.flightDepDate || evt.date) : evt.date;
          const retDate = evt.category === 'flight' ? evt.flightRetDate : evt.endDate;
          
          // Determine the first day in this week row where this event is active
          let firstActiveDayIdx = -1;
          for (let idx = 0; idx < 7; idx++) {
            const dStr = formatDateLocal(weekDays[idx].date);
            let overlaps = false;
            if (retDate && retDate >= depDate) {
              overlaps = (dStr >= depDate && dStr <= retDate);
            } else {
              overlaps = (dStr === depDate);
            }
            if (overlaps) {
              firstActiveDayIdx = idx;
              break;
            }
          }
          
          const isSpanStartInWeek = (cellIdx === firstActiveDayIdx);
          
          if (isAllDay) {
            if (isSpanStartInWeek) {
              let daysLeftInWeek = 7 - cellIdx;
              const cellTime = new Date(cellDateStr).getTime();
              const retTime = new Date(retDate || cellDateStr).getTime();
              const msPerDay = 24 * 60 * 60 * 1000;
              const daysOfEventLeft = Math.round((retTime - cellTime) / msPerDay) + 1;
              
              const spanDays = Math.min(daysLeftInWeek, daysOfEventLeft);
              let inlineStyle = `--event-color: ${color};`;
              if (!isNaN(spanDays) && spanDays > 1) {
                inlineStyle += ` width: calc(${spanDays} * 100% + ${(spanDays - 1) * 2} * var(--day-padding) + ${spanDays - 1}px) !important; z-index: 2;`;
              }
              
              pillsHtml += `
                <div class="month-event-pill all-day" style="${inlineStyle}" title="${escapeHtml(getEventDisplayTitle(evt))}">
                  <span class="pill-title">${escapeHtml(getEventDisplayTitle(evt))}</span>
                </div>
              `;
            } else {
              // Reserve height in subsequent columns to align remaining event slots
              pillsHtml += `
                <div class="month-event-pill all-day placeholder-span" style="visibility: hidden; pointer-events: none;">&nbsp;</div>
              `;
            }
          } else {
            // Regular timed event
            pillsHtml += `
              <div class="month-event-pill" style="--event-color: ${color}" title="${escapeHtml(getEventDisplayTitle(evt))}">
                <span class="pill-time">${shortTime}</span>
                <span class="pill-title">${escapeHtml(getEventDisplayTitle(evt))}</span>
              </div>
            `;
          }
        } else {
          // Empty slot placeholder to maintain grid alignment
          pillsHtml += `
            <div class="month-event-pill placeholder-empty" style="visibility: hidden; pointer-events: none;">&nbsp;</div>
          `;
        }
      }
      
      if (moreEvents.length > 0) {
        pillsHtml += `<div class="month-event-more">${t('more_events', moreEvents.length)}</div>`;
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
  panel.style.marginTop = '8px';
  
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
        if (evt.relevantTo.includes("all")) {
          avatarsHtml += `<span class="mini-avatar everyone-avatar" style="--avatar-color: var(--accent-primary)" title="${t('everyone')}">${t('everyone_initials')}</span>`;
        } else {
          evt.relevantTo.forEach(uid => {
            const user = familyMembers.find(m => m.id === uid);
            if (user) {
              const initials = user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
              avatarsHtml += `<span class="mini-avatar" style="--avatar-color: ${user.color}" title="${user.name}">${initials}</span>`;
            }
          });
        }
      }
      
      eventsListHtml += `
        <div class="event-card ${isAllDay ? 'all-day' : ''}" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
          <div class="event-info">
            <div class="event-title-text">${escapeHtml(getEventDisplayTitle(evt))}</div>
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
    <h3 style="margin-bottom: 8px; font-size: 13px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${t('agenda_prefix')} ${dateFormatted}</h3>
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
          if (evt.relevantTo.includes("all")) {
            avatarsHtml += `<span class="mini-avatar everyone-avatar" style="--avatar-color: var(--accent-primary)" title="${t('everyone')}">${t('everyone_initials')}</span>`;
          } else {
            evt.relevantTo.forEach(uid => {
              const user = familyMembers.find(m => m.id === uid);
              if (user) {
                const initials = user.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
                avatarsHtml += `<span class="mini-avatar" style="--avatar-color: ${user.color}" title="${user.name}">${initials}</span>`;
              }
            });
          }
        }
        
        eventsHtml += `
          <div class="event-card ${isAllDay ? 'all-day' : ''}" style="--event-color: ${color}" onclick="openDetailsModal('${evt.id}')">
            <div class="event-info">
              <div class="event-title-text">${escapeHtml(getEventDisplayTitle(evt))}</div>
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

function isUserParent(userId) {
  if (!currentFamily) return false;
  const parentsList = currentFamily.parents || [];
  if (familyMembers.length === 0) {
    return parentsList.includes(userId);
  }
  const hasAnyParent = parentsList.some(pId => familyMembers.some(member => member.id === pId && !member.isChild));
  const member = familyMembers.find(m => m.id === userId);
  const isChild = member ? member.isChild === true : false;
  return !hasAnyParent ? !isChild : parentsList.includes(userId);
}

function canViewEvent(event) {
  if (!currentUser || !currentFamily) return false;
  
  const isCurrentParent = isUserParent(currentUser.uid);
  
  if (!isCurrentParent) {
    if (Array.isArray(event.relevantTo) && event.relevantTo.length === 1) {
      const targetUid = event.relevantTo[0];
      if (isUserParent(targetUid)) {
        const parentMember = familyMembers.find(m => m.id === targetUid);
        if (parentMember && parentMember.settings?.sharePrivateEvents === false) {
          return false;
        }
      }
    }
  }
  
  return true;
}

function getFilteredEventsForDate(dateStr) {
  return events.filter(evt => {
    if (!canViewEvent(evt)) return false;
    const isFlight = evt.category === 'flight';
    const depDate = isFlight ? (evt.flightDepDate || evt.date) : evt.date;
    const retDate = isFlight ? evt.flightRetDate : evt.endDate;
    
    if (retDate && retDate >= depDate) {
      if (dateStr < depDate || dateStr > retDate) return false;
    } else {
      if (dateStr !== depDate) return false;
    }
    
    const creatorMatches = activeFilters.includes(evt.createdBy);
    const relevantMatch = Array.isArray(evt.relevantTo) && 
      (evt.relevantTo.includes("all") || evt.relevantTo.some(uid => activeFilters.includes(uid)));
      
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

  // Auto-default relevancy to "Everyone" when creating new flights/holidays/vacations
  const formIdEl = document.getElementById('event-form-id');
  const id = formIdEl ? formIdEl.value : '';
  if (!id) {
    const everyoneCheckbox = document.getElementById('relevancy-everyone-checkbox');
    if (everyoneCheckbox) {
      if (category === 'flight' || category === 'school_vacation' || category === 'family_vacation') {
        everyoneCheckbox.checked = true;
        const checkboxes = document.querySelectorAll('.event-relevant-member-checkbox');
        checkboxes.forEach(cb => {
          cb.checked = true;
          cb.disabled = true;
        });
      } else {
        everyoneCheckbox.checked = false;
        const checkboxes = document.querySelectorAll('.event-relevant-member-checkbox');
        checkboxes.forEach(cb => {
          cb.disabled = false;
          cb.checked = currentUser && cb.value === currentUser.uid;
        });
      }
    }
  }
}

function toggleRecurrenceFields(value) {
  const wrapper = document.getElementById('recurrence-count-wrapper');
  if (wrapper) {
    wrapper.style.display = value && value !== 'none' ? 'block' : 'none';
  }
}

function getOccurrenceDates(startDateStr, endDateStr, recurrence, count) {
  const dates = [];
  
  const parseYMD = (ymdStr) => {
    if (!ymdStr) return new Date();
    const parts = ymdStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  };
  
  const start = parseYMD(startDateStr);
  const end = parseYMD(endDateStr || startDateStr);
  
  const msPerDay = 24 * 60 * 60 * 1000;
  const durationDays = Math.round((end.getTime() - start.getTime()) / msPerDay);
  
  for (let i = 0; i < count; i++) {
    const nextStart = new Date(start);
    if (recurrence === 'daily') {
      nextStart.setDate(start.getDate() + i);
    } else if (recurrence === 'weekly') {
      nextStart.setDate(start.getDate() + i * 7);
    } else if (recurrence === 'monthly') {
      nextStart.setMonth(start.getMonth() + i);
    } else if (recurrence === 'yearly') {
      nextStart.setFullYear(start.getFullYear() + i);
    }
    
    const nextEnd = new Date(nextStart);
    nextEnd.setDate(nextStart.getDate() + durationDays);
    
    dates.push({
      date: formatDateLocal(nextStart),
      endDate: formatDateLocal(nextEnd)
    });
  }
  return dates;
}

function showCustomConfirm(title, message, okText, cancelText) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const btnCancel = document.getElementById('btn-confirm-cancel');
    const btnOk = document.getElementById('btn-confirm-ok');
    
    if (!modal || !titleEl || !msgEl || !btnCancel || !btnOk) {
      resolve(confirm(message));
      return;
    }
    
    titleEl.innerText = title;
    msgEl.innerText = message;
    btnCancel.innerText = cancelText;
    btnOk.innerText = okText;
    
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('active');
    }, 10);
    
    btnCancel.onclick = () => {
      modal.classList.remove('active');
      setTimeout(() => { modal.style.display = 'none'; }, 200);
      resolve(false);
    };
    
    btnOk.onclick = () => {
      modal.classList.remove('active');
      setTimeout(() => { modal.style.display = 'none'; }, 200);
      resolve(true);
    };
  });
}

function openEventModalForDate(dateStr) {
  openEventModal();
  document.getElementById('event-date').value = dateStr;
  document.getElementById('event-end-date').value = dateStr;
}

function openEventModal(eventToEdit = null) {
  const modal = document.getElementById('event-modal');
  const form = document.getElementById('event-form');
  const actionTitle = document.getElementById('modal-event-title-action');
  const btnDelete = document.getElementById('btn-delete-event');
  
  form.reset();
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  pushModalState();
  
  // Reset border colors for date inputs
  ['event-date', 'event-end-date', 'flight-dep-date', 'flight-ret-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.borderColor = '';
  });
  
  const relevancyList = document.getElementById('event-relevancy-list');
  relevancyList.innerHTML = '';
  
  const isEveryoneChecked = eventToEdit ? (Array.isArray(eventToEdit.relevantTo) && eventToEdit.relevantTo.includes('all')) : false;
  
  // 1. Add "Everyone" checkbox
  const everyoneWrapper = document.createElement('label');
  everyoneWrapper.className = 'relevancy-checkbox-wrapper everyone-option';
  everyoneWrapper.innerHTML = `
    <input type="checkbox" id="relevancy-everyone-checkbox" value="all" ${isEveryoneChecked ? 'checked' : ''}>
    <span class="checkbox-label-text">
      <span class="checkbox-dot" style="--member-color: var(--accent-primary)"></span>
      <span style="font-weight: 700;">${t('everyone')}</span>
    </span>
  `;
  relevancyList.appendChild(everyoneWrapper);
  
  // 2. Add individual member checkboxes
  familyMembers.forEach(member => {
    const wrapper = document.createElement('label');
    wrapper.className = 'relevancy-checkbox-wrapper member-option';
    
    let isChecked = false;
    if (eventToEdit) {
      isChecked = isEveryoneChecked || (Array.isArray(eventToEdit.relevantTo) && eventToEdit.relevantTo.includes(member.id));
    } else {
      isChecked = currentUser && member.id === currentUser.uid;
    }
    
    wrapper.innerHTML = `
      <input type="checkbox" name="event-relevant-member" class="event-relevant-member-checkbox" value="${member.id}" ${isChecked ? 'checked' : ''} ${isEveryoneChecked ? 'disabled' : ''}>
      <span class="checkbox-label-text">
        <span class="checkbox-dot" style="--member-color: ${member.color}"></span>
        <span>${member.name}</span>
      </span>
    `;
    relevancyList.appendChild(wrapper);
  });
  
  // Add toggle listener
  const everyoneCheckbox = document.getElementById('relevancy-everyone-checkbox');
  if (everyoneCheckbox) {
    everyoneCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const checkboxes = document.querySelectorAll('.event-relevant-member-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
        cb.disabled = isChecked;
      });
    });
  }
  
  if (eventToEdit) {
    actionTitle.innerText = t('edit_event');
    btnDelete.style.display = 'block';
    
    const recRow = document.getElementById('event-recurrence-row');
    if (recRow) recRow.style.display = 'none';
    
    document.getElementById('event-form-id').value = eventToEdit.id;
    document.getElementById('event-title').value = eventToEdit.title;
    document.getElementById('event-date').value = eventToEdit.date || '';
    document.getElementById('event-end-date').value = eventToEdit.endDate || eventToEdit.date || '';
    document.getElementById('event-start-time').value = eventToEdit.startTime || '';
    document.getElementById('event-end-time').value = eventToEdit.endTime || '';
    document.getElementById('event-category').value = eventToEdit.category;
    document.getElementById('event-description').value = eventToEdit.description || '';
    
    toggleFlightFields(eventToEdit.category);
    if (eventToEdit.category === 'flight') {
      document.getElementById('flight-dep-date').value = eventToEdit.flightDepDate || '';
      document.getElementById('flight-dep-takeoff').value = eventToEdit.flightDepTakeoff || '';
      document.getElementById('flight-dep-landing').value = eventToEdit.flightDepLanding || '';
      document.getElementById('flight-ret-date').value = eventToEdit.flightRetDate || '';
      document.getElementById('flight-ret-takeoff').value = eventToEdit.flightRetTakeoff || '';
      document.getElementById('flight-ret-landing').value = eventToEdit.flightRetLanding || '';
      document.getElementById('flight-passengers').value = eventToEdit.flightPassengers || '';
      document.getElementById('flight-destination').value = eventToEdit.flightDestination || '';
      document.getElementById('flight-booking-ref').value = eventToEdit.flightBookingRef || '';
    }
  } else {
    actionTitle.innerText = t('new_event');
    btnDelete.style.display = 'none';
    
    const recRow = document.getElementById('event-recurrence-row');
    if (recRow) recRow.style.display = 'flex';
    const recSelect = document.getElementById('event-recurrence');
    if (recSelect) recSelect.value = 'none';
    toggleRecurrenceFields('none');
    
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-date').value = selectedDay;
    document.getElementById('event-end-date').value = selectedDay;
    
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
  popModalState();
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
    date = document.getElementById('flight-dep-date').value;
    startTime = document.getElementById('flight-dep-takeoff').value;
    endTime = document.getElementById('flight-dep-landing').value || startTime;
    description = '';
    
    const flightRetDate = document.getElementById('flight-ret-date').value;
    if (flightRetDate && flightRetDate < date) {
      showToast('Return date cannot be before departure date.', 'error');
      return;
    }
    
    const everyoneCheckbox = document.getElementById('relevancy-everyone-checkbox');
    if (everyoneCheckbox && everyoneCheckbox.checked) {
      relevantTo = ["all"];
    } else {
      const checkedBoxes = document.querySelectorAll('.event-relevant-member-checkbox:checked');
      relevantTo = Array.from(checkedBoxes).map(box => box.value);
    }
    
    if (relevantTo.length === 0) {
      showToast('Select at least one family member for this event.', 'error');
      return;
    }
  } else {
    title = document.getElementById('event-title').value;
    date = document.getElementById('event-date').value;
    endDate = document.getElementById('event-end-date').value;
    if (!endDate) endDate = date;
    
    if (endDate && endDate < date) {
      showToast('End date cannot be before start date.', 'error');
      return;
    }
    
    if (category === 'school_vacation' || category === 'family_vacation') {
      startTime = '';
      endTime = '';
    } else {
      startTime = document.getElementById('event-start-time').value;
      endTime = document.getElementById('event-end-time').value;
    }
    
    description = document.getElementById('event-description').value;
    
    const everyoneCheckbox = document.getElementById('relevancy-everyone-checkbox');
    if (everyoneCheckbox && everyoneCheckbox.checked) {
      relevantTo = ["all"];
    } else {
      const checkedBoxes = document.querySelectorAll('.event-relevant-member-checkbox:checked');
      relevantTo = Array.from(checkedBoxes).map(box => box.value);
    }
    
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
    eventPayload.flightDepDate = document.getElementById('flight-dep-date').value;
    eventPayload.flightDepTakeoff = document.getElementById('flight-dep-takeoff').value;
    eventPayload.flightDepLanding = document.getElementById('flight-dep-landing').value;
    eventPayload.flightRetDate = document.getElementById('flight-ret-date').value;
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
      
      if (originalEvent && originalEvent.recurrenceId) {
        const editEntireSeries = await showCustomConfirm(t('event_recurrence'), t('confirm_edit_series'), t('yes'), t('only_this_event'));
        if (editEntireSeries) {
          const batch = dbFirestore.batch();
          const seriesEvents = events.filter(e => e.recurrenceId === originalEvent.recurrenceId);
          seriesEvents.forEach(e => {
            const seriesUpdate = {
              title: eventPayload.title,
              description: eventPayload.description,
              category: eventPayload.category,
              relevantTo: eventPayload.relevantTo,
              startTime: eventPayload.startTime,
              endTime: eventPayload.endTime
            };
            if (eventPayload.category === 'flight') {
              seriesUpdate.flightDepTakeoff = eventPayload.flightDepTakeoff || '';
              seriesUpdate.flightDepLanding = eventPayload.flightDepLanding || '';
              seriesUpdate.flightRetTakeoff = eventPayload.flightRetTakeoff || '';
              seriesUpdate.flightRetLanding = eventPayload.flightRetLanding || '';
              seriesUpdate.flightPassengers = eventPayload.flightPassengers || '';
              seriesUpdate.flightDestination = eventPayload.flightDestination || '';
              seriesUpdate.flightBookingRef = eventPayload.flightBookingRef || '';
            }
            batch.update(dbFirestore.collection("events").doc(e.id), seriesUpdate);
          });
          await batch.commit();
          showToast('Entire recurring series updated!');
        } else {
          await dbFirestore.collection("events").doc(id).update(eventPayload);
          showToast('Event updated successfully!');
        }
      } else {
        await dbFirestore.collection("events").doc(id).update(eventPayload);
        showToast('Event updated successfully!');
      }
    } else {
      const recSelect = document.getElementById('event-recurrence');
      const recurrence = recSelect ? recSelect.value : 'none';
      
      if (recurrence && recurrence !== 'none') {
        const countInput = document.getElementById('event-recurrence-count');
        const count = countInput ? parseInt(countInput.value, 10) : 10;
        const recurrenceId = 'rec_' + generateUUID();
        
        const occurrenceDates = getOccurrenceDates(date, endDate, recurrence, count);
        const batch = dbFirestore.batch();
        
        occurrenceDates.forEach((occ, idx) => {
          const occPayload = {
            ...eventPayload,
            recurrenceId,
            recurrenceIndex: idx,
            date: occ.date,
            endDate: occ.endDate
          };
          if (category === 'flight') {
            occPayload.flightDepDate = occ.date;
            occPayload.flightRetDate = occ.endDate;
          }
          const newDocRef = dbFirestore.collection("events").doc();
          batch.set(newDocRef, occPayload);
        });
        
        await batch.commit();
        showToast('Recurring event series scheduled!');
      } else {
        await dbFirestore.collection("events").add(eventPayload);
        showToast('Event scheduled!');
      }
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
  
  if (originalEvent && originalEvent.recurrenceId) {
    const deleteEntireSeries = await showCustomConfirm(t('event_recurrence'), t('confirm_delete_series'), t('yes'), t('only_this_event'));
    if (deleteEntireSeries) {
      try {
        const batch = dbFirestore.batch();
        const seriesEvents = events.filter(e => e.recurrenceId === originalEvent.recurrenceId);
        seriesEvents.forEach(e => {
          batch.delete(dbFirestore.collection("events").doc(e.id));
        });
        await batch.commit();
        showToast('Entire recurring series deleted!');
        closeEventModal();
        return;
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
    }
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
  
  if (event.category === 'flight' || event.category === 'school_vacation' || event.category === 'family_vacation') {
    const isParent = isUserParent(uid);
    return isCreator || isParent;
  }
  
  const isRelevant = Array.isArray(event.relevantTo) && event.relevantTo.includes(uid);
  return isCreator || isRelevant;
}

function openDetailsModal(eventId) {
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  
  if (!canViewEvent(event)) {
    showToast("You do not have permission to view this event.", "error");
    return;
  }
  
  selectedEvent = event;
  const modal = document.getElementById('details-modal');
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  pushModalState();
  
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
    if (event.relevantTo.includes("all")) {
      const span = document.createElement('span');
      span.className = 'member-tag-badge everyone-tag';
      span.style.setProperty('--member-color', 'var(--accent-primary)');
      span.innerHTML = `
        <span class="avatar-dot" style="background-color: var(--accent-primary)"></span>
        <span>${t('everyone')}</span>
      `;
      tagsContainer.appendChild(span);
    } else {
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
  popModalState();
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

async function deleteEventFromDetails() {
  if (!selectedEvent) return;
  if (!canEditEvent(selectedEvent)) {
    showToast("You do not have permission to delete this event.", "error");
    return;
  }
  
  if (selectedEvent.recurrenceId) {
    const deleteEntireSeries = await showCustomConfirm(t('event_recurrence'), t('confirm_delete_series'), t('yes'), t('only_this_event'));
    if (deleteEntireSeries) {
      try {
        const batch = dbFirestore.batch();
        const seriesEvents = events.filter(e => e.recurrenceId === selectedEvent.recurrenceId);
        seriesEvents.forEach(e => {
          batch.delete(dbFirestore.collection("events").doc(e.id));
        });
        await batch.commit();
        showToast('Entire recurring series deleted!');
        closeDetailsModal();
        return;
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
    }
  }
  
  if (!confirm(t('confirm_delete_event'))) return;
  
  try {
    await dbFirestore.collection("events").doc(selectedEvent.id).delete();
    showToast('Event deleted.');
    closeDetailsModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
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
      members: [currentUser.uid],
      parents: [currentUser.uid]
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
    popModalState();
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

// ================= PHONE BACK BUTTON MODAL CONTROL =================

let modalHistoryPushed = false;

function pushModalState() {
  if (!modalHistoryPushed) {
    modalHistoryPushed = true;
    history.pushState({ modalOpen: true }, '');
  }
}

function popModalState() {
  setTimeout(() => {
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0 && modalHistoryPushed) {
      modalHistoryPushed = false;
      history.back();
    }
  }, 50);
}

window.addEventListener('popstate', (event) => {
  const activeModals = document.querySelectorAll('.modal-overlay.active');
  if (activeModals.length > 0) {
    activeModals.forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
  }
  modalHistoryPushed = false;
});

// ================= GOOGLE CALENDAR SYNC FRONTEND HANDLERS =================

function getApiBaseUrl() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5001/kinship-14ac4/europe-west6/api";
  }
  return "/api";
}

function checkGoogleSyncUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const sync = urlParams.get("google_sync");
  const message = urlParams.get("message");
  const invite = urlParams.get("invite");

  if (invite) {
    localStorage.setItem("pendingInviteCode", invite);
    // Clean up URL to hide query parameter
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } else if (sync === "success") {
    sessionStorage.setItem("pending_google_sync_onboarding", "true");
    showToast(t("google_status_connected") + "!", "success");
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } else if (sync === "error") {
    showToast("Failed to connect Google Calendar: " + (message || ""), "error");
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

function updateGoogleSyncUI() {
  const dot = document.getElementById("google-sync-dot");
  const text = document.getElementById("google-sync-status-text");
  const btn = document.getElementById("btn-google-sync");
  const btnText = document.getElementById("google-sync-btn-text");
  const targetContainer = document.getElementById("google-sync-target-family-container");
  const targetSelect = document.getElementById("google-sync-target-family");

  if (!dot || !text || !btn || !btnText) return;

  const syncData = userProfile?.googleSync;
  if (syncData && syncData.connected) {
    dot.style.backgroundColor = "var(--success-color)";
    text.innerText = `${t("google_status_connected")} (${syncData.googleEmail})`;
    btn.className = "btn btn-danger-outline btn-sm";
    btnText.innerText = t("google_btn_disconnect");

    if (targetContainer && targetSelect) {
      targetContainer.style.display = "flex";
      targetSelect.innerHTML = "";
      
      if (userFamilies.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.innerText = "No families joined";
        opt.disabled = true;
        targetSelect.appendChild(opt);
      } else {
        userFamilies.forEach(f => {
          const opt = document.createElement("option");
          opt.value = f.id;
          opt.innerText = f.name;
          if (f.id === (syncData.targetFamilyId || activeFamilyId)) {
            opt.selected = true;
          }
          targetSelect.appendChild(opt);
        });

        // Initialize targetFamilyId in Firestore if not set yet
        if (!syncData.targetFamilyId && currentUser) {
          const defaultTarget = targetSelect.value || activeFamilyId;
          if (defaultTarget) {
            dbFirestore.collection("users").doc(currentUser.uid).update({
              "googleSync.targetFamilyId": defaultTarget
            }).catch(e => console.error("Failed to initialize targetFamilyId:", e));
          }
        }
      }
    }
  } else {
    dot.style.backgroundColor = "#6b7280";
    text.innerText = t("google_status_disconnected");
    btn.className = "btn btn-outline btn-sm";
    btnText.innerText = t("google_btn_connect");

    if (targetContainer) {
      targetContainer.style.display = "none";
    }
  }
}

async function handleTargetFamilyChange(e) {
  if (!currentUser) return;
  const targetFamilyId = e.target.value;
  if (!targetFamilyId) return;
  
  try {
    await dbFirestore.collection("users").doc(currentUser.uid).update({
      "googleSync.targetFamilyId": targetFamilyId
    });
    showToast('Google Sync group updated! Syncing events...', 'info');
    
    // Trigger sync immediately
    const res = await fetch(`${getApiBaseUrl()}/google/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userId: currentUser.uid })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Sync completed successfully!', 'success');
    } else {
      throw new Error(data.error || 'Failed to sync');
    }
  } catch (err) {
    console.error("Failed to update Google sync target:", err);
    showToast("Error: " + err.message, "error");
  }
}

async function handleGoogleSyncClick() {
  if (!currentUser) return;

  const btn = document.getElementById("btn-google-sync");
  const btnText = document.getElementById("google-sync-btn-text");
  const syncData = userProfile?.googleSync;

  if (syncData && syncData.connected) {
    if (!confirm("Are you sure you want to disconnect Google Calendar Sync?")) return;

    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = "Disconnecting...";

    try {
      const res = await fetch(`${getApiBaseUrl()}/google/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId: currentUser.uid })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Google Calendar disconnected.", "success");
      } else {
        throw new Error(data.error || "Failed to disconnect");
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
      updateGoogleSyncUI();
    }
  } else {
    if (btn) btn.disabled = true;
    if (btnText) btnText.innerText = "Connecting...";

    try {
      const res = await fetch(`${getApiBaseUrl()}/google/auth-url?userId=${currentUser.uid}&_=${Date.now()}`);
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || "Failed to get auth URL");
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
      updateGoogleSyncUI();
    }
  }
}

function openGoogleOnboarding() {
  const modal = document.getElementById("google-onboarding-modal");
  const select = document.getElementById("google-onboarding-target-family");
  if (!modal || !select) return;

  select.innerHTML = "";
  if (userFamilies.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.innerText = "No families joined";
    opt.disabled = true;
    select.appendChild(opt);
  } else {
    userFamilies.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.innerText = f.name;
      select.appendChild(opt);
    });
  }

  modal.classList.add("active");
}

function closeGoogleOnboarding() {
  const modal = document.getElementById("google-onboarding-modal");
  if (modal) modal.classList.remove("active");
}

async function handleGoogleOnboardingSubmit(e) {
  e.preventDefault();
  const select = document.getElementById("google-onboarding-target-family");
  if (!select || !currentUser) return;

  const targetFamilyId = select.value;
  if (!targetFamilyId) return;

  try {
    showToast("Setting default group and syncing...", "info");
    
    // 1. Save targetFamilyId in Firestore user document
    await dbFirestore.collection("users").doc(currentUser.uid).update({
      "googleSync.targetFamilyId": targetFamilyId
    });

    // 2. Set this group as the default active group in the web app
    await switchActiveFamily(targetFamilyId);

    // Close modal
    closeGoogleOnboarding();

    // 3. Trigger initial sync via api
    const res = await fetch(`${getApiBaseUrl()}/google/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ userId: currentUser.uid })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Google Calendar sync setup completed!", "success");
    } else {
      throw new Error(data.error || "Failed to trigger sync");
    }
  } catch (err) {
    console.error("Failed to complete Google Sync setup:", err);
    showToast("Error: " + err.message, "error");
  }
}
