# SyncUp - Family Calendar Architecture Documentation

This document describes the architecture, database schema, synchronization logic, and frontend rendering design of the SyncUp Family Calendar application.

---

## 1. Overview & Technology Stack

SyncUp is a web-based family scheduling application designed to merge multiple personal and family Google Calendars into a single unified dashboard.

* **Frontend**: HTML5, Vanilla JavaScript (`app.js`), Vanilla CSS (`style.css`).
* **Backend / Database**: Google Firebase
  * **Firestore**: Real-time NoSQL database storing users, families, and events.
  * **Cloud Functions**: Node.js background functions handling background synchronization, API endpoints, and Firestore triggers.
  * **Hosting**: Firebase Hosting for static frontend assets.

---

## 2. Database Schema (Firestore)

### `users` Collection
Stores user profiles, group associations, and Google Calendar sync credentials.
```typescript
interface User {
  id: string;          // Firebase Auth UID or 'child_' prefixed ID for virtual members
  name: string;        // Full name of the user
  email: string;       // Email address (empty for virtual children)
  color: string;       // Assigned color code (e.g. #06b6d4)
  isChild?: boolean;   // True if the member is a virtual child profile
  parentUid?: string;  // If isChild is true, links to the parent's UID
  families: string[];  // Array of family IDs this user belongs to
  googleSync?: {
    connected: boolean;
    googleEmail: string;
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
    timeZone: string;
    targetFamilyId: string;
    calendars: {
      [familyId: string]: string; // Maps family IDs to their Google secondary calendar ID
    };
    lastSyncedTime: string;       // ISO timestamp of the last successful sync run
  }
}
```

### `events` Collection
Stores unified calendar events synced from Google or created directly in the web app.
```typescript
interface Event {
  id: string;          // Firestore Document ID
  familyId: string;    // Associated Family ID
  title: string;       // Event title
  description: string; // Event description
  date: string;        // Start Date (YYYY-MM-DD)
  endDate: string;     // End Date (YYYY-MM-DD) for multi-day events (same as 'date' for single day)
  startTime: string;   // Start Time (HH:MM), empty if all-day
  endTime: string;     // End Time (HH:MM), empty if all-day
  category: 'regular' | 'flight' | 'school_vacation' | 'family_vacation';
  relevantTo: string[]; // ['all'] for family events, or array of member user IDs
  createdBy: string;    // UID of the creator member
  googleEventIds: {
    [userId: string]: {
      calendarId: string;
      eventId: string;
      lastSyncedHash: string; // MD5/SHA hash of the event contents to detect changes
    };
  };
  recurrenceId?: string;    // Shared ID grouping recurring occurrences together
  recurrenceIndex?: number; // Index of this occurrence in the recurrence series
}
```

### `families` Collection
Stores family group names and member mappings.
```typescript
interface Family {
  id: string;        // Firestore Document ID
  name: string;      // Family name (e.g., "Keller")
  members: string[]; // Array of user IDs (both parent and child profiles)
}
```

---

## 3. Google Calendar Synchronization Engine

The sync engine uses a bi-directional synchronization model between Google Calendar and Firestore, written as Firebase Cloud Functions in Node.js.

### Real-Time Sync (App -> Google Calendar)
Triggered by the `syncFirestoreToGoogle` Cloud Function on any write/update/delete operation in the `events` Firestore collection.
* Iterates through all connected family members.
* Pushes the event to each user's primary calendar (if relevant to them) or the family's shared secondary calendar (if it's a family-wide event).

### Onboarding Sync (`triggerInitialSync`)
Runs immediately when a user links their Google Account to the app.
* Performs a two-way sync of all events within the capped time-range.
* Auto-detects secondary calendars (see matching logic below).

### Background Scheduled Sync (`syncGoogleToFirestore`)
Runs on a scheduled cron-job (e.g., every 5–10 minutes) to pull updates made on Google Calendar back to Firestore.
* Fetches the calendar lists and paginates through events using `nextPageToken` to handle calendars exceeding 250 events.
* Refactored to process updates in **parallel concurrency groups of 15** (`Promise.all`) to prevent execution timeout errors during large pulls.

### Dynamic Calendar Detection & Matching Rules
To prevent users from manually configuring their calendars:
1. **Primary Calendar**: Synced by default for each connected user.
2. **Family Shared Calendar**: The sync engine looks for an existing secondary calendar matching the family group name (e.g., `"Keller"`). If none exists, it creates one. It maps this calendar in `googleSync.calendars[familyId]` to sync family-wide events (`relevantTo: ["all"]`).
3. **Member Secondary Calendars**: Automatically detects and syncs secondary calendars whose titles case-insensitively match a family member's first name or full name (e.g. calendar summary `"Daniel"` matches family member `"Daniel Keller"`).
   * **Exclusion Guard**: The name-matching logic explicitly excludes any calendar ID that is already mapped as the family's shared calendar to prevent duplication and color conflicts.

---

## 4. Frontend Rendering & Aesthetics

The application layout is fully responsive and rendered dynamically via `app.js` using CSS custom properties for theme styling in `style.css`.

### Color-Coding Logic
The background color of event pills is determined in `getEventColor()` in `app.js`:
1. **Personal Events**: If an event has exactly one user in `relevantTo`, it renders in that member's personal assigned color (cyan, pink, etc.).
2. **Vacations**: School and family vacations render in distinct category colors (`var(--vacation-school)` / `var(--vacation-family)`).
3. **Family Events**: Family events (relevant to `"all"` or multiple members) are rendered in a **neutral Indigo color** (`var(--accent-primary)`) instead of the creator's personal color, avoiding visual confusion.

### Continuous Multi-Day Spanning Layout & Grid Alignment
For multi-day events (e.g., vacation `"חופש"` or flights spanning several days), the monthly grid renders them as a continuous visual block spanning across columns:
* **Week-by-Week Slot Allocation**: The monthly calendar renderer groups cells into rows of weeks (7 days). It scans all events overlapping each week row and assigns them consistent vertical slots (`0`, `1`, or `2`) for their active duration in that week row. This guarantees that multi-day events remain in the same vertical position and do not shift or cut off when other events start or end.
* **Placeholder Grid Protection**: On the first active day of an event in a week row, a single pill is drawn with a computed width spanning across the active columns in that week. On subsequent active days in that week, a hidden placeholder (`visibility: hidden`) is rendered in that slot to reserve vertical space, maintaining grid slot alignment.
* **CSS Overflow Fix**: The `.month-day` cells are styled with `overflow: visible;` in both desktop and mobile views. This prevents the browser from collapsing horizontal overflow to `hidden`, allowing multi-day spanning bars to stretch across day boundaries.
* **Preserving Flight Duration**: Flight events retain their Google Calendar `endDate` in Firestore, allowing the frontend to correctly stretch flight bars according to their departure and return dates.

### Recurring Events Architectural Approach
To prevent synchronization conflict loops and duplicate events when interfacing with the Google Calendar API:
* **Series Expansion on Creation**: When a user schedules a recurring event in the web app, the frontend calculates dates for the series up to the specified occurrence count. It writes these to Firestore as individual, flat single-event documents connected via a `recurrenceId`. This allows the background sync engine to pull them from Google Calendar (which expands them using `singleEvents: true`) without creating duplicates.
* **Atomic Series Operations**: When editing or deleting an event with a `recurrenceId`, the user is prompted to choose between modifying the single occurrence or the entire series. If the series option is chosen, the frontend performs an atomic Firestore write batch to update or delete all related occurrence documents.


---

## 5. Modifications Log

| Date | Component | Description |
| :--- | :--- | :--- |
| July 2026 | Easy Deletion | Added direct "Delete Event" button to Details modal to delete without opening full editor. |
| July 2026 | Time Ranges | Capped sync to **3 years in the past** and **1 year in the future** to protect against API query bounds. |
| July 2026 | Pagination & Timeout | Added `nextPageToken` support and chunked concurrent processing of 15 events to prevent Cloud Function timeouts. |
| July 2026 | Secondary Match | Implemented automatic secondary calendar detection matching family member names. |
| July 2026 | Family Calendar Guard | Added exclusion check to stop shared family calendars from matching as member calendars. |
| July 2026 | CSS Spanning | Changed `.month-day` overflow to `visible` to allow multi-day bars to span columns continuously. |
| July 2026 | Neutral Family Colors | Changed family event colors to use Indigo theme instead of falling back to creator personal color. |
| July 2026 | Week-by-Week Slot Allocation | Refactored monthly grid renderer to assign consistent vertical slots to events week-by-week, preventing visual cut-offs, vertical shifts, and anonymous blank bars. |
| July 2026 | Recurring Events | Implemented UI selector and atomic Firestore batch write/update/delete actions to fully support Daily, Weekly, Monthly, and Yearly recurring events. |
| July 2026 | Custom Confirmation Modal | Created custom CSS sheet overlay dialog supporting custom action labels ('Yes' and 'This event only') to replace native browser alerts. |
| July 2026 | Google Recurrence Mapping | Map Google Calendar `recurringEventId` to Firestore `recurrenceId` in backend sync triggers to link external recurring series in the web app. |
| July 2026 | Recurrence Data Migration | Configured sync engine to automatically update existing Firestore event documents with recurrence links when they are pulled from Google. |
| July 2026 | Default Family & Visibility | Set startup active family to primary settings default. Enabled role-based default visible event filters (parents see all, child sees only self). |
| July 2026 | Schema Validation Rules | Added Firestore Security Rules to enforce strict validation for event document schemas (familyId, createdBy, title, date matching regex, category enum, relevantTo list) and added corresponding client-side validation toast warnings. |
| July 2026 | Sync Scope Restriction | Restricted Google Calendar secondary calendar auto-detection to the syncing user only, avoiding duplicates and conflicts from other members' calendars. |

---

## 6. Directory Structure & File Map

Below is a hierarchical tree of the repository files, detailing their name, deployment target, and role in the ecosystem.

```
family-calendar/
├── .firebase/                  # Firebase CLI cache & configuration
├── .firebaserc                 # Firebase Project mapping (aliasing)
├── firebase.json               # Firebase Hosting and Functions configuration
├── package.json                # Local Node.js project manifest
├── server.js                   # Local Express development server configuration
├── manifest.json               # PWA configuration manifest & app icons
├── index.html                  # Main SPA structure and UI elements
├── style.css                   # General application style sheet, themes, and RTL overrides
├── app.js                      # Client application logic, controllers, and translation dictionaries
├── database.js                 # Frontend wrapper for Firebase Client SDK database writes/reads
├── ARCHITECTURE.md             # Architecture documentation
└── functions/                  # Cloud Functions Backend (OAuth & Sync engine)
    ├── index.js                # Core API functions, Firestore triggers, and background sync logic
    ├── package.json            # Node.js dependencies for Cloud Functions
    └── .env                    # Cloud Functions environment variables (Google OAuth credentials)
```

### Detailed File Catalog

| File / Location | Deployment Target | Github Location | Description |
| :--- | :--- | :--- | :--- |
| `index.html` | Firebase Hosting | `/index.html` | The entry point of the SPA. Contains HTML markup for authorization views, the monthly/weekly calendar grid wrapper, the active family panel (Family Hub), and the settings lists. |
| `style.css` | Firebase Hosting | `/style.css` | Implements the layout styles, transitions, responsive CSS media queries, and RTL support adjustments (for Hebrew translation support). |
| `app.js` | Firebase Hosting | `/app.js` | Contains all frontend business logic. Manages active view routing, monthly/weekly grid rendering, multi-day event slot allocation, UI translations (English, German, Hebrew), and click/touch swipe event handlers. |
| `database.js` | Firebase Hosting | `/database.js` | Manages the connection to the Firebase Client SDK. Defines wrappers to write/delete profiles, child members, and events directly to Firestore. |
| `manifest.json` | Firebase Hosting | `/manifest.json` | Configures the Progressive Web App (PWA) capabilities, including install prompts, start URLs, background/theme colors, and app icons. |
| `server.js` | Local Development | `/server.js` | A simple Node.js Express server to host the static assets locally during development and testing. |
| `firebase.json` | Firebase CLI Config | `/firebase.json` | Directs the Firebase CLI compiler on how to bundle the `functions` directory and which public directory to upload for `Hosting` static assets. |
| `functions/index.js` | Cloud Functions | `/functions/index.js` | The backend engine. Exposes OAuth API redirect URLs, registers background cron schedulers, and runs bi-directional synchronization algorithms between Google Calendar and Firestore. |

---

## 7. Application Flow Tree

The flow tree below visualizes how frontend user interactions, real-time database listeners, and backend sync handlers execute together.

```mermaid
flowchart TD
    subgraph Frontend [Client Web App (Firebase Hosting)]
        HTML[index.html - UI Elements]
        CSS[style.css - Styles & Layout]
        JS[app.js - State & Controllers]
        DB[database.js - Firestore Client SDK wrapper]
    end

    subgraph Firebase [Firebase Cloud Suite]
        Auth[Firebase Authentication]
        FS[(Firestore Database)]
        Funcs[Cloud Functions - functions/index.js]
    end

    subgraph External [Google API Services]
        GC[Google Calendar Servers]
    end

    %% User Action Flows
    HTML -->|Triggers Click/Touch| JS
    JS -->|Calls Database API| DB
    DB -->|Saves Profile / Event| FS
    DB -->|Signs In / Auth Code| Auth

    %% Real-time UI updates
    FS -.->|Real-time updates (onSnapshot)| JS
    JS -->|Re-renders grid / details| HTML
    CSS -->|Styles UI dynamically| HTML

    %% Real-time trigger flows (App -> Google)
    FS -->|Firestore trigger: syncFirestoreToGoogle| Funcs
    Funcs -->|Executes Google Calendar API write| GC

    %% Background scheduled sync flows (Google -> App)
    Funcs -.->|Scheduled every 5-10m| GC
    GC -->|Returns updated calendar events| Funcs
    Funcs -->|Writes new events| FS
```

