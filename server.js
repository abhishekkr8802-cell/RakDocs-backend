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

const BASE_DIR = '/app/tmp';
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

app.get('/', (req, res) => res.json({ status: 'RakDocs Backend Running ✅', version: '6.0.0', engine: 'LibreOffice' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

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
  if (!INPUT_EXT[conversionType]) return res.status(400).json({ error: `Unknown type: ${conversionType}`, supported: Object.keys(INPUT_EXT) });

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobId    = `job_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

  // Separate dirs for input, output, and LibreOffice home
  const inputDir  = path.join(BASE_DIR, jobId, 'input');
  const outputDir = path.join(BASE_DIR, jobId, 'output');
  const loHome    = path.join(BASE_DIR, jobId, 'lo_home');

  console.log(`\n[Convert] ${conversionType} | ${req.file.originalname} | ${req.file.size} bytes`);

  try {
    fs.mkdirSync(inputDir,  { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(loHome,    { recursive: true });

    const inputPath = path.join(inputDir, `file.${inExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);
    console.log(`[Input] ${inputPath}`);

    // Build command — separate outdir from input dir
    let convertTo = outExt;
    if (conversionType === 'pdf-to-word')  convertTo = 'docx:"MS Word 2007 XML"';
    if (conversionType === 'pdf-to-excel') convertTo = 'xlsx:"Calc MS Excel 2007 XML"';
    if (conversionType === 'pdf-to-ppt')   convertTo = 'pptx:"Impress MS PowerPoint 2007 XML"';
    if (conversionType === 'pdf-to-txt')   convertTo = 'txt:Text';

    const cmd = `libreoffice --headless --convert-to ${convertTo} --outdir "${outputDir}" "${inputPath}"`;
    console.log(`[CMD] ${cmd}`);

    await new Promise((resolve, reject) => {
      exec(cmd, {
        timeout: 120000,
        env: {
          ...process.env,
          HOME: loHome,
          UserInstallation: `file://${loHome}`,
        }
      }, (error, stdout, stderr) => {
        console.log('[STDOUT]', stdout.trim());
        if (stderr.trim()) console.log('[STDERR]', stderr.trim());
        // LibreOffice exits 0 even on some warnings — check output dir
        resolve();
      });
    });

    const outFiles = fs.readdirSync(outputDir);
    console.log('[Output dir]', outFiles);

    const found = outFiles.find(f => f.toLowerCase().endsWith('.' + outExt));
    if (!found) {
      // Extra debug — check input dir too
      const inFiles = fs.readdirSync(inputDir);
      console.log('[Input dir]', inFiles);
      throw new Error(`No output file created. Output dir: [${outFiles.join(', ')}]`);
    }

    const resultBuffer   = fs.readFileSync(path.join(outputDir, found));
    const outputFilename = `${baseName}_converted.${outExt}`;

    res.setHeader('Content-Type', MIME_MAP[outExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[✅ Done] ${outputFilename} — ${resultBuffer.length} bytes`);

  } catch (err) {
    console.error('[❌ Error]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(path.join(BASE_DIR, jobId), { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs v6.0 on port ${PORT} | WorkDir: ${BASE_DIR}`);
  // Confirm write access
  try {
    fs.writeFileSync(path.join(BASE_DIR, '.write_test'), 'ok');
    fs.unlinkSync(path.join(BASE_DIR, '.write_test'));
    console.log(`✅ Write access OK: ${BASE_DIR}`);
  } catch(e) { console.error(`❌ Write FAILED: ${e.message}`); }
});
