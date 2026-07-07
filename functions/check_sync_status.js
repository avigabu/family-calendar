const admin = require('firebase-admin');

process.env.GCLOUD_PROJECT = 'kinship-14ac4';
admin.initializeApp({
  projectId: 'kinship-14ac4'
});

const db = admin.firestore();

async function run() {
  try {
    const usersSnap = await db.collection("users").get();
    console.log(`Total users in DB: ${usersSnap.size}`);
    
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`\nUser ID: ${doc.id}`);
      console.log(`  Name: ${data.name}`);
      console.log(`  Email: ${data.email}`);
      console.log(`  IsChild: ${data.isChild}`);
      console.log(`  Families: ${JSON.stringify(data.families)}`);
      if (data.googleSync) {
        console.log(`  GoogleSync:`);
        console.log(`    Connected: ${data.googleSync.connected}`);
        console.log(`    GoogleEmail: ${data.googleSync.googleEmail}`);
        console.log(`    TargetFamilyId: ${data.googleSync.targetFamilyId}`);
        console.log(`    Calendars: ${JSON.stringify(data.googleSync.calendars)}`);
        console.log(`    LastSyncedTime: ${data.googleSync.lastSyncedTime}`);
      } else {
        console.log(`  GoogleSync: null`);
      }
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
