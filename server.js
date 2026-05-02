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

const BASE_DIR = '/tmp';  // confirmed writable

app.get('/', (req, res) => res.json({ status: 'RakDocs Backend Running ✅', version: '8.0.0' }));
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

// Build LibreOffice command
// KEY FIX: For PDF→DOCX, do NOT use filter name in --convert-to
// LibreOffice 7.4 impl_store bug happens when output filter is specified for PDF source
// Solution: convert-to without filter string, let LibreOffice auto-detect
function buildCmd(conversionType, inputPath, outputDir) {
  switch (conversionType) {
    case 'pdf-to-word':
      // No filter string — just docx. LibreOffice handles PDF→DOCX natively
      return `libreoffice --headless --convert-to docx --outdir "${outputDir}" "${inputPath}"`;

    case 'pdf-to-excel':
      return `libreoffice --headless --convert-to xlsx --outdir "${outputDir}" "${inputPath}"`;

    case 'pdf-to-ppt':
      return `libreoffice --headless --convert-to pptx --outdir "${outputDir}" "${inputPath}"`;

    case 'pdf-to-jpg':
      return `libreoffice --headless --convert-to jpg --outdir "${outputDir}" "${inputPath}"`;

    case 'pdf-to-txt':
      return `libreoffice --headless --convert-to txt --outdir "${outputDir}" "${inputPath}"`;

    case 'word-to-pdf':
    case 'excel-to-pdf':
    case 'ppt-to-pdf':
    case 'jpg-to-pdf':
    case 'png-to-pdf':
    case 'compress-pdf':
      return `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;

    default:
      return null;
  }
}

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;
  if (!req.file)                    return res.status(400).json({ error: 'No file uploaded' });
  if (!INPUT_EXT[conversionType])   return res.status(400).json({ error: `Unknown type: ${conversionType}`, supported: Object.keys(INPUT_EXT) });

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobId    = `rk_${Date.now()}`;
  const jobDir   = path.join(BASE_DIR, jobId);

  console.log(`\n[Convert] ${conversionType} | ${req.file.originalname} | ${req.file.size} bytes`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    const inputPath = path.join(jobDir, `input.${inExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);

    const cmd = buildCmd(conversionType, inputPath, jobDir);
    console.log(`[CMD] ${cmd}`);

    const { stdout, stderr } = await new Promise((resolve, reject) => {
      exec(cmd, {
        timeout: 120000,
        env: {
          ...process.env,
          HOME: '/root',
          TMPDIR: jobDir,
          SAL_USE_VCLPLUGIN: 'svp',
          SAL_DISABLE_WATCHDOG: '1',
        }
      }, (error, stdout, stderr) => {
        resolve({ stdout, stderr });
      });
    });

    console.log('[STDOUT]', stdout.trim());
    if (stderr.trim()) console.log('[STDERR]', stderr.trim());

    const files = fs.readdirSync(jobDir);
    console.log('[Job dir]', files);

    // Find output — anything with correct extension that isn't the input
    const found = files.find(f =>
      f.toLowerCase().endsWith('.' + outExt) &&
      f !== `input.${inExt}`
    );

    if (!found) throw new Error(`No .${outExt} file created. Dir had: [${files.join(', ')}]`);

    const resultBuffer   = fs.readFileSync(path.join(jobDir, found));
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
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs v8.0 | Port: ${PORT}`);
  console.log(`LibreOffice: /usr/bin/libreoffice`);
  console.log(`WorkDir: ${BASE_DIR}`);
});
