// One to One 投稿API - Express + multer
// セキュリティ: Helmet, CORS制限, Basic認証(書込系のみ), ファイル種別/サイズ制限, ランダムファイル名
const express = require('express');
const multer  = require('multer');
const helmet  = require('helmet');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const PORT       = process.env.PORT || 3001;
const DATA_FILE  = process.env.DATA_FILE  || '/data/db.json';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/data/uploads';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
const ALLOW_ORIGIN = (process.env.ALLOW_ORIGIN || 'http://localhost:8080').split(',');

// ---------- 初期化 ----------
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ posts: [] }, null, 2));

function loadDb()       { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveDb(db)     { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
function uid()          { return Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

// ---------- アプリ ----------
const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // /uploads を別オリジンから読めるように
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOW_ORIGIN.includes(origin)) cb(null, true);
    else cb(new Error('CORS blocked: ' + origin));
  }
}));

// アップロードファイル静的配信(参照のみ)
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
  }
}));

// ---------- Basic 認証(書込系のみ) ----------
function timingSafeEq(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function basicAuth(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return reject(res);
  const [u, p] = Buffer.from(h.slice(6), 'base64').toString().split(':');
  if (u && p && timingSafeEq(u, ADMIN_USER) && timingSafeEq(p, ADMIN_PASS)) return next();
  return reject(res);
}
function reject(res) {
  res.set('WWW-Authenticate', 'Basic realm="One to One Admin"');
  return res.status(401).json({ error: 'unauthorized' });
}

// ---------- multer (ファイルアップロード) ----------
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf'
]);
const EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'application/pdf': '.pdf'
};
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => {
    const ext = EXT[file.mimetype] || '';
    cb(null, uid() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10MB
  fileFilter: (_, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(new Error('許可されていないファイル形式です'));
  }
});

// ---------- ルート ----------
// 認証チェック(管理画面ログイン用)
app.get('/auth/check', basicAuth, (_, res) => res.json({ ok: true }));

// 投稿一覧(公開)
app.get('/posts', (_, res) => {
  const db = loadDb();
  res.json(db.posts);
});

// 投稿作成
app.post('/posts', basicAuth, (req, res) => {
  const db = loadDb();
  const { category, title, date, body, attachment } = req.body || {};
  if (!category || !title || !date) return res.status(400).json({ error: 'invalid' });
  const post = {
    id: uid(), category: String(category).slice(0, 30),
    title: String(title).slice(0, 200),
    date: String(date).slice(0, 10),
    body: String(body || '').slice(0, 20000),
    attachment: attachment && typeof attachment === 'object' ? sanitizeAttachment(attachment) : null,
    createdAt: new Date().toISOString()
  };
  db.posts.push(post);
  saveDb(db);
  res.json(post);
});

// 投稿更新
app.put('/posts/:id', basicAuth, (req, res) => {
  const db = loadDb();
  const i = db.posts.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'notfound' });
  const cur = db.posts[i];
  const { category, title, date, body, attachment } = req.body || {};
  db.posts[i] = {
    ...cur,
    category: category ? String(category).slice(0, 30) : cur.category,
    title:    title    ? String(title).slice(0, 200)   : cur.title,
    date:     date     ? String(date).slice(0, 10)     : cur.date,
    body:     body !== undefined ? String(body).slice(0, 20000) : cur.body,
    attachment: attachment === null ? null
              : attachment && typeof attachment === 'object' ? sanitizeAttachment(attachment)
              : cur.attachment,
    updatedAt: new Date().toISOString()
  };
  saveDb(db);
  res.json(db.posts[i]);
});

// 投稿削除(添付ファイルも一緒に削除)
app.delete('/posts/:id', basicAuth, (req, res) => {
  const db = loadDb();
  const target = db.posts.find(p => p.id === req.params.id);
  if (target?.attachment?.filename) safeUnlink(target.attachment.filename);
  db.posts = db.posts.filter(p => p.id !== req.params.id);
  saveDb(db);
  res.json({ ok: true });
});

// ファイルアップロード
app.post('/upload', basicAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    // multerはoriginalnameをlatin1で扱うためUTF-8に変換
    const originalUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    res.json({
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`,
      mime: req.file.mimetype,
      size: req.file.size,
      original: originalUtf8
    });
  });
});

// 添付ファイル単独削除
app.delete('/upload/:filename', basicAuth, (req, res) => {
  if (!safeUnlink(req.params.filename)) return res.status(400).json({ error: 'invalid filename' });
  res.json({ ok: true });
});

// ---------- ヘルパー ----------
function sanitizeAttachment(a) {
  const fn = String(a.filename || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!fn) return null;
  return {
    filename: fn,
    url: `/uploads/${fn}`,
    mime: String(a.mime || '').slice(0, 100),
    original: String(a.original || '').slice(0, 200)
  };
}
function safeUnlink(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe || safe.includes('..')) return false;
  const p = path.join(UPLOAD_DIR, safe);
  if (!p.startsWith(path.resolve(UPLOAD_DIR))) return false;
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
}

// エラーハンドラ
app.use((err, req, res, _) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`One to One API running on :${PORT}`);
  console.log(`Allowed origins: ${ALLOW_ORIGIN.join(', ')}`);
});
