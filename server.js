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

// Use /app/tmp inside the container — Railway allows writes here
const WORK_DIR = path.join('/app', 'tmp');
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

app.get('/', (req, res) => {
  res.json({ status: 'RakDocs Backend Running ✅', version: '5.0.0', engine: 'LibreOffice (Free, No API Key)', workDir: WORK_DIR });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Test write permissions on startup
app.get('/test-write', (req, res) => {
  try {
    const testFile = path.join(WORK_DIR, 'test.txt');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    res.json({ writable: true, workDir: WORK_DIR });
  } catch (e) {
    res.json({ writable: false, error: e.message, workDir: WORK_DIR });
  }
});

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  png:  'image/png',
  txt:  'text/plain',
};

const INPUT_EXT = {
  'pdf-to-word':  'pdf',
  'pdf-to-excel': 'pdf',
  'pdf-to-ppt':   'pdf',
  'pdf-to-jpg':   'pdf',
  'pdf-to-txt':   'pdf',
  'word-to-pdf':  'docx',
  'excel-to-pdf': 'xlsx',
  'ppt-to-pdf':   'pptx',
  'jpg-to-pdf':   'jpg',
  'png-to-pdf':   'png',
  'compress-pdf': 'pdf',
};

const OUTPUT_EXT = {
  'pdf-to-word':  'docx',
  'pdf-to-excel': 'xlsx',
  'pdf-to-ppt':   'pptx',
  'pdf-to-jpg':   'jpg',
  'pdf-to-txt':   'txt',
  'word-to-pdf':  'pdf',
  'excel-to-pdf': 'pdf',
  'ppt-to-pdf':   'pdf',
  'jpg-to-pdf':   'pdf',
  'png-to-pdf':   'pdf',
  'compress-pdf': 'pdf',
};

function buildCommand(conversionType, inputPath, outputDir) {
  switch (conversionType) {
    case 'pdf-to-word':
      return `libreoffice --headless --convert-to docx:"MS Word 2007 XML" --outdir "${outputDir}" "${inputPath}"`;
    case 'pdf-to-excel':
      return `libreoffice --headless --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir "${outputDir}" "${inputPath}"`;
    case 'pdf-to-ppt':
      return `libreoffice --headless --convert-to pptx:"Impress MS PowerPoint 2007 XML" --outdir "${outputDir}" "${inputPath}"`;
    case 'pdf-to-jpg':
      return `libreoffice --headless --convert-to jpg --outdir "${outputDir}" "${inputPath}"`;
    case 'pdf-to-txt':
      return `libreoffice --headless --convert-to txt:Text --outdir "${outputDir}" "${inputPath}"`;
    default:
      return `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
  }
}

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!conversionType || !INPUT_EXT[conversionType]) {
    return res.status(400).json({ error: `Unknown type: "${conversionType}"`, supported: Object.keys(INPUT_EXT) });
  }

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobId    = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const jobDir   = path.join(WORK_DIR, jobId);

  console.log(`\n[Convert] type=${conversionType} file=${req.file.originalname} size=${req.file.size} jobDir=${jobDir}`);

  try {
    // Create job directory
    fs.mkdirSync(jobDir, { recursive: true });

    const inputPath = path.join(jobDir, `rakfile.${inExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);
    console.log(`[Convert] Written to: ${inputPath} (${req.file.buffer.length} bytes)`);

    // Verify write worked
    if (!fs.existsSync(inputPath)) throw new Error('Failed to write input file');

    const cmd = buildCommand(conversionType, inputPath, jobDir);
    console.log(`[LibreOffice CMD] ${cmd}`);

    // Run LibreOffice
    await new Promise((resolve, reject) => {
      exec(cmd, { timeout: 120000, env: { ...process.env, HOME: jobDir } }, (error, stdout, stderr) => {
        console.log('[STDOUT]', stdout);
        console.log('[STDERR]', stderr);
        if (error && !stderr.includes('Warning')) {
          return reject(new Error('LibreOffice failed: ' + stderr));
        }
        resolve();
      });
    });

    // Find output file
    const files = fs.readdirSync(jobDir);
    console.log('[JobDir files]', files);
    const outputFile = files.find(f => f.toLowerCase().endsWith('.' + outExt) && f !== `rakfile.${inExt}`);

    if (!outputFile) {
      throw new Error(`Conversion produced no output. Files: [${files.join(', ')}]`);
    }

    const outputPath   = path.join(jobDir, outputFile);
    const resultBuffer = fs.readFileSync(outputPath);
    const outputFilename = `${baseName}_converted.${outExt}`;

    res.setHeader('Content-Type', MIME_MAP[outExt] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[Convert] ✅ Done: ${outputFilename} (${resultBuffer.length} bytes)`);

  } catch (err) {
    console.error('[Convert] ❌', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs Backend v5.0 on port ${PORT}`);
  console.log(`Work dir: ${WORK_DIR}`);
  console.log(`Testing write access...`);
  try {
    fs.writeFileSync(path.join(WORK_DIR, 'startup-test.txt'), 'ok');
    fs.unlinkSync(path.join(WORK_DIR, 'startup-test.txt'));
    console.log(`✅ Write access confirmed: ${WORK_DIR}`);
  } catch(e) {
    console.error(`❌ Write access FAILED: ${e.message}`);
  }
});
