const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors")({ origin: true });
const { google } = require("googleapis");
const crypto = require("crypto");

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Set global options for all functions (including the Max Instance Cap)
setGlobalOptions({ maxInstances: 1, region: "europe-west6" });

// Load encryption key from environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "some_random_secret_key_32_bytes_"; // fallback for safety
const IV_LENGTH = 16;

/**
 * Format a Date object in a specific timezone using the Swedish (sv-SE) locale
 * to natively output YYYY-MM-DD and HH:mm formats.
 */
function formatInTimeZone(dateObj, timeZone, type) {
  try {
    const options = type === "date" 
      ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone }
      : { hour: "2-digit", minute: "2-digit", hour12: false, timeZone };
    return new Intl.DateTimeFormat("sv-SE", options).format(dateObj);
  } catch (err) {
    console.warn(`Timezone formatting failed for ${timeZone}, falling back to UTC:`, err);
    const options = type === "date" 
      ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }
      : { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" };
    return new Intl.DateTimeFormat("sv-SE", options).format(dateObj);
  }
}

/**
 * Format the Google Calendar event title based on the category (e.g. flight, vacation)
 * to match the naming conventions of the web app.
 */
function getGoogleEventDisplayTitle(eventData) {
  if (eventData.category === 'flight') {
    const dest = eventData.flightDestination || eventData.title || '';
    let cleanDest = dest;
    const fallbacks = ['Flight ✈️', 'Flug ✈️', 'טיסה ✈️', 'Flight', 'Flug', 'טיסה'];
    if (fallbacks.includes(cleanDest)) {
      cleanDest = '';
    }
    const pax = eventData.flightPassengers;
    let title = '✈️';
    if (cleanDest) {
      title += ` ${cleanDest}`;
    }
    if (pax) {
      title += cleanDest ? `, ${pax}` : ` ${pax}`;
    }
    return title;
  }
  
  if (eventData.category === 'school_vacation') {
    let title = eventData.title || '';
    if (!title.startsWith('🎒') && !title.toLowerCase().includes('school vacation')) {
      title = `🎒 ${title}`;
    }
    return title;
  }
  
  if (eventData.category === 'family_vacation') {
    let title = eventData.title || '';
    if (!title.startsWith('🏖️') && !title.toLowerCase().includes('family vacation')) {
      title = `🏖️ ${title}`;
    }
    return title;
  }
  
  return eventData.title || 'No Title';
}

/**
 * Encrypt a text string using AES-256-CBC
 */
function encryptToken(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypt a text string using AES-256-CBC
 */
function decryptToken(text) {
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift(), "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error("Token decryption failed:", e);
    return null;
  }
}

/**
 * Increments and checks the Daily Circuit Breaker counter.
 * Returns true if execution can proceed, false if the daily limit (15 runs) is reached.
 */
async function incrementAndCheckCircuitBreaker(syncType = "push") {
  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const docRef = db.collection("system_sync_stats").doc(todayStr);

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(docRef);
    let pushCount = 0;
    let pullCount = 0;
    if (doc.exists) {
      pushCount = doc.data().pushCount || 0;
      pullCount = doc.data().pullCount || 0;
    }

    if (syncType === "push") {
      const limit = 300; // Max push events per day
      if (pushCount >= limit) {
        console.warn(`[CIRCUIT BREAKER] Push sync limit of ${limit} reached for today (${todayStr}). Push aborted.`);
        return false;
      }
      const newCount = pushCount + 1;
      transaction.set(docRef, { pushCount: newCount }, { merge: true });
      console.log(`[CIRCUIT BREAKER] Push sync count: ${newCount}/${limit} runs for today (${todayStr}).`);
      return true;
    } else {
      const limit = 400; // Max pull background tasks (standard 288 runs/day)
      if (pullCount >= limit) {
        console.warn(`[CIRCUIT BREAKER] Pull sync limit of ${limit} reached for today (${todayStr}). Pull aborted.`);
        return false;
      }
      const newCount = pullCount + 1;
      transaction.set(docRef, { pullCount: newCount }, { merge: true });
      console.log(`[CIRCUIT BREAKER] Pull sync count: ${newCount}/${limit} runs for today (${todayStr}).`);
      return true;
    }
  });
}

/**
 * Generates a deterministic hash of the event contents to detect actual updates
 * and prevent infinite loops between Google and Firestore.
 */
function calculateEventHash(event) {
  const data = [
    event.title || "",
    event.description || "",
    event.date || "",
    event.endDate || "",
    event.startTime || "",
    event.endTime || "",
    event.category || "",
    (event.relevantTo || []).slice().sort().join(","),
    event.flightDepDate || "",
    event.flightDepTakeoff || "",
    event.flightDepLanding || "",
    event.flightRetDate || "",
    event.flightRetTakeoff || "",
    event.flightRetLanding || "",
    event.flightPassengers || "",
    event.flightDestination || "",
    event.flightBookingRef || ""
  ].join("|");
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Returns the OAuth2 client configured with dynamic redirects
 */
function getOAuth2Client(customRedirectUri) {
  const redirectUri = customRedirectUri || `https://kinship-14ac4.firebaseapp.com/api/google/oauth-callback`;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

/**
 * Retrieves the authenticated Google Calendar API client for a user
 */
async function getGoogleAuthClient(userSyncData) {
  if (!userSyncData || !userSyncData.refreshTokenEncrypted) return null;
  const refreshToken = decryptToken(userSyncData.refreshTokenEncrypted);
  if (!refreshToken) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Dynamically resolves or creates a Google Calendar named after a family group,
 * and saves the mapping in the user's Firestore document.
 */
async function ensureFamilyCalendar(userId, userGoogleSync, familyId, calendarClient) {
  if (userGoogleSync.calendars && userGoogleSync.calendars[familyId]) {
    return userGoogleSync.calendars[familyId];
  }

  const familyDoc = await db.collection("families").doc(familyId).get();
  if (!familyDoc.exists) return null;
  const familyName = familyDoc.data().name || "Family Calendar";

  try {
    const calList = await calendarClient.calendarList.list();
    const existingCalendars = calList.data.items || [];
    const existingCal = existingCalendars.find(item => item.summary === familyName);
    let targetCalendarId = null;

    if (existingCal) {
      targetCalendarId = existingCal.id;
    } else {
      const newCal = await calendarClient.calendars.insert({
        requestBody: { summary: familyName, timeZone: "UTC" }
      });
      targetCalendarId = newCal.data.id;
    }

    const calendarsMap = userGoogleSync.calendars || {};
    calendarsMap[familyId] = targetCalendarId;
    
    await db.collection("users").doc(userId).update({
      "googleSync.calendars": calendarsMap
    });
    
    userGoogleSync.calendars = calendarsMap;
    return targetCalendarId;
  } catch (err) {
    console.error(`Failed to ensure family calendar for ${familyId}:`, err);
    return null;
  }
}

/**
 * Performs a two-way initial sync of all existing events between Firestore and Google Calendar.
 */
async function triggerInitialSync(userId, userGoogleSync) {
  const auth = await getGoogleAuthClient(userGoogleSync);
  if (!auth) return;

  const calendar = google.calendar({ version: "v3", auth });
  
  const userDoc = await db.collection("users").doc(userId).get();
  if (!userDoc.exists) return;
  const userData = userDoc.data();
  const userFamiliesList = userData.families || [];

  // Secondary calendars will be created dynamically as needed during target mapping

  // Retrieve cached calendar timezone or fetch it dynamically
  let userTimeZone = userGoogleSync.timeZone;
  if (!userTimeZone) {
    try {
      const primaryCal = await calendar.calendars.get({ calendarId: "primary" });
      userTimeZone = primaryCal.data.timeZone || "UTC";
      await db.collection("users").doc(userId).update({
        "googleSync.timeZone": userTimeZone
      });
    } catch (e) {
      userTimeZone = "UTC";
    }
  }

  // Fetch all events for the user's families and direct user events, merging them to prevent omissions
  let eventsDocs = [];
  const docsMap = new Map();

  if (userFamiliesList.length > 0) {
    const familyEventsSnap = await db.collection("events")
      .where("familyId", "in", userFamiliesList)
      .get();
    familyEventsSnap.forEach(doc => docsMap.set(doc.id, doc));
  }

  const personalEventsSnap = await db.collection("events")
    .where("relevantTo", "array-contains", userId)
    .get();
  personalEventsSnap.forEach(doc => docsMap.set(doc.id, doc));

  eventsDocs = Array.from(docsMap.values());

  for (const doc of eventsDocs) {
    const eventId = doc.id;
    const eventData = doc.data();
    
    const googleEventMap = eventData.googleEventIds ? eventData.googleEventIds[userId] : null;
    const previousEventId = googleEventMap ? googleEventMap.eventId : null;
    const previousCalendarId = googleEventMap ? googleEventMap.calendarId : null;

    // Relevance checking (direct relevance, group-wide relevance, or parent-validated child events)
    let isRelevant = false;
    if (Array.isArray(eventData.relevantTo)) {
      if (eventData.relevantTo.includes(userId) || eventData.relevantTo.includes("all")) {
        isRelevant = true;
      } else if (eventData.familyId) {
        let hasChildInRelevant = false;
        let isDirectParent = false;

        for (const rId of eventData.relevantTo) {
          const memberDoc = await db.collection("users").doc(rId).get();
          if (memberDoc.exists && memberDoc.data().isChild) {
            hasChildInRelevant = true;
            if (memberDoc.data().parentUid === userId) {
              isDirectParent = true;
            }
          }
        }

        if (isDirectParent) {
          isRelevant = true;
        } else if (hasChildInRelevant) {
          const familyDoc = await db.collection("families").doc(eventData.familyId).get();
          if (familyDoc.exists) {
            const parents = familyDoc.data().parents;
            if (Array.isArray(parents) && parents.includes(userId)) {
              isRelevant = true;
            }
          }
        }
      }
    }

    if (!isRelevant) {
      // Event no longer relevant -> Delete from Google Calendar
      if (previousEventId && previousCalendarId) {
        try {
          await calendar.events.delete({ calendarId: previousCalendarId, eventId: previousEventId });
          await db.collection("events").doc(eventId).update({
            [`googleEventIds.${userId}`]: admin.firestore.FieldValue.delete()
          });
          console.log(`[INITIAL SYNC] Deleted Google event ${previousEventId} for user ${userId} (no longer relevant).`);
        } catch (e) {
          if (e.code === 404 || e.code === 410) {
            await db.collection("events").doc(eventId).update({
              [`googleEventIds.${userId}`]: admin.firestore.FieldValue.delete()
            });
          } else {
            console.error(`[INITIAL SYNC] Failed to delete no-longer-relevant Google event ${previousEventId}:`, e);
          }
        }
      }
      continue;
    }

    // Resolve targetCalendarId based on routing rules
    const familyId = eventData.familyId;
    const defaultTargetFamilyId = userGoogleSync.targetFamilyId || userFamiliesList[0];
    let targetCalendarId = "primary";

    if (familyId) {
      if (familyId === defaultTargetFamilyId) {
        // Shared group events in default group go to secondary calendar, personal/child events go to primary
        let hasOtherNonChildMembers = false;
        if (Array.isArray(eventData.relevantTo)) {
          if (eventData.relevantTo.includes("all")) {
            hasOtherNonChildMembers = true;
          } else {
            for (const rId of eventData.relevantTo) {
              if (rId !== userId) {
                const memberDoc = await db.collection("users").doc(rId).get();
                if (memberDoc.exists && !memberDoc.data().isChild) {
                  hasOtherNonChildMembers = true;
                  break;
                }
              }
            }
          }
        }
        if (hasOtherNonChildMembers) {
          const mappedId = await ensureFamilyCalendar(userId, userGoogleSync, familyId, calendar);
          if (mappedId) targetCalendarId = mappedId;
        } else {
          targetCalendarId = "primary";
        }
      } else {
        // Events in non-default groups go to their respective secondary calendars
        const mappedId = await ensureFamilyCalendar(userId, userGoogleSync, familyId, calendar);
        if (mappedId) targetCalendarId = mappedId;
      }
    } else {
      // Personal events go to primary Google Calendar
      targetCalendarId = "primary";
    }

    const currentHash = calculateEventHash(eventData);

    try {
      let title = getGoogleEventDisplayTitle(eventData);
      if (targetCalendarId === "primary") {
        const childMembers = [];
        if (!eventData.relevantTo.includes("all")) {
          for (const rId of eventData.relevantTo) {
            if (rId !== userId) {
              const memberDoc = await db.collection("users").doc(rId).get();
              if (memberDoc.exists && memberDoc.data().isChild) {
                childMembers.push(memberDoc.data().name || rId);
              }
            }
          }
        }
        if (childMembers.length > 0) {
          title = `[${childMembers.join(", ")}] ${title}`;
        }
      }

      let description = eventData.description || "";
      const participantsNames = [];
      if (eventData.relevantTo.includes("all")) {
        participantsNames.push("Everyone");
      } else {
        for (const rId of eventData.relevantTo) {
          const memberDoc = await db.collection("users").doc(rId).get();
          if (memberDoc.exists) {
            participantsNames.push(memberDoc.data().name || rId);
          }
        }
      }
      if (participantsNames.length > 0) {
        description = `${description}\n\nFamily Members: ${participantsNames.join(", ")}`.trim();
      }

      let startDateTime = {};
      let endDateTime = {};
      const isAllDay = eventData.category === "flight" || 
                      eventData.category === "school_vacation" || 
                      eventData.category === "family_vacation" ||
                      (eventData.category === "regular" && eventData.endDate && eventData.endDate !== eventData.date) ||
                      (eventData.category === "regular" && !eventData.startTime && !eventData.endTime);

      if (isAllDay) {
        startDateTime = { date: eventData.date };
        const endStr = eventData.category === "flight" ? (eventData.flightRetDate || eventData.date) : (eventData.endDate || eventData.date);
        const endDateObj = new Date(endStr);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const endDateStr = endDateObj.toISOString().split("T")[0];
        endDateTime = { date: endDateStr };
      } else {
        startDateTime = { dateTime: `${eventData.date}T${eventData.startTime || "00:00"}:00`, timeZone: userTimeZone };
        endDateTime = { dateTime: `${eventData.endDate || eventData.date}T${eventData.endTime || "00:00"}:00`, timeZone: userTimeZone };
      }

      const googleEventResource = {
        summary: title,
        description: description,
        start: startDateTime,
        end: endDateTime
      };

      if (previousEventId && previousCalendarId && previousCalendarId !== targetCalendarId) {
        // Calendar changed -> Delete old and create new
        try {
          await calendar.events.delete({ calendarId: previousCalendarId, eventId: previousEventId });
        } catch (e) {
          console.warn(`[INITIAL SYNC] Could not remove event from old calendar:`, e.message);
        }
        const insertRes = await calendar.events.insert({
          calendarId: targetCalendarId,
          requestBody: googleEventResource
        });
        await db.collection("events").doc(eventId).update({
          [`googleEventIds.${userId}`]: {
            calendarId: targetCalendarId,
            eventId: insertRes.data.id,
            lastSyncedHash: currentHash
          }
        });
        console.log(`[INITIAL SYNC] Moved event ${eventId} to calendar ${targetCalendarId} for user ${userId}`);
      } else if (previousEventId && previousCalendarId) {
        // Standard Update
        if (googleEventMap.lastSyncedHash === currentHash) {
          continue;
        }
        await calendar.events.update({
          calendarId: targetCalendarId,
          eventId: previousEventId,
          requestBody: googleEventResource
        });
        await db.collection("events").doc(eventId).update({
          [`googleEventIds.${userId}.lastSyncedHash`]: currentHash
        });
        console.log(`[INITIAL SYNC] Updated event ${eventId} in calendar ${targetCalendarId} for user ${userId}`);
      } else {
        // Standard Insert
        const insertRes = await calendar.events.insert({
          calendarId: targetCalendarId,
          requestBody: googleEventResource
        });
        await db.collection("events").doc(eventId).update({
          [`googleEventIds.${userId}`]: {
            calendarId: targetCalendarId,
            eventId: insertRes.data.id,
            lastSyncedHash: currentHash
          }
        });
        console.log(`[INITIAL SYNC] Pushed new event ${eventId} to calendar ${targetCalendarId} for user ${userId}`);
      }
    } catch (err) {
      console.error(`[INITIAL SYNC] Failed to push event ${eventId} to Google:`, err);
    }
  }

  const targetFamilyId = userGoogleSync.targetFamilyId || userFamiliesList[0];
  const calendarsToSync = [{ id: "primary", type: "primary", familyId: targetFamilyId }];
  for (const fId of Object.keys(userGoogleSync.calendars || {})) {
    calendarsToSync.push({
      id: userGoogleSync.calendars[fId],
      type: "family",
      familyId: fId
    });
  }

  // Auto-detect and sync personal secondary calendars matching the syncing user's name only
  try {
    const memberName = userData.name;
    if (memberName) {
      const calList = await calendar.calendarList.list();
      const googleCalendars = calList.data.items || [];

      const matchedCal = googleCalendars.find(c => {
        const summary = c.summary;
        if (!summary) return false;
        const calName = summary.trim().toLowerCase();
        const memName = memberName.trim().toLowerCase();
        const firstWord = memName.split(/\s+/)[0];
        return calName === memName || calName === firstWord;
      });

      if (matchedCal && matchedCal.id !== "primary" && !Object.values(userGoogleSync.calendars || {}).includes(matchedCal.id)) {
        // Avoid duplicate calendars in sync list
        if (!calendarsToSync.some(c => c.id === matchedCal.id)) {
          calendarsToSync.push({
            id: matchedCal.id,
            type: "member",
            familyId: targetFamilyId,
            memberUserId: userId
          });
          console.log(`[INITIAL SYNC] Detected secondary calendar "${matchedCal.summary}" for user "${memberName}". Adding to sync list.`);
        }
      }
    }
  } catch (err) {
    console.error("[INITIAL SYNC] Failed to auto-detect user secondary calendars:", err);
  }

  const threeYearsAgo = new Date();
  threeYearsAgo.setDate(threeYearsAgo.getDate() - 3 * 365);
  const timeMin = threeYearsAgo.toISOString();

  const oneYearFromNow = new Date();
  oneYearFromNow.setDate(oneYearFromNow.getDate() + 365);
  const timeMax = oneYearFromNow.toISOString();

  for (const cal of calendarsToSync) {
    if (!cal.id) continue;
    try {
      let nextPageToken = null;
      const googleEvents = [];
      do {
        const eventsRes = await calendar.events.list({
          calendarId: cal.id,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
          pageToken: nextPageToken || undefined
        });
        googleEvents.push(...(eventsRes.data.items || []));
        nextPageToken = eventsRes.data.nextPageToken;
      } while (nextPageToken);
      const processGoogleEvent = async (gEvent) => {
        if (gEvent.status === "cancelled") return;

        const googleEventId = gEvent.id;

        let title = gEvent.summary || "No Title";
        let parsedTitle = title;
        const childPrefixRegex = /^\[([^\]]+)\]\s*(.*)$/;
        const match = childPrefixRegex.exec(title);
        if (match) {
          parsedTitle = match[2];
        }

        let description = gEvent.description || "";
        description = description.replace(/\s*Family\s+Members:\s*.*$/gi, "").trim();

        let date = "";
        let endDate = "";
        let startTime = "";
        let endTime = "";

        if (gEvent.start.date) {
          date = gEvent.start.date;
          const endObj = new Date(gEvent.end.date);
          endObj.setDate(endObj.getDate() - 1);
          endDate = endObj.toISOString().split("T")[0];
        } else {
          const startDateTime = new Date(gEvent.start.dateTime);
          const endDateTime = new Date(gEvent.end.dateTime);
          
          date = formatInTimeZone(startDateTime, userTimeZone, "date");
          endDate = formatInTimeZone(endDateTime, userTimeZone, "date");
          startTime = formatInTimeZone(startDateTime, userTimeZone, "time");
          endTime = formatInTimeZone(endDateTime, userTimeZone, "time");
        }

        let relevantTo = [userId];
        const targetFamilyId = cal.familyId || userGoogleSync.targetFamilyId || userFamiliesList[0];

        if (cal.type === "family" && targetFamilyId) {
          relevantTo = ["all"];
        } else if (cal.type === "primary" && targetFamilyId) {
          // If pulling from primary, check for child prefix matching
          let childUserId = null;
          if (match) {
            const childName = match[1].toLowerCase();
            const membersSnap = await db.collection("users")
              .where("families", "array-contains", targetFamilyId)
              .get();
            for (const memberDoc of membersSnap.docs) {
              const memberData = memberDoc.data();
              if (memberData.isChild && memberData.name && memberData.name.toLowerCase() === childName) {
                childUserId = memberDoc.id;
                break;
              }
            }
          }
          if (childUserId) {
            relevantTo = [childUserId];
          } else {
            relevantTo = [userId];
          }
        } else if (cal.type === "member") {
          relevantTo = [cal.memberUserId];
        }

        let category = "regular";
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes("✈️") || lowerTitle.includes("flight")) {
          category = "flight";
        } else if (lowerTitle.includes("🎒") || lowerTitle.includes("school vacation")) {
          category = "school_vacation";
        } else if (lowerTitle.includes("🏖️") || lowerTitle.includes("family vacation")) {
          category = "family_vacation";
        }

        if (category === "school_vacation" && parsedTitle.startsWith("🎒 ")) {
          parsedTitle = parsedTitle.substring(2);
        } else if (category === "family_vacation" && parsedTitle.startsWith("🏖️ ")) {
          parsedTitle = parsedTitle.substring(2);
        }

        const eventPayload = {
          familyId: targetFamilyId || null,
          createdBy: userId,
          title: parsedTitle,
          description,
          date,
          endDate: endDate,
          startTime,
          endTime,
          category,
          relevantTo
        };

        if (gEvent.recurringEventId) {
          eventPayload.recurrenceId = gEvent.recurringEventId;
        }

        if (category === "flight") {
          eventPayload.flightDepDate = date;
          eventPayload.flightRetDate = endDate;
          eventPayload.flightDestination = parsedTitle;
          eventPayload.flightPassengers = "";
          eventPayload.flightBookingRef = "";
          eventPayload.flightDepTakeoff = startTime || "00:00";
          eventPayload.flightDepLanding = endTime || "00:00";
          eventPayload.flightRetTakeoff = "";
          eventPayload.flightRetLanding = "";

          let clean = title.replace(/^✈️\s*/, "");
          if (clean.includes(",")) {
            const parts = clean.split(",");
            eventPayload.flightDestination = parts[0].trim();
            eventPayload.flightPassengers = parts.slice(1).join(",").trim();
          } else {
            eventPayload.flightDestination = clean.trim();
          }
          eventPayload.title = eventPayload.flightDestination || "Flight";
        }

        let firestoreEventDoc = null;
        let firestoreEventData = null;

        const eventQuery = await db.collection("events")
          .where(`googleEventIds.${userId}.eventId`, "==", googleEventId)
          .get();

        if (!eventQuery.empty) {
          firestoreEventDoc = eventQuery.docs[0];
          firestoreEventData = firestoreEventDoc.data();
        } else {
          // Content-based deduplication query
          const isAllDay = !!gEvent.start.date;
          const dateQuery = await db.collection("events")
            .where("date", "==", date)
            .get();
          
          for (const doc of dateQuery.docs) {
            const docData = doc.data();
            
            // Match title (case-insensitive)
            const titleMatches = (docData.title || "").trim().toLowerCase() === eventPayload.title.trim().toLowerCase();
            if (!titleMatches) continue;

            // Match category
            if (docData.category !== eventPayload.category) continue;

            // Match familyId
            const familyMatches = docData.familyId === eventPayload.familyId;
            if (!familyMatches) continue;

            // Match all-day status
            const docIsAllDay = docData.category === "flight" || 
                                docData.category === "school_vacation" || 
                                docData.category === "family_vacation" ||
                                (docData.category === "regular" && docData.endDate && docData.endDate !== docData.date) ||
                                (docData.category === "regular" && !docData.startTime && !docData.endTime);
            if (isAllDay !== docIsAllDay) continue;

            // Match times if regular and not all-day
            if (eventPayload.category === "regular" && !isAllDay) {
              if (docData.startTime !== eventPayload.startTime || docData.endTime !== eventPayload.endTime) {
                continue;
              }
            }

            // Found a match!
            firestoreEventDoc = doc;
            firestoreEventData = docData;
            break;
          }
        }

        const importedHash = calculateEventHash(eventPayload);

        if (firestoreEventDoc) {
          const updates = {};
          let needsUpdate = false;
          
          if (!firestoreEventData.googleEventIds || !firestoreEventData.googleEventIds[userId]) {
            updates[`googleEventIds.${userId}`] = {
              calendarId: cal.id,
              eventId: googleEventId,
              lastSyncedHash: importedHash
            };
            needsUpdate = true;
          }
          
          if (eventPayload.recurrenceId && !firestoreEventData.recurrenceId) {
            updates.recurrenceId = eventPayload.recurrenceId;
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await db.collection("events").doc(firestoreEventDoc.id).update(updates);
            console.log(`[INITIAL SYNC] Updated existing Firestore event ${firestoreEventDoc.id} with sync links/recurrence.`);
          }
          return;
        }

        eventPayload.googleEventIds = {
          [userId]: {
            calendarId: cal.id,
            eventId: googleEventId,
            lastSyncedHash: importedHash
          }
        };

        const newDocRef = await db.collection("events").add(eventPayload);
        console.log(`[INITIAL SYNC] Imported Google event ${googleEventId} into Firestore: ${newDocRef.id}`);
      };

      // Process events in parallel chunks of 15
      const chunkSize = 15;
      for (let i = 0; i < googleEvents.length; i += chunkSize) {
        const chunk = googleEvents.slice(i, i + chunkSize);
        await Promise.all(chunk.map(event => processGoogleEvent(event)));
      }
    } catch (err) {
      console.error(`[INITIAL SYNC] Failed to pull events from calendar ${cal.id}:`, err);
    }
  }
}

// ================= Express API for OAuth Endpoints =================
const app = express();
app.use(cors);
app.use(express.json());

const router = express.Router();

// Redirects to Google consent screen
router.get("/google/auth-url", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
  const redirectUri = isEmulator 
    ? `http://localhost:5001/kinship-14ac4/europe-west6/api/google/oauth-callback`
    : `https://kinship-14ac4.firebaseapp.com/api/google/oauth-callback`;

  const oauth2Client = getOAuth2Client(redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force refresh token retrieval
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email"
    ],
    state: userId
  });

  res.json({ authUrl });
});

async function clearUserGoogleEventIds(userId) {
  try {
    const eventsSnap = await db.collection("events").get();
    const batch = db.batch();
    let count = 0;
    eventsSnap.forEach(doc => {
      const data = doc.data();
      if (data.googleEventIds && data.googleEventIds[userId]) {
        batch.update(doc.ref, {
          [`googleEventIds.${userId}`]: admin.firestore.FieldValue.delete()
        });
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      console.log(`[CLEANUP] Cleared googleEventIds for user ${userId} from ${count} events.`);
    }
  } catch (err) {
    console.error(`[CLEANUP] Failed to clear googleEventIds for user ${userId}:`, err);
  }
}

// OAuth Redirect Callback from Google
router.get("/google/oauth-callback", async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send("Authorization code or userId missing.");

  try {
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    const redirectUri = isEmulator
      ? `http://localhost:5001/kinship-14ac4/europe-west6/api/google/oauth-callback`
      : `https://kinship-14ac4.firebaseapp.com/api/google/oauth-callback`;

    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      throw new Error("No refresh token received. Please disconnect Google Calendar from settings and try again.");
    }

    oauth2Client.setCredentials(tokens);

    // Get authorized Google user email
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const googleEmail = userInfo.data.email || "";

    // Fetch primary calendar timezone
    const calendarClient = google.calendar({ version: "v3", auth: oauth2Client });
    let timeZone = "UTC";
    try {
      const primaryCal = await calendarClient.calendars.get({ calendarId: "primary" });
      timeZone = primaryCal.data.timeZone || "UTC";
    } catch (err) {
      console.error("Failed to get primary calendar timezone during connection:", err);
    }

    // Encrypt and save tokens to Firestore profile
    const encryptedRefreshToken = encryptToken(tokens.refresh_token);
    const googleSync = {
      connected: true,
      googleEmail,
      refreshTokenEncrypted: encryptedRefreshToken,
      calendars: {}, // Dynamically populated by initial sync
      timeZone,
      lastSyncedTime: new Date().toISOString()
    };

    await clearUserGoogleEventIds(userId);
    await db.collection("users").doc(userId).update({
      googleSync: googleSync
    });

    // Initial sync will be triggered explicitly by the frontend after onboarding/settings selection.

    const redirectHost = isEmulator ? "http://localhost:5000" : `https://kinship-14ac4.firebaseapp.com`;
    res.redirect(`${redirectHost}/?google_sync=success`);

  } catch (err) {
    console.error("OAuth callback error:", err);
    const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
    const redirectHost = isEmulator ? "http://localhost:5000" : `https://kinship-14ac4.firebaseapp.com`;
    res.redirect(`${redirectHost}/?google_sync=error&message=${encodeURIComponent(err.message)}`);
  }
});

// Trigger dynamic sync on demand
router.post("/google/sync", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const googleSync = userDoc.data().googleSync;
    if (!googleSync || !googleSync.connected) {
      return res.status(400).json({ error: "Google Calendar not connected" });
    }

    await triggerInitialSync(userId, googleSync);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if user is connected
router.get("/google/status", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const googleSync = userDoc.data().googleSync;
    if (googleSync && googleSync.connected) {
      res.json({ connected: true, googleEmail: googleSync.googleEmail });
    } else {
      res.json({ connected: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke credentials and disconnect
router.post("/google/disconnect", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    await clearUserGoogleEventIds(userId);
    await db.collection("users").doc(userId).update({
      googleSync: admin.firestore.FieldValue.delete()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/google/debug", async (req, res) => {
  if (req.query.userId === "allUsers") {
    try {
      const snap = await db.collection("users").get();
      const list = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({
          id: doc.id,
          name: d.name,
          email: d.email,
          isChild: d.isChild,
          families: d.families,
          googleSync: d.googleSync ? {
            connected: d.googleSync.connected,
            googleEmail: d.googleSync.googleEmail,
            calendars: d.googleSync.calendars,
            lastSyncedTime: d.googleSync.lastSyncedTime
          } : null
        });
      });
      return res.json({ users: list });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found" });

    const userData = userDoc.data();
    const googleSync = userData.googleSync;
    if (!googleSync || !googleSync.connected) {
      return res.json({ connected: false });
    }

    if (req.query.triggerSync === "true") {
      await triggerInitialSync(userId, googleSync);
      return res.json({ success: true, message: "Manual initial sync triggered!" });
    }

    const auth = await getGoogleAuthClient(googleSync);
    const calendar = google.calendar({ version: "v3", auth });

    const primaryCal = await calendar.calendars.get({ calendarId: "primary" });
    const calList = await calendar.calendarList.list();

    const familyIds = userData.families || [];
    let firestoreEvents = [];
    if (familyIds.length > 0) {
      try {
        const eventsSnap = await db.collection("events")
          .where("familyId", "in", familyIds)
          .get();
        eventsSnap.forEach(doc => {
          const data = doc.data();
          firestoreEvents.push({
            id: doc.id,
            title: data.title,
            date: data.date,
            endDate: data.endDate,
            category: data.category,
            relevantTo: data.relevantTo,
            googleEventIds: data.googleEventIds
          });
        });
      } catch (e) {
        firestoreEvents = { error: e.message };
      }
    }

    // Fetch Google Calendar events for all calendars from June 1 to Aug 15 2026
    let googleEventsJune2026 = {};
    try {
      for (const cal of calList.data.items || []) {
        try {
          const gRes = await calendar.events.list({
            calendarId: cal.id,
            timeMin: "2026-06-01T00:00:00Z",
            timeMax: "2026-08-15T00:00:00Z",
            singleEvents: true
          });
          googleEventsJune2026[cal.summary] = (gRes.data.items || []).map(item => ({
            id: item.id,
            summary: item.summary,
            start: item.start,
            end: item.end,
            status: item.status
          }));
        } catch (err) {
          googleEventsJune2026[cal.summary] = { error: err.message };
        }
      }
    } catch (e) {
      googleEventsJune2026 = { error: e.message };
    }

    res.json({
      connected: true,
      googleEmail: googleSync.googleEmail,
      googleSyncData: {
        targetFamilyId: googleSync.targetFamilyId,
        calendars: googleSync.calendars,
        lastSyncedTime: googleSync.lastSyncedTime
      },
      primaryCalendar: {
        id: primaryCal.data.id,
        summary: primaryCal.data.summary,
        timeZone: primaryCal.data.timeZone
      },
      allCalendars: (calList.data.items || []).map(item => ({
        id: item.id,
        summary: item.summary,
        primary: item.primary || false,
        accessRole: item.accessRole
      })),
      googleEventsJune2026: googleEventsJune2026,
      firestoreEventsCount: firestoreEvents.length,
      firestoreEvents: firestoreEvents
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.use("/api", router);
app.use("/", router);

// HTTP Trigger API Function
exports.api = onRequest(app);


// ================= Background Real-Time Push Sync Trigger =================
exports.syncFirestoreToGoogle = onDocumentWritten("events/{eventId}", async (event) => {
  const eventId = event.params.eventId;
  console.log(`[syncFirestoreToGoogle] Triggered for event ${eventId}`);

  const beforeData = event.data.before.exists ? event.data.before.data() : null;
  const afterData = event.data.after.exists ? event.data.after.data() : null;

  const eventData = afterData || beforeData;
  if (!eventData) {
    console.log(`[syncFirestoreToGoogle] No event data found for event ${eventId}`);
    return;
  }

  const currentHash = calculateEventHash(eventData);

  // Load connected users who are candidate sync targets (either directly in relevantTo, or members of the family group)
  const familyId = eventData.familyId;
  const candidateUserIds = new Set(eventData.relevantTo || []);

  if (familyId) {
    const usersSnap = await db.collection("users").where("families", "array-contains", familyId).get();
    usersSnap.forEach(doc => candidateUserIds.add(doc.id));
  }

  console.log(`[syncFirestoreToGoogle] Event: "${eventData.title}", familyId: "${familyId}", candidate users: [${Array.from(candidateUserIds).join(", ")}]`);

  const connectedUsers = [];
  for (const uId of candidateUserIds) {
    const userDoc = await db.collection("users").doc(uId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      const connected = data.googleSync && data.googleSync.connected;
      console.log(`[syncFirestoreToGoogle] Candidate user ${uId} connected state: ${connected}`);
      if (connected) {
        connectedUsers.push({ id: uId, ...data });
      }
    } else {
      console.log(`[syncFirestoreToGoogle] Candidate user doc ${uId} does not exist`);
    }
  }

  if (connectedUsers.length === 0) {
    console.log(`[syncFirestoreToGoogle] No connected users to sync for event ${eventId}`);
    return;
  }

  for (const user of connectedUsers) {
    const userId = user.id;

    // Relevance checking (direct relevance, group-wide relevance, or parent-validated child events)
    let isRelevant = false;
    if (afterData && Array.isArray(afterData.relevantTo)) {
      if (afterData.relevantTo.includes(userId) || afterData.relevantTo.includes("all")) {
        isRelevant = true;
      } else if (familyId) {
        let hasChildInRelevant = false;
        let isDirectParent = false;

        for (const rId of afterData.relevantTo) {
          const memberDoc = await db.collection("users").doc(rId).get();
          if (memberDoc.exists && memberDoc.data().isChild) {
            hasChildInRelevant = true;
            if (memberDoc.data().parentUid === userId) {
              isDirectParent = true;
            }
          }
        }

        if (isDirectParent) {
          isRelevant = true;
        } else if (hasChildInRelevant) {
          const familyDoc = await db.collection("families").doc(familyId).get();
          if (familyDoc.exists) {
            const parents = familyDoc.data().parents;
            if (Array.isArray(parents) && parents.includes(userId)) {
              isRelevant = true;
            }
          }
        }
      }
    }

    console.log(`[syncFirestoreToGoogle] User: ${userId}, isRelevant: ${isRelevant}`);

    const googleEventMap = (eventData.googleEventIds || {})[userId];
    const previousEventId = googleEventMap ? googleEventMap.eventId : null;
    const previousCalendarId = googleEventMap ? googleEventMap.calendarId : null;

    const auth = await getGoogleAuthClient(user.googleSync);
    if (!auth) {
      console.log(`[syncFirestoreToGoogle] Failed to get auth client for user ${userId}`);
      continue;
    }

    const calendar = google.calendar({ version: "v3", auth });

    // Retrieve cached calendar timezone or fetch it dynamically
    let userTimeZone = user.googleSync.timeZone;
    if (!userTimeZone) {
      try {
        const primaryCal = await calendar.calendars.get({ calendarId: "primary" });
        userTimeZone = primaryCal.data.timeZone || "UTC";
        await db.collection("users").doc(userId).update({
          "googleSync.timeZone": userTimeZone
        });
      } catch (e) {
        userTimeZone = "UTC";
      }
    }

    // Decide Calendar target based on routing rules (Option 2 Selective Sync)
    const defaultTargetFamilyId = user.googleSync.targetFamilyId || (user.families && user.families[0]);
    let targetCalendarId = "primary";

    if (familyId) {
      if (familyId === defaultTargetFamilyId) {
        // Shared group events in default group go to secondary calendar, personal/child events go to primary
        let hasOtherNonChildMembers = false;
        if (afterData && Array.isArray(afterData.relevantTo)) {
          if (afterData.relevantTo.includes("all")) {
            hasOtherNonChildMembers = true;
          } else {
            for (const rId of afterData.relevantTo) {
              if (rId !== userId) {
                const memberDoc = await db.collection("users").doc(rId).get();
                if (memberDoc.exists && !memberDoc.data().isChild) {
                  hasOtherNonChildMembers = true;
                  break;
                }
              }
            }
          }
        }
        if (hasOtherNonChildMembers) {
          const mappedId = await ensureFamilyCalendar(userId, user.googleSync, familyId, calendar);
          if (mappedId) targetCalendarId = mappedId;
        } else {
          targetCalendarId = "primary";
        }
      } else {
        // Events in non-default groups go to their respective secondary calendars
        const mappedId = await ensureFamilyCalendar(userId, user.googleSync, familyId, calendar);
        if (mappedId) targetCalendarId = mappedId;
      }
    } else {
      // Personal events go to primary Google Calendar
      targetCalendarId = "primary";
    }

    console.log(`[syncFirestoreToGoogle] User: ${userId}, resolved targetCalendarId: ${targetCalendarId}`);

    // Check if an actual Google Calendar API call is needed for this user
    let needsApiCall = false;
    if (!afterData || !isRelevant) {
      if (previousEventId && previousCalendarId) {
        needsApiCall = true;
      }
    } else {
      if (previousEventId && previousCalendarId && previousCalendarId !== targetCalendarId) {
        needsApiCall = true;
      } else if (previousEventId && previousCalendarId) {
        if (googleEventMap.lastSyncedHash !== currentHash) {
          needsApiCall = true;
        }
      } else {
        needsApiCall = true;
      }
    }

    console.log(`[syncFirestoreToGoogle] User: ${userId}, previousEventId: ${previousEventId}, needsApiCall: ${needsApiCall}`);

    if (needsApiCall) {
      const proceed = await incrementAndCheckCircuitBreaker("push");
      if (!proceed) {
        console.warn(`[CIRCUIT BREAKER] Push aborted for user ${userId}`);
        continue;
      }
    }

    try {
      if (!afterData) {
        // Event deleted from Firestore -> Delete from Google Calendar
        if (previousEventId && previousCalendarId) {
          await calendar.events.delete({ calendarId: previousCalendarId, eventId: previousEventId });
          console.log(`Deleted Google event ${previousEventId} for user ${userId}`);
        }
      } else if (!isRelevant) {
        // Event no longer relevant -> Delete from Google Calendar
        if (previousEventId && previousCalendarId) {
          await calendar.events.delete({ calendarId: previousCalendarId, eventId: previousEventId });
          await db.collection("events").doc(eventId).update({
            [`googleEventIds.${userId}`]: admin.firestore.FieldValue.delete()
          });
        }
      } else {
        // Event updated/inserted -> Sync to Google
        
        // Parse Title using standard formatting
        let title = getGoogleEventDisplayTitle(eventData);
        const childMembers = [];
        if (!eventData.relevantTo.includes("all")) {
          for (const rId of eventData.relevantTo) {
            if (rId !== userId) {
              const memberDoc = await db.collection("users").doc(rId).get();
              if (memberDoc.exists && memberDoc.data().isChild) {
                childMembers.push(memberDoc.data().name || rId);
              }
            }
          }
        }
        if (targetCalendarId === "primary" && childMembers.length > 0) {
          title = `[${childMembers.join(", ")}] ${title}`;
        }

        // Parse Description (Include full list of participants)
        let description = eventData.description || "";
        const participantsNames = [];
        if (eventData.relevantTo.includes("all")) {
          participantsNames.push("Everyone");
        } else {
          for (const rId of eventData.relevantTo) {
            const memberDoc = await db.collection("users").doc(rId).get();
            if (memberDoc.exists) {
              participantsNames.push(memberDoc.data().name || rId);
            }
          }
        }
        if (participantsNames.length > 0) {
          description = `${description}\n\nFamily Members: ${participantsNames.join(", ")}`.trim();
        }

        // Configure exclusive dates for Google Calendar's all-day format
        let startDateTime = {};
        let endDateTime = {};
        const isAllDay = eventData.category === "flight" || 
                        eventData.category === "school_vacation" || 
                        eventData.category === "family_vacation" ||
                        (eventData.category === "regular" && eventData.endDate && eventData.endDate !== eventData.date) ||
                        (eventData.category === "regular" && !eventData.startTime && !eventData.endTime);

        if (isAllDay) {
          startDateTime = { date: eventData.date };
          const endStr = eventData.category === "flight" ? (eventData.flightRetDate || eventData.date) : (eventData.endDate || eventData.date);
          const endDateObj = new Date(endStr);
          endDateObj.setDate(endDateObj.getDate() + 1);
          const endDateStr = endDateObj.toISOString().split("T")[0];
          endDateTime = { date: endDateStr };
        } else {
          startDateTime = { dateTime: `${eventData.date}T${eventData.startTime || "00:00"}:00`, timeZone: userTimeZone };
          endDateTime = { dateTime: `${eventData.endDate || eventData.date}T${eventData.endTime || "00:00"}:00`, timeZone: userTimeZone };
        }

        const googleEventResource = {
          summary: title,
          description: description,
          start: startDateTime,
          end: endDateTime
        };

        if (previousEventId && previousCalendarId && previousCalendarId !== targetCalendarId) {
          // Calendar changed -> Delete old and create new
          try {
            await calendar.events.delete({ calendarId: previousCalendarId, eventId: previousEventId });
          } catch (e) {
            console.warn(`Could not remove event from old calendar:`, e.message);
          }
          
          const insertRes = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: googleEventResource
          });
          
          await db.collection("events").doc(eventId).update({
            [`googleEventIds.${userId}`]: {
              calendarId: targetCalendarId,
              eventId: insertRes.data.id,
              lastSyncedHash: currentHash
            }
          });
          console.log(`Moved event to new calendar ${targetCalendarId} for user ${userId}`);
        } else if (previousEventId && previousCalendarId) {
          // Standard Update
          if (googleEventMap.lastSyncedHash === currentHash) {
            console.log(`Skipping event ${eventId} update (already synced)`);
            continue;
          }

          await calendar.events.update({
            calendarId: previousCalendarId,
            eventId: previousEventId,
            requestBody: googleEventResource
          });

          await db.collection("events").doc(eventId).update({
            [`googleEventIds.${userId}.lastSyncedHash`]: currentHash
          });
          console.log(`Updated Google event ${previousEventId} for user ${userId}`);
        } else {
          // Standard New Insert
          const insertRes = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: googleEventResource
          });

          await db.collection("events").doc(eventId).update({
            [`googleEventIds.${userId}`]: {
              calendarId: targetCalendarId,
              eventId: insertRes.data.id,
              lastSyncedHash: currentHash
            }
          });
          console.log(`Inserted new Google event for user ${userId}`);
        }
      }
    } catch (e) {
      console.error(`Failed to sync event ${eventId} for user ${userId}:`, e);
    }
  }
});


// ================= Background Scheduled Pull Sync Trigger (Google-to-Firestore) =================
exports.syncGoogleToFirestore = onSchedule("every 5 minutes", async (event) => {
  console.log("Running Google Calendar pull sync...");
  
  // Load connected users
  const usersSnap = await db.collection("users").get();
  const connectedUsers = [];
  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.googleSync && data.googleSync.connected) {
      connectedUsers.push({ id: doc.id, ...data });
    }
  });

  if (connectedUsers.length === 0) return;

  // Run the daily cost limit circuit breaker
  const proceed = await incrementAndCheckCircuitBreaker("pull");
  if (!proceed) return;

  for (const user of connectedUsers) {
    const userId = user.id;
    const auth = await getGoogleAuthClient(user.googleSync);
    if (!auth) continue;

    const calendar = google.calendar({ version: "v3", auth });
    
    // Retrieve cached calendar timezone or fetch it dynamically
    let userTimeZone = user.googleSync.timeZone;
    if (!userTimeZone) {
      try {
        const primaryCal = await calendar.calendars.get({ calendarId: "primary" });
        userTimeZone = primaryCal.data.timeZone || "UTC";
        await db.collection("users").doc(userId).update({
          "googleSync.timeZone": userTimeZone
        });
      } catch (e) {
        userTimeZone = "UTC";
      }
    }

    const userFamiliesList = user.families || [];
    const targetFamilyId = user.googleSync.targetFamilyId || (user.families && user.families[0]);
    const calendarsToSync = [
      { id: "primary", type: "primary", familyId: targetFamilyId }
    ];
    for (const fId of Object.keys(user.googleSync.calendars || {})) {
      calendarsToSync.push({
        id: user.googleSync.calendars[fId],
        type: "family",
        familyId: fId
      });
    }

    // Auto-detect and sync personal secondary calendars matching the syncing user's name only
    try {
      const memberName = user.name;
      if (memberName) {
        const calList = await calendar.calendarList.list();
        const googleCalendars = calList.data.items || [];

        const matchedCal = googleCalendars.find(c => {
          const summary = c.summary;
          if (!summary) return false;
          const calName = summary.trim().toLowerCase();
          const memName = memberName.trim().toLowerCase();
          const firstWord = memName.split(/\s+/)[0];
          return calName === memName || calName === firstWord;
        });

        if (matchedCal && matchedCal.id !== "primary" && !Object.values(user.googleSync.calendars || {}).includes(matchedCal.id)) {
          // Avoid duplicate calendars in sync list
          if (!calendarsToSync.some(c => c.id === matchedCal.id)) {
            calendarsToSync.push({
              id: matchedCal.id,
              type: "member",
              familyId: targetFamilyId,
              memberUserId: userId
            });
            console.log(`[SYNC RUN] Detected secondary calendar "${matchedCal.summary}" for user "${memberName}". Adding to sync list.`);
          }
        }
      }
    } catch (err) {
      console.error("[SYNC RUN] Failed to auto-detect user secondary calendars:", err);
    }

    const lastSyncedTime = user.googleSync.lastSyncedTime || new Date(Date.now() - 10 * 60 * 1000).toISOString();

    for (const cal of calendarsToSync) {
      if (!cal.id) continue;

      try {
        const threeYearsAgo = new Date();
        threeYearsAgo.setDate(threeYearsAgo.getDate() - 3 * 365);
        const timeMin = threeYearsAgo.toISOString();

        const oneYearFromNow = new Date();
        oneYearFromNow.setDate(oneYearFromNow.getDate() + 365);
        const timeMax = oneYearFromNow.toISOString();

        let nextPageToken = null;
        const googleEvents = [];
        do {
          const eventsRes = await calendar.events.list({
            calendarId: cal.id,
            updatedMin: lastSyncedTime,
            timeMin: timeMin,
            timeMax: timeMax,
            showDeleted: true,
            singleEvents: true,
            pageToken: nextPageToken || undefined
          });
          googleEvents.push(...(eventsRes.data.items || []));
          nextPageToken = eventsRes.data.nextPageToken;
        } while (nextPageToken);

        const processGoogleEvent = async (gEvent) => {
          const googleEventId = gEvent.id;
          const isDeleted = gEvent.status === "cancelled";

          const eventQuery = await db.collection("events")
            .where(`googleEventIds.${userId}.eventId`, "==", googleEventId)
            .get();

          let firestoreEventDoc = null;
          let firestoreEventData = null;

          if (!eventQuery.empty) {
            firestoreEventDoc = eventQuery.docs[0];
            firestoreEventData = firestoreEventDoc.data();
          }

          if (isDeleted) {
            if (firestoreEventDoc) {
              await db.collection("events").doc(firestoreEventDoc.id).delete();
              console.log(`Deleted Firestore event ${firestoreEventDoc.id} due to Google deletion.`);
            }
          } else {
            // Event created or updated in Google Calendar
            
            // Clean bracketed prefixes from child events
            let title = gEvent.summary || "No Title";
            let parsedTitle = title;
            const childPrefixRegex = /^\[([^\]]+)\]\s*(.*)$/;
            const match = childPrefixRegex.exec(title);
            if (match) {
              parsedTitle = match[2];
            }

            // Clean participant list from Google descriptions
            let description = gEvent.description || "";
            description = description.replace(/\s*Family\s+Members:\s*.*$/gi, "").trim();

            let date = "";
            let endDate = "";
            let startTime = "";
            let endTime = "";

            if (gEvent.start.date) {
              date = gEvent.start.date;
              const endObj = new Date(gEvent.end.date);
              endObj.setDate(endObj.getDate() - 1);
              endDate = endObj.toISOString().split("T")[0];
            } else {
              const startDateTime = new Date(gEvent.start.dateTime);
              const endDateTime = new Date(gEvent.end.dateTime);
              
              date = formatInTimeZone(startDateTime, userTimeZone, "date");
              endDate = formatInTimeZone(endDateTime, userTimeZone, "date");
              startTime = formatInTimeZone(startDateTime, userTimeZone, "time");
              endTime = formatInTimeZone(endDateTime, userTimeZone, "time");
            }

            // Determine event relevance
            let relevantTo = [userId];
            const targetFamilyId = cal.familyId || user.googleSync.targetFamilyId || user.families[0];
            
            if (cal.type === "family" && targetFamilyId) {
              relevantTo = ["all"];
            } else if (cal.type === "primary" && targetFamilyId) {
              let childUserId = null;
              if (match) {
                const childName = match[1].toLowerCase();
                const membersSnap = await db.collection("users")
                  .where("families", "array-contains", targetFamilyId)
                  .get();
                for (const memberDoc of membersSnap.docs) {
                  const memberData = memberDoc.data();
                  if (memberData.isChild && memberData.name && memberData.name.toLowerCase() === childName) {
                    childUserId = memberDoc.id;
                    break;
                  }
                }
              }
              if (childUserId) {
                relevantTo = [childUserId];
              } else {
                relevantTo = [userId];
              }
            } else if (cal.type === "member") {
              relevantTo = [cal.memberUserId];
            }

            // Identify Category
            let category = "regular";
            const lowerTitle = title.toLowerCase();
            if (lowerTitle.includes("✈️") || lowerTitle.includes("flight")) {
              category = "flight";
            } else if (lowerTitle.includes("🎒") || lowerTitle.includes("school vacation")) {
              category = "school_vacation";
            } else if (lowerTitle.includes("🏖️") || lowerTitle.includes("family vacation")) {
              category = "family_vacation";
            }

            // Safety merge existing Firestore metadata
            if (firestoreEventDoc && firestoreEventData.category) {
              if (category === "regular" && firestoreEventData.category !== "regular") {
                category = firestoreEventData.category;
              }
            }

            if (category === "school_vacation" && parsedTitle.startsWith("🎒 ")) {
              parsedTitle = parsedTitle.substring(2);
            } else if (category === "family_vacation" && parsedTitle.startsWith("🏖️ ")) {
              parsedTitle = parsedTitle.substring(2);
            }

            const eventPayload = {
              familyId: firestoreEventDoc ? (firestoreEventData.familyId || targetFamilyId || null) : (targetFamilyId || null),
              createdBy: firestoreEventDoc ? (firestoreEventData.createdBy || userId) : userId,
              title: parsedTitle,
              description,
              date,
              endDate: endDate,
              startTime,
              endTime,
              category,
              relevantTo: firestoreEventDoc ? (firestoreEventData.relevantTo || relevantTo) : relevantTo
            };

            if (gEvent.recurringEventId) {
              eventPayload.recurrenceId = gEvent.recurringEventId;
            }

            // Merge flight details if category is flight
            if (category === "flight") {
              eventPayload.flightDepDate = date;
              eventPayload.flightRetDate = endDate;
              eventPayload.flightDestination = firestoreEventDoc ? (firestoreEventData.flightDestination || parsedTitle) : parsedTitle;
              eventPayload.flightPassengers = firestoreEventDoc ? (firestoreEventData.flightPassengers || "") : "";
              eventPayload.flightBookingRef = firestoreEventDoc ? (firestoreEventData.flightBookingRef || "") : "";
              eventPayload.flightDepTakeoff = firestoreEventDoc ? (firestoreEventData.flightDepTakeoff || startTime || "00:00") : (startTime || "00:00");
              eventPayload.flightDepLanding = firestoreEventDoc ? (firestoreEventData.flightDepLanding || endTime || "00:00") : (endTime || "00:00");
              eventPayload.flightRetOff = firestoreEventDoc ? (firestoreEventData.flightRetTakeoff || "") : "";
              eventPayload.flightRetTakeoff = firestoreEventDoc ? (firestoreEventData.flightRetTakeoff || "") : "";
              eventPayload.flightRetLanding = firestoreEventDoc ? (firestoreEventData.flightRetLanding || "") : "";

              if (!firestoreEventDoc) {
                let clean = title.replace(/^✈️\s*/, "");
                if (clean.includes(",")) {
                  const parts = clean.split(",");
                  eventPayload.flightDestination = parts[0].trim();
                  eventPayload.flightPassengers = parts.slice(1).join(",").trim();
                } else {
                  eventPayload.flightDestination = clean.trim();
                }
                eventPayload.title = eventPayload.flightDestination || "Flight";
              }
            }

            // Deduplicate in memory by content if not found by googleEventId
            if (!firestoreEventDoc) {
              const isAllDay = !!gEvent.start.date;
              const dateQuery = await db.collection("events")
                .where("date", "==", date)
                .get();
              
              for (const doc of dateQuery.docs) {
                const docData = doc.data();
                
                // Match title (case-insensitive)
                const titleMatches = (docData.title || "").trim().toLowerCase() === eventPayload.title.trim().toLowerCase();
                if (!titleMatches) continue;

                // Match category
                if (docData.category !== eventPayload.category) continue;

                // Match familyId
                const familyMatches = docData.familyId === eventPayload.familyId;
                if (!familyMatches) continue;

                // Match all-day status
                const docIsAllDay = docData.category === "flight" || 
                                    docData.category === "school_vacation" || 
                                    docData.category === "family_vacation" ||
                                    (docData.category === "regular" && docData.endDate && docData.endDate !== docData.date) ||
                                    (docData.category === "regular" && !docData.startTime && !docData.endTime);
                if (isAllDay !== docIsAllDay) continue;

                // Match times if regular and not all-day
                if (eventPayload.category === "regular" && !isAllDay) {
                  if (docData.startTime !== eventPayload.startTime || docData.endTime !== eventPayload.endTime) {
                    continue;
                  }
                }

                // Found a match!
                firestoreEventDoc = doc;
                firestoreEventData = docData;
                break;
              }
            }

            const importedHash = calculateEventHash(eventPayload);

            if (firestoreEventDoc) {
              const previousHash = firestoreEventData.googleEventIds && firestoreEventData.googleEventIds[userId]
                ? firestoreEventData.googleEventIds[userId].lastSyncedHash
                : null;
              if (previousHash === importedHash) {
                return;
              }

              const updateData = {
                title: eventPayload.title,
                description,
                date,
                endDate: eventPayload.endDate,
                startTime,
                endTime,
                category,
                [`googleEventIds.${userId}`]: {
                  calendarId: cal.id,
                  eventId: googleEventId,
                  lastSyncedHash: importedHash
                }
              };

              if (eventPayload.recurrenceId) {
                updateData.recurrenceId = eventPayload.recurrenceId;
              }

              if (category === "flight") {
                updateData.flightDepDate = eventPayload.flightDepDate;
                updateData.flightRetDate = eventPayload.flightRetDate;
                updateData.flightDestination = eventPayload.flightDestination;
                updateData.flightPassengers = eventPayload.flightPassengers;
                updateData.flightBookingRef = eventPayload.flightBookingRef;
                updateData.flightDepTakeoff = eventPayload.flightDepTakeoff;
                updateData.flightDepLanding = eventPayload.flightDepLanding;
                updateData.flightRetTakeoff = eventPayload.flightRetTakeoff;
                updateData.flightRetLanding = eventPayload.flightRetLanding;
              }

              await db.collection("events").doc(firestoreEventDoc.id).update(updateData);
              console.log(`Updated Firestore event ${firestoreEventDoc.id} from Google.`);
            } else {
              eventPayload.googleEventIds = {
                [userId]: {
                  calendarId: cal.id,
                  eventId: googleEventId,
                  lastSyncedHash: importedHash
                }
              };

              const newDocRef = await db.collection("events").add(eventPayload);
              console.log(`Imported new Google event as Firestore document: ${newDocRef.id}`);
            }
          }
        };

        // Process events in parallel chunks of 15
        const chunkSize = 15;
        for (let i = 0; i < googleEvents.length; i += chunkSize) {
          const chunk = googleEvents.slice(i, i + chunkSize);
          await Promise.all(chunk.map(event => processGoogleEvent(event)));
        }

      } catch (err) {
        console.error(`Google Calendar pull failed for user ${userId}:`, err);
      }
    }

    await db.collection("users").doc(userId).update({
      "googleSync.lastSyncedTime": new Date().toISOString()
    });
  }
});

// ================= Background Family Role Update Sync Trigger =================
exports.syncFamilyChange = onDocumentWritten("families/{familyId}", async (event) => {
  const beforeData = event.data.before.exists ? event.data.before.data() : null;
  const afterData = event.data.after.exists ? event.data.after.data() : null;
  if (!afterData) return; // deleted family

  // Check if parents list changed
  const beforeParents = (beforeData && beforeData.parents) || [];
  const afterParents = afterData.parents || [];
  const parentsChanged = beforeParents.length !== afterParents.length || 
                         beforeParents.some(p => !afterParents.includes(p)) ||
                         afterParents.some(p => !beforeParents.includes(p));

  if (!parentsChanged) return;

  const familyId = event.params.familyId;
  console.log(`[FAMILY CHANGE] Parents list changed for family ${familyId}. Triggering sync for members.`);

  const usersSnap = await db.collection("users").where("families", "array-contains", familyId).get();

  for (const doc of usersSnap.docs) {
    const userData = doc.data();
    if (userData.googleSync && userData.googleSync.connected) {
      console.log(`[FAMILY CHANGE] Triggering initial sync for connected user ${doc.id}`);
      try {
        await triggerInitialSync(doc.id, userData.googleSync);
      } catch (err) {
        console.error(`[FAMILY CHANGE] Initial sync failed for user ${doc.id}:`, err);
      }
    }
  }
});
