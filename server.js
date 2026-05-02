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
const os   = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get('/', (req, res) => {
  res.json({ status: 'RakDocs Backend Running ✅', version: '3.0.0', engine: 'LibreOffice (Free, No API Key)' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const CONVERSION_MAP = {
  'pdf-to-word':  { inputExt: 'pdf',  outputExt: 'docx', filter: 'MS Word 2007 XML' },
  'pdf-to-excel': { inputExt: 'pdf',  outputExt: 'xlsx', filter: 'Calc MS Excel 2007 XML' },
  'pdf-to-ppt':   { inputExt: 'pdf',  outputExt: 'pptx', filter: 'Impress MS PowerPoint 2007 XML' },
  'pdf-to-jpg':   { inputExt: 'pdf',  outputExt: 'jpg',  filter: 'impress_jpg_Export' },
  'pdf-to-txt':   { inputExt: 'pdf',  outputExt: 'txt',  filter: 'Text' },
  'word-to-pdf':  { inputExt: 'docx', outputExt: 'pdf',  filter: 'writer_pdf_Export' },
  'excel-to-pdf': { inputExt: 'xlsx', outputExt: 'pdf',  filter: 'calc_pdf_Export' },
  'ppt-to-pdf':   { inputExt: 'pptx', outputExt: 'pdf',  filter: 'impress_pdf_Export' },
  'jpg-to-pdf':   { inputExt: 'jpg',  outputExt: 'pdf',  filter: 'writer_pdf_Export' },
  'png-to-pdf':   { inputExt: 'png',  outputExt: 'pdf',  filter: 'writer_pdf_Export' },
  'compress-pdf': { inputExt: 'pdf',  outputExt: 'pdf',  filter: 'writer_pdf_Export' },
};

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  png:  'image/png',
  txt:  'text/plain',
};

function convertWithLibreOffice(inputPath, outputDir, outputExt, filter) {
  return new Promise((resolve, reject) => {
    const cmd = `libreoffice --headless --infilter="${filter}" --convert-to ${outputExt} --outdir "${outputDir}" "${inputPath}"`;
    console.log(`[LibreOffice] ${cmd}`);

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error('LibreOffice conversion failed: ' + (stderr || error.message)));
      }
      const baseName = path.basename(inputPath, path.extname(inputPath));
      let outputPath = path.join(outputDir, `${baseName}.${outputExt}`);

      if (!fs.existsSync(outputPath)) {
        const files = fs.readdirSync(outputDir);
        const found = files.find(f => f.endsWith('.' + outputExt));
        if (found) return resolve(path.join(outputDir, found));
        return reject(new Error('Output file not found. Dir: ' + files.join(', ')));
      }
      resolve(outputPath);
    });
  });
}

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!conversionType || !CONVERSION_MAP[conversionType]) {
    return res.status(400).json({ error: `Unknown type: ${conversionType}`, supported: Object.keys(CONVERSION_MAP) });
  }

  const config = CONVERSION_MAP[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rakdocs-'));
  const inputPath = path.join(tmpDir, `input.${config.inputExt}`);

  console.log(`[Convert] type=${conversionType} file=${req.file.originalname} size=${req.file.size}`);

  try {
    fs.writeFileSync(inputPath, req.file.buffer);

    const outputPath = await convertWithLibreOffice(inputPath, tmpDir, config.outputExt, config.filter);
    const resultBuffer = fs.readFileSync(outputPath);
    const outputFilename = `${baseName}_converted.${config.outputExt}`;
    const mimeType = MIME_MAP[config.outputExt] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[Convert] ✅ ${outputFilename} (${resultBuffer.length} bytes)`);
  } catch (err) {
    console.error('[Convert] ❌', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs Backend v3.0 on port ${PORT}`);
  console.log(`Engine: LibreOffice — FREE, No API Key, No Limits`);
});
