const fs = require('fs');

const filePath = 'logs_utf8.txt';
if (!fs.existsSync(filePath)) {
  console.log("logs_utf8.txt does not exist");
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

const idsToSearch = [
  "n8unqt9nct1pre8lh81l0nc1uvu56lcqhjje6elq1gdn8nj8glo1enco82", // סופי יום הולדת
  "snroqogbedkm5s2seshaakcd9poqvhjhsnj0", // יהלי שיעור
  "n7rcai6mmipg57gnt1tqhsaan4hs2uuj", // מילאנו עם מכבית ודיאנה
  "o0mrn9ha5g07cmrrnrl3nd6oari9im0a", // דיאנה ומייקל בציריך
  "api:",
  "Failed to pull",
  "Imported Google event"
];

lines.forEach(line => {
  const match = idsToSearch.some(id => line.includes(id));
  if (match) {
    console.log(line);
  }
});
