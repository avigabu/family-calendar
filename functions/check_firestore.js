const admin = require('firebase-admin');

process.env.GCLOUD_PROJECT = 'kinship-14ac4';
admin.initializeApp({
  projectId: 'kinship-14ac4'
});

const db = admin.firestore();

async function run() {
  try {
    const titlesToSearch = [
      "Termin",
      "פיזיאותרפיה",
      "יולי שיעור",
      "וידאו",
      "מילואים עם מנבית",
      "סופי יום הולדת",
      "test kid ev",
      "דיאנה ופיי",
      "מפגש תכנון שבועי",
      "6.63 וידאו",
      "יולי שני"
    ];

    console.log("Searching Firestore events...");
    const eventsSnap = await db.collection("events").get();
    let foundCount = 0;
    
    eventsSnap.forEach(doc => {
      const data = doc.data();
      const title = data.title || "";
      const match = titlesToSearch.some(t => title.toLowerCase().includes(t.toLowerCase()));
      if (match) {
        foundCount++;
        console.log(`Match Found:`);
        console.log(`  Document ID: ${doc.id}`);
        console.log(`  Title: ${data.title}`);
        console.log(`  Date: ${data.date}`);
        console.log(`  EndDate: ${data.endDate}`);
        console.log(`  Category: ${data.category}`);
        console.log(`  RelevantTo: ${JSON.stringify(data.relevantTo)}`);
        console.log(`  GoogleEventIds: ${JSON.stringify(data.googleEventIds)}`);
      }
    });

    console.log(`Search completed. Found ${foundCount} matches out of ${eventsSnap.size} total events.`);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
