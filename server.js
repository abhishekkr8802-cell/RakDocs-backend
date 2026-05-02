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
  res.json({ status: 'RakDocs Backend Running ✅', version: '4.0.0', engine: 'LibreOffice (Free, No API Key)' });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// MIME types for sending response
const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  png:  'image/png',
  txt:  'text/plain',
};

// Input file extension per conversionType
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

// Output extension per conversionType
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

// Build the correct LibreOffice command for each conversion
function buildLibreOfficeCommand(conversionType, inputPath, outputDir) {
  const outExt = OUTPUT_EXT[conversionType];

  switch (conversionType) {
    // PDF → DOCX: use writer filter
    case 'pdf-to-word':
      return `libreoffice --headless --convert-to docx:"MS Word 2007 XML" --outdir "${outputDir}" "${inputPath}"`;

    // PDF → XLSX
    case 'pdf-to-excel':
      return `libreoffice --headless --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir "${outputDir}" "${inputPath}"`;

    // PDF → PPTX
    case 'pdf-to-ppt':
      return `libreoffice --headless --convert-to pptx:"Impress MS PowerPoint 2007 XML" --outdir "${outputDir}" "${inputPath}"`;

    // PDF → JPG
    case 'pdf-to-jpg':
      return `libreoffice --headless --convert-to jpg --outdir "${outputDir}" "${inputPath}"`;

    // PDF → TXT
    case 'pdf-to-txt':
      return `libreoffice --headless --convert-to txt:Text --outdir "${outputDir}" "${inputPath}"`;

    // Office → PDF (all use same command)
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

function runLibreOffice(cmd, outputDir, outputExt) {
  return new Promise((resolve, reject) => {
    console.log(`[LibreOffice CMD] ${cmd}`);

    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      console.log('[LibreOffice STDOUT]', stdout);
      if (stderr) console.log('[LibreOffice STDERR]', stderr);

      // Find output file — LibreOffice names it after input file
      try {
        const files = fs.readdirSync(outputDir);
        console.log('[LibreOffice DIR]', files);
        const found = files.find(f => f.toLowerCase().endsWith('.' + outputExt));
        if (found) {
          return resolve(path.join(outputDir, found));
        }
        // If nothing found, check if there was an error
        if (error) {
          return reject(new Error('LibreOffice error: ' + (stderr || error.message)));
        }
        return reject(new Error('Output file not created. Files in dir: ' + files.join(', ')));
      } catch (e) {
        reject(e);
      }
    });
  });
}

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!conversionType || !INPUT_EXT[conversionType]) {
    return res.status(400).json({
      error: `Unknown conversion type: "${conversionType}"`,
      supported: Object.keys(INPUT_EXT),
    });
  }

  const inExt  = INPUT_EXT[conversionType];
  const outExt = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');

  console.log(`\n[Convert] type=${conversionType} file=${req.file.originalname} size=${req.file.size}`);

  // Create unique temp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rakdocs-'));
  // Name input file properly — LibreOffice uses this as base for output name
  const inputPath = path.join(tmpDir, `rakfile.${inExt}`);

  try {
    fs.writeFileSync(inputPath, req.file.buffer);
    console.log(`[Convert] Input written: ${inputPath}`);

    const cmd = buildLibreOfficeCommand(conversionType, inputPath, tmpDir);
    if (!cmd) throw new Error('Could not build conversion command');

    const outputPath = await runLibreOffice(cmd, tmpDir, outExt);
    const resultBuffer = fs.readFileSync(outputPath);

    const outputFilename = `${baseName}_converted.${outExt}`;
    const mimeType = MIME_MAP[outExt] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    res.setHeader('X-Output-Filename', outputFilename);
    res.send(resultBuffer);

    console.log(`[Convert] ✅ Success: ${outputFilename} (${resultBuffer.length} bytes)`);

  } catch (err) {
    console.error('[Convert] ❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs Backend v4.0 on port ${PORT}`);
  console.log(`Engine: LibreOffice — FREE, No API Key, No Limits`);
  console.log(`Supported: ${Object.keys(INPUT_EXT).join(', ')}`);
});
