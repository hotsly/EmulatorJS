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

// Check if we're running behind a proxy
const PROXY_BASE = process.env.PROXY_BASE || '';
const BASE_PATH = PROXY_BASE || '';

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'templates'));

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

// Helper function to create routes with flexible base path
function createRoute(path) {
  if (BASE_PATH) {
    return BASE_PATH + path;
  }
  return path;
}

// Routes - Handle both with and without proxy prefix
const routes = [
  // Main routes
  { path: '/', handler: (req, res) => {
    const library = loadLibrary();
    res.render('index', { library });
  }},
  
  { path: '/login', handler: (req, res) => {
    res.render('login', { error: null });
  }},
  
  { path: '/management', handler: (req, res) => {
    if (!isLoggedIn(req)) return res.redirect(createRoute('/login'));
    const library = loadLibrary();
    res.render('management', { library });
  }},
  
  // API routes
  { path: '/api/library', handler: (req, res) => {
    res.json(loadLibrary());
  }},
];

// Register routes with both patterns
routes.forEach(route => {
  // Register without proxy prefix
  app.get(route.path, route.handler);
  // Register with proxy prefix
  app.get('/proxy/3000' + route.path, route.handler);
});

// POST routes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'bien' && password === 'adminPassword123') {
    req.session.logged_in = true;
    res.redirect(createRoute('/management'));
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

app.post('/proxy/3000/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'bien' && password === 'adminPassword123') {
    req.session.logged_in = true;
    res.redirect('/proxy/3000/management');
  } else {
    res.render('login', { error: 'Invalid credentials' });
  }
});

// Logout routes
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect(createRoute('/login')));
});

app.get('/proxy/3000/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/proxy/3000/login'));
});

// Console management API
app.post('/api/console', loginRequired, (req, res) => {
  const { id, name } = req.body;
  const console_id = (id || '').toLowerCase().replace(/ /g, '_');
  if (!console_id || !name) return res.status(400).json({ error: 'Console ID and name are required' });

  const library = loadLibrary();
  if (!library.consoles) library.consoles = {};
  if (library.consoles[console_id]) {
    return res.status(400).json({ error: 'Console already exists' });
  }
  
  library.consoles[console_id] = { name, games: {} };
  saveLibrary(library);
  ensureDirectories();
  res.json({ message: 'Console added', library });
});

app.post('/proxy/3000/api/console', loginRequired, (req, res) => {
  const { id, name } = req.body;
  const console_id = (id || '').toLowerCase().replace(/ /g, '_');
  if (!console_id || !name) return res.status(400).json({ error: 'Console ID and name are required' });

  const library = loadLibrary();
  if (!library.consoles) library.consoles = {};
  if (library.consoles[console_id]) {
    return res.status(400).json({ error: 'Console already exists' });
  }
  
  library.consoles[console_id] = { name, games: {} };
  saveLibrary(library);
  ensureDirectories();
  res.json({ message: 'Console added', library });
});

// Delete console
app.delete('/api/console/:consoleId', loginRequired, (req, res) => {
  const { consoleId } = req.params;
  const library = loadLibrary();
  
  if (!library.consoles || !library.consoles[consoleId]) {
    return res.status(404).json({ error: 'Console not found' });
  }
  
  // Delete console directory and files
  const consoleDir = path.join(UPLOAD_FOLDER, consoleId);
  if (fs.existsSync(consoleDir)) {
    fs.rmSync(consoleDir, { recursive: true });
  }
  
  delete library.consoles[consoleId];
  saveLibrary(library);
  res.json({ message: 'Console removed' });
});

app.delete('/proxy/3000/api/console/:consoleId', loginRequired, (req, res) => {
  const { consoleId } = req.params;
  const library = loadLibrary();
  
  if (!library.consoles || !library.consoles[consoleId]) {
    return res.status(404).json({ error: 'Console not found' });
  }
  
  // Delete console directory and files
  const consoleDir = path.join(UPLOAD_FOLDER, consoleId);
  if (fs.existsSync(consoleDir)) {
    fs.rmSync(consoleDir, { recursive: true });
  }
  
  delete library.consoles[consoleId];
  saveLibrary(library);
  res.json({ message: 'Console removed' });
});

// Game upload
app.post('/api/game/:consoleId', loginRequired, upload.single('game_file'), (req, res) => {
  const { consoleId } = req.params;
  const { game_name } = req.body;
  const file = req.file;
  
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  
  const library = loadLibrary();
  if (!library.consoles || !library.consoles[consoleId]) {
    return res.status(404).json({ error: 'Console not found' });
  }
  
  const consoleDir = path.join(UPLOAD_FOLDER, consoleId);
  if (!fs.existsSync(consoleDir)) {
    fs.mkdirSync(consoleDir, { recursive: true });
  }
  
  const filename = file.originalname;
  const gameId = filename.toLowerCase().replace(/[^a-z0-9.]/g, '_');
  const finalPath = path.join(consoleDir, filename);
  
  // Move file to final location
  fs.renameSync(file.path, finalPath);
  
  // Add to library
  if (!library.consoles[consoleId].games) {
    library.consoles[consoleId].games = {};
  }
  
  library.consoles[consoleId].games[gameId] = {
    name: game_name || filename,
    filename: filename,
    path: finalPath,
    size: file.size
  };
  
  saveLibrary(library);
  res.json({ message: 'Game uploaded successfully' });
});

app.post('/proxy/3000/api/game/:consoleId', loginRequired, upload.single('game_file'), (req, res) => {
  const { consoleId } = req.params;
  const { game_name } = req.body;
  const file = req.file;
  
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  
  const library = loadLibrary();
  if (!library.consoles || !library.consoles[consoleId]) {
    return res.status(404).json({ error: 'Console not found' });
  }
  
  const consoleDir = path.join(UPLOAD_FOLDER, consoleId);
  if (!fs.existsSync(consoleDir)) {
    fs.mkdirSync(consoleDir, { recursive: true });
  }
  
  const filename = file.originalname;
  const gameId = filename.toLowerCase().replace(/[^a-z0-9.]/g, '_');
  const finalPath = path.join(consoleDir, filename);
  
  // Move file to final location
  fs.renameSync(file.path, finalPath);
  
  // Add to library
  if (!library.consoles[consoleId].games) {
    library.consoles[consoleId].games = {};
  }
  
  library.consoles[consoleId].games[gameId] = {
    name: game_name || filename,
    filename: filename,
    path: finalPath,
    size: file.size
  };
  
  saveLibrary(library);
  res.json({ message: 'Game uploaded successfully' });
});

// Delete game
app.delete('/api/game/:consoleId/:gameId', loginRequired, (req, res) => {
  const { consoleId, gameId } = req.params;
  const library = loadLibrary();
  
  if (!library.consoles || !library.consoles[consoleId] || !library.consoles[consoleId].games || !library.consoles[consoleId].games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = library.consoles[consoleId].games[gameId];
  
  // Delete file
  if (fs.existsSync(game.path)) {
    fs.unlinkSync(game.path);
  }
  
  delete library.consoles[consoleId].games[gameId];
  saveLibrary(library);
  res.json({ message: 'Game removed' });
});

app.delete('/proxy/3000/api/game/:consoleId/:gameId', loginRequired, (req, res) => {
  const { consoleId, gameId } = req.params;
  const library = loadLibrary();
  
  if (!library.consoles || !library.consoles[consoleId] || !library.consoles[consoleId].games || !library.consoles[consoleId].games[gameId]) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  const game = library.consoles[consoleId].games[gameId];
  
  // Delete file
  if (fs.existsSync(game.path)) {
    fs.unlinkSync(game.path);
  }
  
  delete library.consoles[consoleId].games[gameId];
  saveLibrary(library);
  res.json({ message: 'Game removed' });
});

// Static file serving for uploaded games
app.use('/games', express.static(UPLOAD_FOLDER));
app.use('/proxy/3000/games', express.static(UPLOAD_FOLDER));

// Catch-all for debugging
app.use('*', (req, res) => {
  console.log('Unmatched route:', req.originalUrl);
  res.status(404).json({ error: 'Route not found', url: req.originalUrl });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Base path: ${BASE_PATH || 'none'}`);
});