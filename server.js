// ─────────────────────────────────────────────────────────────
//  RakDocs Backend — Production-ready conversion server
//  Deploy on Render.com for FREE (no credit card needed)
//  Your API key stays here — never inside the mobile app
// ─────────────────────────────────────────────────────────────

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const compression = require('compression');
const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const BASE_DIR = '/tmp';

app.get('/', (req, res) => res.json({ status: 'RakDocs Backend Running ✅', version: '9.0.0' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  txt:  'text/plain',
};

const INPUT_EXT  = {
  'pdf-to-word':'pdf','pdf-to-excel':'pdf','pdf-to-ppt':'pdf',
  'pdf-to-jpg':'pdf','pdf-to-txt':'pdf',
  'word-to-pdf':'docx','excel-to-pdf':'xlsx','ppt-to-pdf':'pptx',
  'jpg-to-pdf':'jpg','png-to-pdf':'png','compress-pdf':'pdf'
};
const OUTPUT_EXT = {
  'pdf-to-word':'docx','pdf-to-excel':'xlsx','pdf-to-ppt':'pptx',
  'pdf-to-jpg':'jpg','pdf-to-txt':'txt',
  'word-to-pdf':'pdf','excel-to-pdf':'pdf','ppt-to-pdf':'pdf',
  'jpg-to-pdf':'pdf','png-to-pdf':'pdf','compress-pdf':'pdf'
};

// Run a shell command, return stdout+stderr
function run(cmd, env = {}) {
  return new Promise((resolve) => {
    exec(cmd, {
      timeout: 120000,
      env: { ...process.env, HOME: '/root', SAL_USE_VCLPLUGIN: 'svp', SAL_DISABLE_WATCHDOG: '1', ...env }
    }, (error, stdout, stderr) => {
      console.log(`[CMD] ${cmd}`);
      if (stdout.trim()) console.log('[OUT]', stdout.trim());
      if (stderr.trim()) console.log('[ERR]', stderr.trim());
      resolve({ error, stdout, stderr });
    });
  });
}

// Find file with extension in directory
function findFile(dir, ext) {
  const files = fs.readdirSync(dir);
  return files.find(f => f.toLowerCase().endsWith('.' + ext)) || null;
}

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;
  if (!req.file)                  return res.status(400).json({ error: 'No file uploaded' });
  if (!INPUT_EXT[conversionType]) return res.status(400).json({ error: `Unknown type: ${conversionType}` });

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobDir   = path.join(BASE_DIR, `rk_${Date.now()}`);

  console.log(`\n=== [Convert] ${conversionType} | ${req.file.originalname} | ${req.file.size} bytes ===`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const inputPath = path.join(jobDir, `input.${inExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);

    let finalPath = null;

    if (conversionType === 'pdf-to-word') {
      // ── STEP 1: PDF → ODT (LibreOffice CAN do this) ──────
      await run(`libreoffice --headless --convert-to odt --outdir "${jobDir}" "${inputPath}"`);
      const odtFile = findFile(jobDir, 'odt');
      if (!odtFile) throw new Error('Step 1 failed: PDF→ODT produced no output');
      console.log('[Step 1 ✅] ODT created:', odtFile);

      // ── STEP 2: ODT → DOCX ───────────────────────────────
      const odtPath = path.join(jobDir, odtFile);
      await run(`libreoffice --headless --convert-to docx --outdir "${jobDir}" "${odtPath}"`);
      const docxFile = findFile(jobDir, 'docx');
      if (!docxFile) throw new Error('Step 2 failed: ODT→DOCX produced no output');
      console.log('[Step 2 ✅] DOCX created:', docxFile);
      finalPath = path.join(jobDir, docxFile);

    } else if (conversionType === 'pdf-to-excel') {
      // PDF → ODS → XLSX
      await run(`libreoffice --headless --convert-to ods --outdir "${jobDir}" "${inputPath}"`);
      const odsFile = findFile(jobDir, 'ods');
      if (!odsFile) throw new Error('Step 1 failed: PDF→ODS');
      await run(`libreoffice --headless --convert-to xlsx --outdir "${jobDir}" "${path.join(jobDir, odsFile)}"`);
      const xlsxFile = findFile(jobDir, 'xlsx');
      if (!xlsxFile) throw new Error('Step 2 failed: ODS→XLSX');
      finalPath = path.join(jobDir, xlsxFile);

    } else if (conversionType === 'pdf-to-ppt') {
      // PDF → ODP → PPTX
      await run(`libreoffice --headless --convert-to odp --outdir "${jobDir}" "${inputPath}"`);
      const odpFile = findFile(jobDir, 'odp');
      if (!odpFile) throw new Error('Step 1 failed: PDF→ODP');
      await run(`libreoffice --headless --convert-to pptx --outdir "${jobDir}" "${path.join(jobDir, odpFile)}"`);
      const pptxFile = findFile(jobDir, 'pptx');
      if (!pptxFile) throw new Error('Step 2 failed: ODP→PPTX');
      finalPath = path.join(jobDir, pptxFile);

    } else if (conversionType === 'pdf-to-txt') {
      await run(`libreoffice --headless --convert-to txt --outdir "${jobDir}" "${inputPath}"`);
      const txtFile = findFile(jobDir, 'txt');
      if (!txtFile) throw new Error('PDF→TXT failed');
      finalPath = path.join(jobDir, txtFile);

    } else if (conversionType === 'pdf-to-jpg') {
      await run(`libreoffice --headless --convert-to jpg --outdir "${jobDir}" "${inputPath}"`);
      const jpgFile = findFile(jobDir, 'jpg');
      if (!jpgFile) throw new Error('PDF→JPG failed');
      finalPath = path.join(jobDir, jpgFile);

    } else {
      // All Office→PDF, image→PDF, compress
      await run(`libreoffice --headless --convert-to pdf --outdir "${jobDir}" "${inputPath}"`);
      const pdfFile = findFile(jobDir, 'pdf');
      if (!pdfFile) throw new Error(`→PDF conversion failed`);
      finalPath = path.join(jobDir, pdfFile);
    }

    const resultBuffer   = fs.readFileSync(finalPath);
    const outputFilename = `${baseName}_converted.${outExt}`;

    res.setHeader('Content-Type', MIME_MAP[outExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[✅ DONE] ${outputFilename} — ${resultBuffer.length} bytes`);

  } catch (err) {
    console.error('[❌ FAILED]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs v9.0 | Port: ${PORT} | 2-step PDF conversion`);
});
