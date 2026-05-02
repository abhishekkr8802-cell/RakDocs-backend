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

app.get('/', (req, res) => res.json({ status: 'RakDocs Backend Running ✅', version: '10.0.0', engine: 'pdf2docx (Python)' }));
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

app.post('/convert', upload.single('file'), async (req, res) => {
  const { conversionType } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const baseName = (req.file.originalname || 'file').replace(/\.[^.]+$/, '');
  const jobDir   = `/tmp/rk_${Date.now()}`;
  fs.mkdirSync(jobDir, { recursive: true });

  console.log(`\n=== ${conversionType} | ${req.file.originalname} | ${req.file.size} bytes ===`);

  try {
    if (conversionType === 'pdf-to-word') {
      const inputPath  = path.join(jobDir, 'input.pdf');
      const outputPath = path.join(jobDir, 'output.docx');
      fs.writeFileSync(inputPath, req.file.buffer);

      // pdf2docx — best free PDF→DOCX converter
      const { error, stderr } = await run(
        `python3 -c "from pdf2docx import Converter; cv = Converter('${inputPath}'); cv.convert('${outputPath}'); cv.close()"`
      );

      if (!fs.existsSync(outputPath)) {
        throw new Error('pdf2docx failed: ' + (stderr || (error && error.message) || 'unknown'));
      }

      const buf = fs.readFileSync(outputPath);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_converted.docx"`);
      res.setHeader('X-Output-Filename', `${baseName}_converted.docx`);
      res.send(buf);
      console.log(`[✅ DONE] ${baseName}_converted.docx — ${buf.length} bytes`);

    } else {
      // All other conversions — word/excel/ppt to PDF using LibreOffice
      // (these work fine, only PDF→DOCX was broken)
      const extMap = { 'word-to-pdf':'docx','excel-to-pdf':'xlsx','ppt-to-pdf':'pptx','jpg-to-pdf':'jpg','png-to-pdf':'png','compress-pdf':'pdf' };
      const inExt  = extMap[conversionType] || 'pdf';
      const inputPath = path.join(jobDir, `input.${inExt}`);
      fs.writeFileSync(inputPath, req.file.buffer);

      await run(`libreoffice --headless --convert-to pdf --outdir "${jobDir}" "${inputPath}"`);

      const files   = fs.readdirSync(jobDir);
      const outFile = files.find(f => f.endsWith('.pdf') && f !== `input.${inExt}`);
      if (!outFile) throw new Error('Conversion failed');

      const buf = fs.readFileSync(path.join(jobDir, outFile));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}_converted.pdf"`);
      res.send(buf);
      console.log(`[✅ DONE] ${baseName}_converted.pdf — ${buf.length} bytes`);
    }

  } catch (err) {
    console.error('[❌ FAILED]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch(e) {}
  }
});

app.listen(PORT, () => {
  console.log(`RakDocs v10.0 | Port: ${PORT} | Engine: pdf2docx`);
  run('python3 -c "import pdf2docx; print(\'pdf2docx:\', pdf2docx.__version__)"')
    .then(r => console.log('[Python]', r.stdout.trim() || r.stderr.trim()));
});
