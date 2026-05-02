// ─────────────────────────────────────────────────────────────
//  DocShift Backend — Production-ready conversion server
//  Deploy on Render.com for FREE (no credit card needed)
//  Your API key stays here — never inside the mobile app
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const fs         = require('fs');
const path       = require('path');
const axios      = require('axios');
const FormData   = require('form-data');
const ILovePDFApi       = require('@ilovepdf/ilovepdf-nodejs');
const ILovePDFFile      = require('@ilovepdf/ilovepdf-nodejs/ILovePDFFile');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── STORAGE: temp folder for uploaded files ────────────────
const upload = multer({
  dest: 'tmp/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// ── CORS: allow your app to call this server ───────────────
app.use(cors({
  origin: '*', // tighten this to your domain after launch
}));
app.use(express.json());

// ── RATE LIMITING: max 10 conversions per IP per hour ──────
//    Prevents abuse — each real user gets 10 free/hour
const convertLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many conversions. Please wait an hour and try again.',
    retryAfter: '1 hour',
  },
});

// ── SUPPORTED CONVERSIONS ──────────────────────────────────
//    Maps your tool IDs to iLovePDF task types
const TOOL_MAP = {
  'pdf-word':  'pdfoffice',   // PDF → DOCX (best layout preservation)
  'word-pdf':  'officepdf',   // DOCX → PDF
  'img-pdf':   'imagepdf',    // JPG/PNG → PDF
  'excel-pdf': 'officepdf',   // XLSX → PDF
  'ppt-pdf':   'officepdf',   // PPTX → PDF
  'pdf-txt':   'pdfocr',      // PDF → text via OCR
  'compress':  'compress',    // Compress PDF
  'merge':     'merge',       // Merge PDFs
  'split':     'split',       // Split PDF
  'protect':   'protect',     // Password protect PDF
  'rotate':    'rotate',      // Rotate PDF
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
  'rotate':    'pdf',
};

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'DocShift Backend Running ✅',
    version: '1.0.0',
    endpoints: ['POST /convert', 'GET /health'],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── MAIN CONVERSION ENDPOINT ───────────────────────────────
app.post('/convert', convertLimiter, upload.single('file'), async (req, res) => {
  const tmpFiles = [];

  try {
    // ── Validate request ─────────────────────────────────
    const { toolId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    if (!toolId || !TOOL_MAP[toolId]) {
      return res.status(400).json({ error: `Unsupported conversion: ${toolId}` });
    }

    const taskType  = TOOL_MAP[toolId];
    const outputExt = OUTPUT_EXT[toolId];
    const inputPath = req.file.path;
    tmpFiles.push(inputPath);

    console.log(`[${new Date().toISOString()}] Converting: ${req.file.originalname} | Tool: ${toolId} → ${outputExt}`);

    // ── iLovePDF API keys from environment ──────────────
    const publicKey  = process.env.ILOVEPDF_PUBLIC_KEY;
    const secretKey  = process.env.ILOVEPDF_SECRET_KEY;

    if (!publicKey || !secretKey) {
      return res.status(500).json({ error: 'Server misconfiguration: API keys missing.' });
    }

    // ── Run iLovePDF conversion ──────────────────────────
    const api  = new ILovePDFApi(publicKey, secretKey);
    const task = api.newTask(taskType);

    await task.start();

    const iFile = new ILovePDFFile(inputPath, req.file.originalname);
    await task.addFile(iFile);

    // Extra options per tool
    if (toolId === 'pdf-word') {
      // Best possible layout preservation
      await task.process({ ocr_langs: ['eng'], output_filename: '{filename}' });
    } else if (toolId === 'compress') {
      await task.process({ compression_level: 'recommended' });
    } else if (toolId === 'protect') {
      const password = req.body.password || '1234';
      await task.process({ password });
    } else {
      await task.process();
    }

    // ── Download result from iLovePDF ────────────────────
    const outputFileName = req.file.originalname.replace(/\.[^.]+$/, '') + '_converted.' + outputExt;
    const outputPath = path.join('tmp', outputFileName);
    tmpFiles.push(outputPath);

    await task.download(outputPath);

    if (!fs.existsSync(outputPath)) {
      throw new Error('Converted file not found after download.');
    }

    // ── Send converted file back to the app ──────────────
    const mimeTypes = {
      pdf:  'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt:  'text/plain',
      zip:  'application/zip',
    };

    res.setHeader('Content-Type', mimeTypes[outputExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFileName}"`);
    res.setHeader('X-Output-Filename', outputFileName);

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      console.log(`[${new Date().toISOString()}] Done: ${outputFileName}`);
    });

  } catch (err) {
    console.error('Conversion error:', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err?.message || 'Conversion failed. Please try again.',
      });
    }
  } finally {
    // ── Always clean up temp files ───────────────────────
    tmpFiles.forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
    });
  }
});

// ── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 DocShift Backend running on port ${PORT}`);
  console.log(`   iLovePDF Public Key: ${process.env.ILOVEPDF_PUBLIC_KEY ? '✅ set' : '❌ MISSING'}`);
  console.log(`   iLovePDF Secret Key: ${process.env.ILOVEPDF_SECRET_KEY ? '✅ set' : '❌ MISSING'}\n`);
});
