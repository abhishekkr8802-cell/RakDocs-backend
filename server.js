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

app.get('/', (req, res) => res.json({ status: 'RakDocs Backend Running ✅', version: '11.0.0', engine: 'pdf2docx' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
      console.log(`[CMD] ${cmd}`);
      if (stdout.trim()) console.log('[OUT]', stdout.trim());
      if (stderr.trim()) console.log('[ERR]', stderr.trim());
      resolve({ error, stdout, stderr });
    });
  });
}

// Python script for clean pdf2docx conversion
function buildPythonScript(inputPath, outputPath) {
  return `
import sys
try:
    from pdf2docx import Converter
    cv = Converter('${inputPath}')
    cv.convert('${outputPath}', 
        start=0, 
        end=None,
        multi_processing=False,
        cpu_count=1
    )
    cv.close()
    print('SUCCESS')
except Exception as e:
    print('ERROR:', str(e), file=sys.stderr)
    sys.exit(1)
`.trim();
}

const MIME_MAP = {
  pdf:  'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg:  'image/jpeg',
  txt:  'text/plain',
};

const INPUT_EXT = {
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

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!INPUT_EXT[conversionType]) return res.status(400).json({ error: `Unknown type: ${conversionType}` });

  const inExt    = INPUT_EXT[conversionType];
  const outExt   = OUTPUT_EXT[conversionType];
  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobDir   = `/tmp/rk_${Date.now()}`;
  fs.mkdirSync(jobDir, { recursive: true });

  console.log(`\n=== ${conversionType} | ${req.file.originalname} | ${req.file.size} bytes ===`);

  try {
    const inputPath  = path.join(jobDir, `input.${inExt}`);
    const outputPath = path.join(jobDir, `output.${outExt}`);
    fs.writeFileSync(inputPath, req.file.buffer);

    if (conversionType === 'pdf-to-word') {
      // Write python script to file (avoids shell escaping issues)
      const pyScript = path.join(jobDir, 'convert.py');
      fs.writeFileSync(pyScript, buildPythonScript(inputPath, outputPath));

      const { error, stdout, stderr } = await run(`python3 "${pyScript}"`);

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100) {
        throw new Error('pdf2docx conversion failed: ' + (stderr || 'output file empty or missing'));
      }
      console.log('[pdf2docx ✅] Output:', fs.statSync(outputPath).size, 'bytes');

    } else if (conversionType === 'pdf-to-txt') {
      // Use pdfminer via python for clean text extraction
      const pyScript = path.join(jobDir, 'extract.py');
      fs.writeFileSync(pyScript, `
from pdfminer.high_level import extract_text
text = extract_text('${inputPath}')
with open('${outputPath}', 'w', encoding='utf-8') as f:
    f.write(text)
print('SUCCESS')
      `.trim());
      await run(`python3 "${pyScript}"`);
      if (!fs.existsSync(outputPath)) throw new Error('PDF→TXT failed');

    } else {
      // Office → PDF via LibreOffice (this works fine)
      await run(`libreoffice --headless --convert-to ${outExt} --outdir "${jobDir}" "${inputPath}"`);
      const files = fs.readdirSync(jobDir);
      const found = files.find(f => f.endsWith('.' + outExt) && !f.startsWith('input.'));
      if (!found) throw new Error(`Conversion to ${outExt} failed. Dir: [${files.join(', ')}]`);
      // rename to outputPath for uniform handling below
      fs.renameSync(path.join(jobDir, found), outputPath);
    }

    const resultBuffer   = fs.readFileSync(outputPath);
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
  console.log(`RakDocs v11.0 | Port: ${PORT}`);
  run('python3 -c "from pdf2docx import Converter; print(\'pdf2docx ready ✅\')"')
    .then(r => console.log('[Python]', r.stdout.trim() || r.stderr.trim()));
});
