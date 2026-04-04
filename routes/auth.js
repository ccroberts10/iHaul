const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');

router.post('/register', async (req, res) => {
  const { name, email, phone, password, vehicle_type, vehicle_description, haul_types } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const haulArr = haul_types ? JSON.stringify(haul_types) : '["envelope","small_box","medium_box"]';
  db.prepare(`INSERT INTO users (id, name, email, phone, password_hash, vehicle_type, vehicle_description, haul_types)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name, email, phone || null, hash, vehicle_type || null, vehicle_description || null, haulArr);
  req.session.userId = id;
  req.session.userName = name;
  res.json({ success: true, userId: id, name });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ success: true, userId: user.id, name: user.name });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = db.prepare('SELECT id, name, email, phone, vehicle_type, vehicle_description, haul_types, rating_total, rating_count, background_check FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.haul_types = JSON.parse(user.haul_types || '[]');
  user.avg_rating = user.rating_count > 0 ? (user.rating_total / user.rating_count).toFixed(1) : null;
  res.json(user);
});

module.exports = router;
