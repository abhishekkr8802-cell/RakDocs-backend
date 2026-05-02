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

// Find a writable directory
function findWritableDir() {
  const candidates = [
    '/app/tmp',
    '/tmp',
    '/var/tmp',
    '/run/tmp',
    process.env.TMPDIR || '',
    '/home',
    '/root',
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const testFile = path.join(dir, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return dir;
    } catch (e) {
      // not writable, try next
    }
  }
  return null;
}

const BASE_DIR = findWritableDir();

app.get('/', (req, res) => res.json({
  status: 'RakDocs Backend Running ✅',
  version: '7.0.0',
  engine: 'LibreOffice',
  writableDir: BASE_DIR || 'NONE FOUND ❌',
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Diagnostic endpoint — test all dirs and libreoffice
app.get('/diag', (req, res) => {
  const dirs = ['/app/tmp', '/tmp', '/var/tmp', '/run', '/home', '/root', process.env.TMPDIR || 'N/A'];
  const results = {};

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) {
        results[dir] = 'does not exist';
        continue;
      }
      const testFile = path.join(dir, `.test_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      results[dir] = '✅ writable';
    } catch (e) {
      results[dir] = `❌ ${e.message}`;
    }
  }

  // Check libreoffice binary
  exec('which libreoffice && libreoffice --version', (err, stdout) => {
    res.json({
      directories: results,
      libreoffice: stdout.trim() || (err && err.message) || 'not found',
      selectedWorkDir: BASE_DIR,
      env_TMPDIR: process.env.TMPDIR,
      env_HOME: process.env.HOME,
    });
  });
});

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  txt:  'text/plain',
};

const INPUT_EXT  = { 'pdf-to-word':'pdf','pdf-to-excel':'pdf','pdf-to-ppt':'pdf','pdf-to-jpg':'pdf','pdf-to-txt':'pdf','word-to-pdf':'docx','excel-to-pdf':'xlsx','ppt-to-pdf':'pptx','jpg-to-pdf':'jpg','png-to-pdf':'png','compress-pdf':'pdf' };
const OUTPUT_EXT = { 'pdf-to-word':'docx','pdf-to-excel':'xlsx','pdf-to-ppt':'pptx','pdf-to-jpg':'jpg','pdf-to-txt':'txt','word-to-pdf':'pdf','excel-to-pdf':'pdf','ppt-to-pdf':'pdf','jpg-to-pdf':'pdf','png-to-pdf':'pdf','compress-pdf':'pdf' };

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!INPUT_EXT[conversionType]) return res.status(400).json({ error: `Unknown type: ${conversionType}` });
  if (!BASE_DIR) return res.status(500).json({ error: 'No writable directory found on server' });

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobId    = `job_${Date.now()}`;
  const inputDir  = path.join(BASE_DIR, jobId, 'in');
  const outputDir = path.join(BASE_DIR, jobId, 'out');
  const loHome    = path.join(BASE_DIR, jobId, 'lo');

  console.log(`\n[Convert] ${conversionType} | ${req.file.originalname} | BASE_DIR=${BASE_DIR}`);

  try {
    fs.mkdirSync(inputDir,  { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(loHome,    { recursive: true });

    const inputPath = path.join(inputDir, `file.${inExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);

    let convertTo = outExt;
    if (conversionType === 'pdf-to-word')  convertTo = 'docx:"MS Word 2007 XML"';
    if (conversionType === 'pdf-to-excel') convertTo = 'xlsx:"Calc MS Excel 2007 XML"';
    if (conversionType === 'pdf-to-txt')   convertTo = 'txt:Text';

    const cmd = `libreoffice --headless --convert-to ${convertTo} --outdir "${outputDir}" "${inputPath}"`;
    console.log(`[CMD] ${cmd}`);

    await new Promise((resolve, reject) => {
      exec(cmd, {
        timeout: 120000,
        env: {
          ...process.env,
          HOME: loHome,
          TMPDIR: loHome,
          UserInstallation: `file://${loHome}`,
          SAL_USE_VCLPLUGIN: 'svp',
        }
      }, (error, stdout, stderr) => {
        console.log('[STDOUT]', stdout.trim());
        console.log('[STDERR]', stderr.trim());
        console.log('[Output dir contents]', fs.readdirSync(outputDir));
        resolve(); // always resolve — we check output dir ourselves
      });
    });

    const outFiles = fs.readdirSync(outputDir);
    const found    = outFiles.find(f => f.toLowerCase().endsWith('.' + outExt));

    if (!found) throw new Error(`LibreOffice produced no output. Dir: [${outFiles.join(', ')}]`);

    const resultBuffer   = fs.readFileSync(path.join(outputDir, found));
    const outputFilename = `${baseName}_converted.${outExt}`;

    res.setHeader('Content-Type', MIME_MAP[outExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[✅] ${outputFilename} — ${resultBuffer.length} bytes`);

  } catch (err) {
    console.error('[❌]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(path.join(BASE_DIR, jobId), { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs v7.0 | Port: ${PORT} | WorkDir: ${BASE_DIR || 'NOT FOUND ❌'}`);
});
