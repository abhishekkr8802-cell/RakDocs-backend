// ─────────────────────────────────────────────────────────────
//  RakDocs Backend — Production-ready conversion server
//  Deploy on Render.com for FREE (no credit card needed)
//  Your API key stays here — never inside the mobile app
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const express     = require('express');
const multer      = require('multer');
const cors        = require('cors');
const compression = require('compression');
const fs          = require('fs');
const path        = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// Trust Railway's proxy — required for rate limiting and correct IPs
app.set('trust proxy', 1);

app.use(compression());
app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({
  dest: 'tmp/',
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Simple in-memory rate limit — no proxy issues
const requestCounts = {};
function rateLimiter(req, res, next) {
  const ip  = req.ip || 'unknown';
  const now = Date.now();
  if (!requestCounts[ip]) requestCounts[ip] = [];
  requestCounts[ip] = requestCounts[ip].filter(t => now - t < 60 * 60 * 1000);
  if (requestCounts[ip].length >= 20) {
    return res.status(429).json({ error: 'Too many conversions. Please wait an hour.' });
  }
  requestCounts[ip].push(now);
  next();
}

const TOOL_MAP = {
  'pdf-word':  'pdfoffice',
  'word-pdf':  'officepdf',
  'img-pdf':   'imagepdf',
  'excel-pdf': 'officepdf',
  'ppt-pdf':   'officepdf',
  'pdf-txt':   'pdfocr',
  'compress':  'compress',
  'merge':     'merge',
  'split':     'split',
  'protect':   'protect',
};

const OUTPUT_EXT = {
  'pdf-word':  'docx',
  'word-pdf':  'pdf',
  'img-pdf':   'pdf',
  'excel-pdf': 'pdf',
  'ppt-pdf':   'pdf',
  'pdf-txt':   'txt',
  'compress':  'pdf',
  'merge':     'pdf',
  'split':     'zip',
  'protect':   'pdf',
};

const MIME_TYPES = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt:  'text/plain',
  zip:  'application/zip',
};

app.get('/', (req, res) => {
  res.json({ status: 'RakDocs Backend Running', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/test-keys', (req, res) => {
  const pub = process.env.ILOVEPDF_PUBLIC_KEY;
  const sec = process.env.ILOVEPDF_SECRET_KEY;
  res.json({
    public_key_set:     !!pub,
    secret_key_set:     !!sec,
    public_key_preview: pub ? pub.substring(0, 15) + '...' : 'MISSING',
  });
});

app.post('/convert', rateLimiter, upload.single('file'), async (req, res) => {
  const tmpFiles = [];
  try {
    const { toolId } = req.body;
    console.log(`[CONVERT] toolId=${toolId} file=${req.file?.originalname} size=${req.file?.size}`);

    if (!req.file)         return res.status(400).json({ error: 'No file uploaded.' });
    if (!TOOL_MAP[toolId]) return res.status(400).json({ error: `Unsupported tool: ${toolId}` });

    const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = process.env.ILOVEPDF_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return res.status(500).json({ error: 'API keys not configured. Add ILOVEPDF_PUBLIC_KEY and ILOVEPDF_SECRET_KEY in Railway Variables tab.' });
    }

    const inputPath = req.file.path;
    tmpFiles.push(inputPath);

    const ILovePDFApi  = require('@ilovepdf/ilovepdf-nodejs');
    const ILovePDFFile = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');

    const api  = new ILovePDFApi(publicKey, secretKey);
    const task = api.newTask(TOOL_MAP[toolId]);
    await task.start();
    console.log('[ILOVEPDF] Task started');

    const iFile = new ILovePDFFile(inputPath);
    await task.addFile(iFile);
    console.log('[ILOVEPDF] File added');

    if      (toolId === 'compress') await task.process({ compression_level: 'recommended' });
    else if (toolId === 'protect')  await task.process({ password: req.body.password || '1234' });
    else if (toolId === 'pdf-txt')  await task.process({ ocr_langs: ['eng'] });
    else                            await task.process();
    console.log('[ILOVEPDF] Processed');

    const outputExt  = OUTPUT_EXT[toolId];
    const baseName   = req.file.originalname.replace(/\.[^.]+$/, '');
    const outputName = `${baseName}_converted.${outputExt}`;
    const outputPath = path.join('tmp', outputName);
    tmpFiles.push(outputPath);

    await task.download(outputPath);

    if (!fs.existsSync(outputPath)) throw new Error('Output file missing after download.');

    const stat = fs.statSync(outputPath);
    console.log(`[DONE] ${outputName} | ${(stat.size / 1024).toFixed(0)}KB`);

    res.setHeader('Content-Type', MIME_TYPES[outputExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(outputPath).pipe(res);

  } catch (err) {
    console.error('[ERROR]', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Conversion failed.' });
    }
  } finally {
    setTimeout(() => {
      tmpFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
    }, 3000);
  }
});

app.listen(PORT, () => {
  console.log(`\n=== RakDocs Backend on port ${PORT} ===`);
  console.log(`Public Key: ${process.env.ILOVEPDF_PUBLIC_KEY ? '✅ SET' : '❌ MISSING'}`);
  console.log(`Secret Key: ${process.env.ILOVEPDF_SECRET_KEY ? '✅ SET' : '❌ MISSING'}`);
  console.log(`========================================\n`);
});
