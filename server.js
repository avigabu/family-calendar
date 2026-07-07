const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory session token store: token -> { userId }
const activeSessions = {};

// Helper to generate a secure session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No session token provided.' });
  }

  const token = authHeader.substring(7);
  const session = activeSessions[token];

  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid. Please login again.' });
  }

  const user = db.getUserById(session.userId);
  if (!user) {
    delete activeSessions[token];
    return res.status(401).json({ error: 'User no longer exists.' });
  }

  req.user = user;
  req.userId = user.id;
  req.familyId = user.familyId;
  req.token = token;
  next();
}

// ================= AUTHENTICATION ENDPOINTS =================

// Register a new user
app.post('/api/auth/register', (req, res) => {
  const { username, password, name, color } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password, and name are required.' });
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  try {
    const user = db.createUser(username, password, name, color);
    const token = generateToken();
    activeSessions[token] = { userId: user.id };

    // Don't return hashes in response
    const { passwordHash, salt, ...safeUser } = user;
    res.status(201).json({ token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = db.getUserByUsername(username);
  if (!user || !db.verifyPassword(user, password)) {
    return res.status(400).json({ error: 'Invalid username or password.' });
  }

  const token = generateToken();
  activeSessions[token] = { userId: user.id };

  const { passwordHash, salt, ...safeUser } = user;
  
  let family = null;
  if (user.familyId) {
    family = db.getFamilyById(user.familyId);
  }

  res.json({ token, user: safeUser, family });
});

// Logout
app.post('/api/auth/logout', authenticate, (req, res) => {
  delete activeSessions[req.token];
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Get current user profile
app.get('/api/auth/me', authenticate, (req, res) => {
  const { passwordHash, salt, ...safeUser } = req.user;
  let family = null;
  if (req.familyId) {
    family = db.getFamilyById(req.familyId);
  }
  res.json({ user: safeUser, family });
});

// ================= FAMILY MANAGEMENT ENDPOINTS =================

// Create a new family group
app.post('/api/family/create', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Family name is required.' });
  }

  const family = db.createFamily(name);
  const updatedUser = db.updateUserFamily(req.userId, family.id);

  res.status(201).json({ family, user: updatedUser });
});

// Join an existing family group via invite code
app.post('/api/family/join', authenticate, (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) {
    return res.status(400).json({ error: 'Invite code is required.' });
  }

  const family = db.getFamilyByInviteCode(inviteCode.trim());
  if (!family) {
    return res.status(400).json({ error: 'Invalid invite code. Please check and try again.' });
  }

  const updatedUser = db.updateUserFamily(req.userId, family.id);
  res.json({ family, user: updatedUser });
});

// Get all members of user's family
app.get('/api/family/members', authenticate, (req, res) => {
  if (!req.familyId) {
    return res.json({ members: [] });
  }

  const allUsers = db.getUsers();
  const members = allUsers
    .filter(u => u.familyId === req.familyId)
    .map(({ passwordHash, salt, username, ...safeUser }) => safeUser);

  res.json({ members });
});

// Add member directly from dashboard (invitation shortcut helper)
app.post('/api/family/add-member', authenticate, (req, res) => {
  const { username, password, name, color } = req.body;

  if (!req.familyId) {
    return res.status(400).json({ error: 'You must belong to a family group to add members.' });
  }

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Username, password, and name are required.' });
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  try {
    const newUser = db.createUser(username, password, name, color, req.familyId);
    const { passwordHash, salt, ...safeUser } = newUser;
    res.status(201).json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create family member account.' });
  }
});

// ================= CALENDAR EVENTS ENDPOINTS =================

// Get events for user's family (filtered by creator or relevance)
app.get('/api/events', authenticate, (req, res) => {
  if (!req.familyId) {
    return res.json({ events: [] });
  }

  const allFamilyEvents = db.getEventsByFamily(req.familyId);
  
  // Requirement: User sees what they created OR what others marked as relevant to them
  const visibleEvents = allFamilyEvents.filter(e => {
    const isCreator = e.createdBy === req.userId;
    const isRelevant = Array.isArray(e.relevantTo) && e.relevantTo.includes(req.userId);
    return isCreator || isRelevant;
  });

  res.json({ events: visibleEvents });
});

// Create a new event
app.post('/api/events', authenticate, (req, res) => {
  const { title, description, date, startTime, endTime, category, relevantTo } = req.body;

  if (!req.familyId) {
    return res.status(400).json({ error: 'You must belong to a family group to create events.' });
  }

  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Title, date, start time, and end time are required.' });
  }

  const newEvent = db.createEvent(
    req.familyId,
    req.userId,
    title,
    description,
    date,
    startTime,
    endTime,
    category,
    relevantTo
  );

  res.status(201).json({ event: newEvent });
});

// Update an event
app.put('/api/events/:id', authenticate, (req, res) => {
  const eventId = req.params.id;
  const { title, description, date, startTime, endTime, category, relevantTo } = req.body;

  if (!req.familyId) {
    return res.status(400).json({ error: 'You must belong to a family group to update events.' });
  }

  const updatedEvent = db.updateEvent(eventId, req.familyId, {
    title,
    description,
    date,
    startTime,
    endTime,
    category,
    relevantTo
  });

  if (!updatedEvent) {
    return res.status(404).json({ error: 'Event not found or access denied.' });
  }

  res.json({ event: updatedEvent });
});

// Delete an event
app.delete('/api/events/:id', authenticate, (req, res) => {
  const eventId = req.params.id;

  if (!req.familyId) {
    return res.status(400).json({ error: 'You must belong to a family group to delete events.' });
  }

  const deleted = db.deleteEvent(eventId, req.familyId);
  if (!deleted) {
    return res.status(404).json({ error: 'Event not found or access denied.' });
  }

  res.json({ success: true, message: 'Event deleted successfully.' });
});

// Default catch-all to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Family Calendar server running on http://localhost:${PORT}`);
});
