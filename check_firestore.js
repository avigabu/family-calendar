const admin = require('firebase-admin');

// Initialize Firebase Admin using default credentials (uses active CLI credentials)
process.env.GCLOUD_PROJECT = 'kinship-14ac4';
admin.initializeApp({
  projectId: 'kinship-14ac4'
});

const db = admin.firestore();

async function run() {
  try {
    console.log("Fetching users...");
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`User ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email || data.googleSync?.googleEmail}`);
      console.log(`  Families: ${JSON.stringify(data.families)}`);
      if (data.googleSync) {
        console.log(`  Google Sync:`);
        console.log(`    Connected: ${data.googleSync.connected}`);
        console.log(`    Email: ${data.googleSync.googleEmail}`);
        console.log(`    TargetFamilyId: ${data.googleSync.targetFamilyId}`);
        console.log(`    Calendars: ${JSON.stringify(data.googleSync.calendars)}`);
        console.log(`    LastSyncedTime: ${data.googleSync.lastSyncedTime}`);
      } else {
        console.log(`  Google Sync: not connected`);
      }
    });

    console.log("\nFetching events (first 5)...");
    const eventsSnap = await db.collection("events").limit(5).get();
    eventsSnap.forEach(doc => {
      const data = doc.data();
      console.log(`Event ID: ${doc.id}`);
      console.log(`  Title: ${data.title}`);
      console.log(`  Date: ${data.date}`);
      console.log(`  EndDate: ${data.endDate}`);
      console.log(`  Category: ${data.category}`);
      console.log(`  RelevantTo: ${JSON.stringify(data.relevantTo)}`);
      console.log(`  GoogleEventIds: ${JSON.stringify(data.googleEventIds)}`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
