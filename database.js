const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Default seeding data
const defaultSalt1 = crypto.randomBytes(16).toString('hex');
const defaultSalt2 = crypto.randomBytes(16).toString('hex');
const defaultSalt3 = crypto.randomBytes(16).toString('hex');
const defaultSalt4 = crypto.randomBytes(16).toString('hex');

const initialData = {
  users: [
    {
      id: 'usr_sarah',
      username: 'sarah',
      passwordHash: hashPassword('password123', defaultSalt1),
      salt: defaultSalt1,
      name: 'Sarah (Mom)',
      familyId: 'fam_adams',
      color: '#ec4899' // Pink/Sunset
    },
    {
      id: 'usr_john',
      username: 'john',
      passwordHash: hashPassword('password123', defaultSalt2),
      salt: defaultSalt2,
      name: 'John (Dad)',
      familyId: 'fam_adams',
      color: '#3b82f6' // Blue
    },
    {
      id: 'usr_leo',
      username: 'leo',
      passwordHash: hashPassword('password123', defaultSalt3),
      salt: defaultSalt3,
      name: 'Leo (Son)',
      familyId: 'fam_adams',
      color: '#10b981' // Emerald
    },
    {
      id: 'usr_maya',
      username: 'maya',
      passwordHash: hashPassword('password123', defaultSalt4),
      salt: defaultSalt4,
      name: 'Maya (Daughter)',
      familyId: 'fam_adams',
      color: '#f59e0b' // Amber
    }
  ],
  families: [
    {
      id: 'fam_adams',
      name: 'Adams Family',
      inviteCode: 'ADAMS123'
    }
  ],
  events: []
};

// Seed some initial events dynamically for current week so they appear relative to "today"
const today = new Date();
const formatOffsetDate = (offsetDays) => {
  const d = new Date(today);
  d.setDate(today.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

initialData.events = [
  {
    id: 'evt_1',
    familyId: 'fam_adams',
    createdBy: 'usr_sarah',
    title: 'Weekly Family Dinner 🍽️',
    description: 'Sunday night dinner. Everyone must attend!',
    date: formatOffsetDate(-today.getDay()), // Sunday of the current week
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
    date: formatOffsetDate(2 - today.getDay()), // Tuesday of current week
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
    date: formatOffsetDate(3 - today.getDay()), // Wednesday of current week
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
    date: formatOffsetDate(4 - today.getDay()), // Thursday of current week
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
    date: formatOffsetDate(5 - today.getDay()), // Friday of current week
    startTime: '20:00',
    endTime: '22:30',
    category: 'fun',
    relevantTo: ['usr_sarah', 'usr_john']
  }
];

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

class Database {
  constructor() {
    this.data = { users: [], families: [], events: [] };
    this.init();
  }

  init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
      this.data = initialData;
      this.save();
    } else {
      try {
        const fileContent = fs.readFileSync(DB_PATH, 'utf8');
        this.data = JSON.parse(fileContent);
      } catch (err) {
        console.error('Failed to read database, resetting to seed data.', err);
        this.data = initialData;
        this.save();
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write database file', err);
    }
  }

  // Users CRUD
  getUsers() {
    return this.data.users;
  }

  getUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  getUserByUsername(username) {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  createUser(username, password, name, color, familyId = null) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const newUser = {
      id: 'usr_' + crypto.randomUUID(),
      username,
      passwordHash,
      salt,
      name,
      color: color || '#3b82f6',
      familyId
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  updateUserFamily(userId, familyId) {
    const user = this.getUserById(userId);
    if (user) {
      user.familyId = familyId;
      this.save();
      return user;
    }
    return null;
  }

  // Families CRUD
  getFamilies() {
    return this.data.families;
  }

  getFamilyById(id) {
    return this.data.families.find(f => f.id === id);
  }

  getFamilyByInviteCode(code) {
    return this.data.families.find(f => f.inviteCode.toUpperCase() === code.toUpperCase());
  }

  createFamily(name) {
    // Generate a random uppercase alphanumeric code
    const inviteCode = 'FAM-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const newFamily = {
      id: 'fam_' + crypto.randomUUID(),
      name,
      inviteCode
    };
    this.data.families.push(newFamily);
    this.save();
    return newFamily;
  }

  // Events CRUD
  getEventsByFamily(familyId) {
    return this.data.events.filter(e => e.familyId === familyId);
  }

  createEvent(familyId, createdBy, title, description, date, startTime, endTime, category, relevantTo) {
    const newEvent = {
      id: 'evt_' + crypto.randomUUID(),
      familyId,
      createdBy,
      title,
      description,
      date,
      startTime,
      endTime,
      category: category || 'other',
      relevantTo: Array.isArray(relevantTo) ? relevantTo : [createdBy]
    };
    this.data.events.push(newEvent);
    this.save();
    return newEvent;
  }

  updateEvent(eventId, familyId, updates) {
    const eventIndex = this.data.events.findIndex(e => e.id === eventId && e.familyId === familyId);
    if (eventIndex !== -1) {
      const existing = this.data.events[eventIndex];
      this.data.events[eventIndex] = {
        ...existing,
        title: updates.title !== undefined ? updates.title : existing.title,
        description: updates.description !== undefined ? updates.description : existing.description,
        date: updates.date !== undefined ? updates.date : existing.date,
        startTime: updates.startTime !== undefined ? updates.startTime : existing.startTime,
        endTime: updates.endTime !== undefined ? updates.endTime : existing.endTime,
        category: updates.category !== undefined ? updates.category : existing.category,
        relevantTo: updates.relevantTo !== undefined ? updates.relevantTo : existing.relevantTo
      };
      this.save();
      return this.data.events[eventIndex];
    }
    return null;
  }

  deleteEvent(eventId, familyId) {
    const index = this.data.events.findIndex(e => e.id === eventId && e.familyId === familyId);
    if (index !== -1) {
      this.data.events.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  verifyPassword(user, password) {
    const hash = hashPassword(password, user.salt);
    return user.passwordHash === hash;
  }
}

module.exports = new Database();
