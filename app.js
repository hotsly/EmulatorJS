const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_FOLDER = path.join(__dirname, 'games');
const LIBRARY_FILE = path.join(__dirname, 'game_library.json');
const SESSION_SECRET = 'your-very-secret-key'; // CHANGE THIS!

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates')); // Adjust if your HTML is elsewhere

// Session config
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Upload config
const upload = multer({ dest: UPLOAD_FOLDER, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

function loadLibrary() {
  if (fs.existsSync(LIBRARY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
    } catch {
      return { consoles: {} };
    }
  }
  return { consoles: {} };
}

function saveLibrary(data) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(data, null, 2));
}

function ensureDirectories() {
  if (!fs.existsSync(UPLOAD_FOLDER)) fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
  const library = loadLibrary();
  Object.keys(library.consoles || {}).forEach(console_id => {
    const consoleDir = path.join(UPLOAD_FOLDER, console_id);
    if (!fs.existsSync(consoleDir)) fs.mkdirSync(consoleDir, { recursive: true });
  });
}
ensureDirectories();

function isLoggedIn(req) {
  return req.session && req.session.logged_in;
}

function loginRequired(req, res, next) {
  if (!isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Routes
app.get('/', (req, res) => {
  const library = loadLibrary();
  res.render('index', { library });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  // Replace with your own authentication logic!
  if (username === 'bien' && password === 'adminPassword123') {
    req.session.logged_in = true;
    res.redirect('/management');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/management', (req, res) => {
  if (!isLoggedIn(req)) return res.redirect('/login');
  const library = loadLibrary();
  res.render('management', { library });
});

// API Endpoints
app.get('/api/library', (req, res) => {
  res.json(loadLibrary());
});

app.post('/api/console', loginRequired, (req, res) => {
  const { id, name } = req.body;
  const console_id = (id || '').toLowerCase().replace(/ /g, '_');
  if (!console_id || !name) return res.status(400).json({ error: 'Console ID and name are required' });

  const library = loadLibrary();
  if (!library.consoles) library.consoles = {};
  library.consoles[console_id] = { name }; // Adjust structure as needed

  saveLibrary(library);
  ensureDirectories();
  res.json({ message: 'Console added', library });
});

// Static file serving for uploaded games (optional)
app.use('/games', express.static(UPLOAD_FOLDER));

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});