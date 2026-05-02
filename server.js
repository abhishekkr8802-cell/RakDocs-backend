// ─────────────────────────────────────────────────────────────
//  RakDocs Backend — Production-ready conversion server
//  Deploy on Render.com for FREE (no credit card needed)
//  Your API key stays here — never inside the mobile app
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const express      = require('express');
const multer       = require('multer');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const compression  = require('compression');
const fs           = require('fs');
const path         = require('path');
const ILovePDFApi  = require('@ilovepdf/ilovepdf-js');

const app  = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

app.use(compression());

const upload = multer({
  dest: 'tmp/',
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.use(cors({ origin: '*' }));
app.use(express.json());

const convertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many conversions. Please wait an hour and try again.' },
});

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

app.post('/convert', convertLimiter, upload.single('file'), async (req, res) => {
  const tmpFiles = [];
  try {
    const { toolId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!toolId || !TOOL_MAP[toolId]) return res.status(400).json({ error: `Unsupported tool: ${toolId}` });

    const publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey = process.env.ILOVEPDF_SECRET_KEY;
    if (!publicKey || !secretKey) return res.status(500).json({ error: 'API keys missing.' });

    const taskType  = TOOL_MAP[toolId];
    const outputExt = OUTPUT_EXT[toolId];
    const inputPath = req.file.path;
    tmpFiles.push(inputPath);

    console.log(`[${new Date().toISOString()}] ${toolId} | ${req.file.originalname} | ${(req.file.size/1024).toFixed(0)}KB`);

    const api  = new ILovePDFApi(publicKey, secretKey);
    const task = api.newTask(taskType);
    await task.start();
    await task.addFile(inputPath);

    if      (toolId === 'compress') await task.process({ compression_level: 'recommended' });
    else if (toolId === 'protect')  await task.process({ password: req.body.password || '1234' });
    else if (toolId === 'pdf-txt')  await task.process({ ocr_langs: ['eng'] });
    else                            await task.process();

    const baseName   = req.file.originalname.replace(/\.[^.]+$/, '');
    const outputName = `${baseName}_converted.${outputExt}`;
    const outputPath = path.join('tmp', outputName);
    tmpFiles.push(outputPath);

    await task.download(outputPath);
    if (!fs.existsSync(outputPath)) throw new Error('Converted file not found.');

    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', MIME_TYPES[outputExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Output-Filename', outputName);

    fs.createReadStream(outputPath).pipe(res);

  } catch (err) {
    console.error('Error:', err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: err?.message || 'Conversion failed.' });
  } finally {
    setTimeout(() => {
      tmpFiles.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {} });
    }, 2000);
  }
});

app.listen(PORT, () => {
  console.log(`\nRakDocs Backend on port ${PORT}`);
  console.log(`Public Key: ${process.env.ILOVEPDF_PUBLIC_KEY ? 'SET' : 'MISSING'}`);
  console.log(`Secret Key: ${process.env.ILOVEPDF_SECRET_KEY ? 'SET' : 'MISSING'}\n`);
});
