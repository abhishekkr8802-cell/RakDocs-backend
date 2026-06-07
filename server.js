// ─────────────────────────────────────────────────────────────
//  RakDocs Backend — Production-ready conversion server
// ─────────────────────────────────────────────────────────────

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const compression = require('compression');
const { exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 8080;

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

function buildBankStatementScript(inputPath, outputPath, password = '') {
  return `
import sys, re
try:
    import pdfplumber
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Transactions"

    header_font  = Font(bold=True, color="FFFFFF", size=11)
    header_fill  = PatternFill("solid", fgColor="4F46E5")
    alt_fill     = PatternFill("solid", fgColor="F3F4F6")
    center       = Alignment(horizontal="center", vertical="center")

    headers = ["Date", "Description / Narration", "Debit (Dr)", "Credit (Cr)", "Balance"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font   = header_font
        cell.fill   = header_fill
        cell.alignment = center

    ws.column_dimensions["A"].width = 14
    ws.column_dimensions["B"].width = 50
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 14
    ws.column_dimensions["E"].width = 16

    amount_pat = r'[\\d,]+\\.\\d{2}'
    date_pat   = r'\\d{1,2}[\\-/.]\\d{1,2}[\\-/.]\\d{2,4}|\\d{2,4}[\\-/.]\\d{1,2}[\\-/.]\\d{1,2}'

    rows_written = 0
    all_text_rows = []

    pdf_password = "${password.replace(/"/g, '\\"')}" or None
    with pdfplumber.open('${inputPath}', password=pdf_password) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    for row in table:
                        if not row: continue
                        cleaned = [str(c).strip() if c else "" for c in row]
                        if any(kw in " ".join(cleaned).lower() for kw in ["date","narration","particulars","description","debit","credit","balance","dr","cr","transaction"]):
                            continue
                        if not any(cleaned): continue
                        date_val = ""
                        for cell in cleaned:
                            if re.search(date_pat, cell):
                                date_val = cell
                                break
                        if not date_val and rows_written > 0:
                            continue

                        amounts = [c for c in cleaned if re.match(r'^[\\d,]+\\.\\d{2}$', c.replace(" ",""))]
                        narration = ""
                        for cell in cleaned:
                            if cell and cell != date_val and not re.match(r'^[\\d,]+\\.\\d{2}$', cell.replace(" ","")):
                                narration = cell
                                break

                        debit  = amounts[0] if len(amounts) >= 3 else (amounts[0] if len(amounts) == 1 else "")
                        credit = amounts[1] if len(amounts) >= 3 else (amounts[1] if len(amounts) >= 2 else "")
                        balance= amounts[-1] if len(amounts) >= 1 else ""

                        if len(amounts) == 2:
                            debit, credit, balance = "", amounts[0], amounts[1]

                        row_num = rows_written + 2
                        ws.cell(row=row_num, column=1, value=date_val)
                        ws.cell(row=row_num, column=2, value=narration)
                        ws.cell(row=row_num, column=3, value=debit)
                        ws.cell(row=row_num, column=4, value=credit)
                        ws.cell(row=row_num, column=5, value=balance)
                        if rows_written % 2 == 1:
                            for col in range(1, 6):
                                ws.cell(row=row_num, column=col).fill = alt_fill
                        rows_written += 1
            else:
                text = page.extract_text() or ""
                for line in text.split("\\n"):
                    all_text_rows.append(line)

    if rows_written == 0 and all_text_rows:
        for line in all_text_rows:
            line = line.strip()
            if not line: continue
            date_match = re.search(date_pat, line)
            if not date_match: continue
            if any(kw in line.lower() for kw in ["date","narration","particulars","debit","credit","balance"]):
                continue
            date_val  = date_match.group()
            remainder = line[date_match.end():].strip()
            amounts   = re.findall(amount_pat, remainder)
            first_amt = re.search(amount_pat, remainder)
            narration = remainder[:first_amt.start()].strip() if first_amt else remainder

            debit   = amounts[0] if len(amounts) >= 3 else ""
            credit  = amounts[1] if len(amounts) >= 3 else (amounts[0] if len(amounts) == 2 else "")
            balance = amounts[-1] if amounts else ""

            row_num = rows_written + 2
            ws.cell(row=row_num, column=1, value=date_val)
            ws.cell(row=row_num, column=2, value=narration)
            ws.cell(row=row_num, column=3, value=debit)
            ws.cell(row=row_num, column=4, value=credit)
            ws.cell(row=row_num, column=5, value=balance)
            if rows_written % 2 == 1:
                for col in range(1, 6):
                    ws.cell(row=row_num, column=col).fill = alt_fill
            rows_written += 1

    ws.freeze_panes = "A2"

    if rows_written == 0:
        ws.cell(row=2, column=1, value="No transactions detected")
        ws.cell(row=2, column=2, value="Try a digital PDF from net banking instead of a scanned copy")

    wb.save('${outputPath}')
    print(f'SUCCESS: {rows_written} transactions extracted')

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
  'jpg-to-pdf':'jpg','png-to-pdf':'png','compress-pdf':'pdf',
  'bank-statement-to-excel':'pdf'
};
const OUTPUT_EXT = {
  'pdf-to-word':'docx','pdf-to-excel':'xlsx','pdf-to-ppt':'pptx',
  'pdf-to-jpg':'jpg','pdf-to-txt':'txt',
  'word-to-pdf':'pdf','excel-to-pdf':'pdf','ppt-to-pdf':'pdf',
  'jpg-to-pdf':'pdf','png-to-pdf':'pdf','compress-pdf':'pdf',
  'bank-statement-to-excel':'xlsx'
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
      const pyScript = path.join(jobDir, 'convert.py');
      fs.writeFileSync(pyScript, buildPythonScript(inputPath, outputPath));
      const { error, stdout, stderr } = await run(`python3 "${pyScript}"`);
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100) {
        throw new Error('pdf2docx conversion failed: ' + (stderr || 'output file empty or missing'));
      }
      console.log('[pdf2docx ✅] Output:', fs.statSync(outputPath).size, 'bytes');

    } else if (conversionType === 'bank-statement-to-excel') {
      const pyScript = path.join(jobDir, 'bank_convert.py');
      const pdfPassword = (req.body.pdfPassword || '').trim();
      fs.writeFileSync(pyScript, buildBankStatementScript(inputPath, outputPath, pdfPassword));
      const { error, stdout, stderr } = await run(`python3 "${pyScript}"`);
      console.log('[bank-statement]', stdout.trim() || stderr.trim());
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 100) {
        const errMsg = stderr || '';
        if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('encrypted') || errMsg.toLowerCase().includes('wrong password')) {
          throw new Error('PDF is password protected. Please enter the correct password and try again.');
        }
        throw new Error('Bank statement extraction failed: ' + (errMsg || 'output empty or missing.'));
      }
      console.log('[bank-statement ✅] Output:', fs.statSync(outputPath).size, 'bytes');

    } else if (conversionType === 'pdf-to-txt') {
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
      await run(`libreoffice --headless --convert-to ${outExt} --outdir "${jobDir}" "${inputPath}"`);
      const files = fs.readdirSync(jobDir);
      const found = files.find(f => f.endsWith('.' + outExt) && !f.startsWith('input.'));
      if (!found) throw new Error(`Conversion to ${outExt} failed. Dir: [${files.join(', ')}]`);
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

// ✅ Single app.listen() — Cloud Run requires exactly one
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RakDocs v11.0 | Port: ${PORT}`);
  run('python3 -c "from pdf2docx import Converter; print(\'pdf2docx ready ✅\')"')
    .then(r => console.log('[Python]', r.stdout.trim() || r.stderr.trim()));
  run('python3 -c "import pdfplumber, openpyxl; print(\'pdfplumber + openpyxl ready ✅\')"')
    .then(r => console.log('[Python]', r.stdout.trim() || r.stderr.trim()));
});
