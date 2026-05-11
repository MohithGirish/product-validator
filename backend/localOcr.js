const sharp = require('sharp');
const { recognize } = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
  BarcodeFormat,
} = require('@zxing/library');

const BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
];

const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  SEPT: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const OCR_ENGINE = String(process.env.OCR_ENGINE || 'paddle').trim().toLowerCase();
const PADDLE_ENABLED = OCR_ENGINE !== 'tesseract';
const PADDLE_OCR_LANG = String(process.env.PADDLE_OCR_LANG || 'en').trim() || 'en';
const PADDLE_TIMEOUT_MS = Number(process.env.PADDLE_TIMEOUT_MS || 25000);
const PADDLE_SCRIPT_PATH = path.resolve(__dirname, 'scripts/paddle_ocr_runner.py');

function resolvePythonExecutable() {
  const candidates = [
    String(process.env.PADDLE_PYTHON_EXECUTABLE || '').trim(),
    path.resolve(__dirname, '../.venv/Scripts/python.exe'),
    path.resolve(__dirname, '../.venv/bin/python'),
    'python',
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === 'python') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'python';
}

const PADDLE_PYTHON_EXECUTABLE = resolvePythonExecutable();

function bufferToDataUrl(buffer, mimeType = 'image/png') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function normalizeLine(line) {
  return String(line || '')
    .replace(/[\t ]+/g, ' ')
    .trim();
}

function uniqueBy(items, keySelector) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = keySelector(item);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(item);
    }
  }
  return output;
}

function toLines(text) {
  return normalizeWhitespace(text)
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean);
}

function parseNumberOr(defaultValue, value) {
  return Number.isFinite(value) ? value : defaultValue;
}

function runPaddleOcr(buffer) {
  return new Promise((resolve, reject) => {
    const child = spawn(PADDLE_PYTHON_EXECUTABLE, [PADDLE_SCRIPT_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timeoutMs = parseNumberOr(25000, PADDLE_TIMEOUT_MS);
    const timeoutHandle = setTimeout(() => {
      child.kill();
      reject(new Error(`PaddleOCR timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      reject(new Error(`Failed to start PaddleOCR process: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);

      if (code !== 0) {
        reject(new Error((stderr || `PaddleOCR exited with code ${code}.`).trim()));
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stdout || '{}');
      } catch {
        reject(new Error(`Invalid PaddleOCR JSON response: ${(stdout || '').slice(0, 400)}`));
        return;
      }

      if (!parsed || parsed.ok !== true) {
        reject(new Error(String(parsed?.error || 'PaddleOCR returned an invalid response.')));
        return;
      }

      resolve(parsed);
    });

    const payload = JSON.stringify({
      imageBase64: buffer.toString('base64'),
      lang: PADDLE_OCR_LANG,
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

async function recognizePaddlePass(buffer) {
  const result = await runPaddleOcr(buffer);
  const text = normalizeWhitespace(result?.text || '');

  const words = (Array.isArray(result?.words) ? result.words : [])
    .map((item) => ({
      text: normalizeLine(item?.text || ''),
      confidence: Number.isFinite(item?.confidence) ? Number(item.confidence) : 0,
    }))
    .filter((item) => item.text);

  const confidence = Number.isFinite(result?.confidence) ? Number(result.confidence) : 0;

  return {
    text,
    confidence,
    words,
  };
}

async function makeOcrVariants(buffer) {
  const variants = [];

  variants.push({ name: 'original', buffer });

  try {
    const base = sharp(buffer).rotate().resize({ width: 3200, withoutEnlargement: true });

    variants.push({
      name: 'normalized',
      buffer: await base.clone().normalize().png().toBuffer(),
    });

    variants.push({
      name: 'grayscale-contrast',
      buffer: await base
        .clone()
        .grayscale()
        .linear(1.6, -30)
        .normalize()
        .png()
        .toBuffer(),
    });

    variants.push({
      name: 'binary-threshold-150',
      buffer: await base
        .clone()
        .grayscale()
        .threshold(150)
        .png()
        .toBuffer(),
    });

    variants.push({
      name: 'binary-threshold-180',
      buffer: await base
        .clone()
        .grayscale()
        .threshold(180)
        .png()
        .toBuffer(),
    });

    variants.push({
      name: 'sharpened',
      buffer: await base
        .clone()
        .grayscale()
        .normalize()
        .sharpen({ sigma: 2, m1: 1.5, m2: 0.5 })
        .png()
        .toBuffer(),
    });

    // High-contrast invert for dark-background labels
    variants.push({
      name: 'inverted',
      buffer: await base
        .clone()
        .grayscale()
        .negate()
        .normalize()
        .png()
        .toBuffer(),
    });

    // Extra-upscaled for tiny batch code stamps
    variants.push({
      name: 'upscaled-sharp',
      buffer: await sharp(buffer)
        .rotate()
        .resize({ width: 4800, withoutEnlargement: true })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .png()
        .toBuffer(),
    });
  } catch {
    // Keep at least original variant.
  }

  return uniqueBy(variants, (item) => `${item.name}:${item.buffer.length}`);
}

async function recognizePass(buffer, mimeType, passConfig) {
  const options = {
    logger: () => {},
    tessedit_pageseg_mode: passConfig.psm,
    preserve_interword_spaces: '1',
  };

  if (passConfig.whitelist) {
    options.tessedit_char_whitelist = passConfig.whitelist;
  }

  const result = await recognize(bufferToDataUrl(buffer, mimeType), 'eng', options);
  const text = normalizeWhitespace(result?.data?.text || '');

  return {
    text,
    confidence: Number.isFinite(result?.data?.confidence) ? result.data.confidence : 0,
    words: Array.isArray(result?.data?.words) ? result.data.words : [],
  };
}

async function buildOcrContext(buffer, mimeType) {
  const variants = await makeOcrVariants(buffer);

  const BATCH_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/.- ()';

  const passPlan = [
    { psm: 6 },
    { psm: 11 },
    { psm: 4 },
    { psm: 7, whitelist: BATCH_WHITELIST },
    { psm: 8, whitelist: BATCH_WHITELIST },
    { psm: 13, whitelist: BATCH_WHITELIST },
  ];

  const passSpecs = [];
  variants.forEach((variant, index) => {
    if (index === 0) {
      passSpecs.push(
        { variant, config: passPlan[0] },
        { variant, config: passPlan[1] },
        { variant, config: passPlan[2] },
        { variant, config: passPlan[3] },
      );
    } else if (index === 1) {
      passSpecs.push(
        { variant, config: passPlan[0] },
        { variant, config: passPlan[3] },
        { variant, config: passPlan[4] },
      );
    } else if (index === 2) {
      passSpecs.push(
        { variant, config: passPlan[0] },
        { variant, config: passPlan[1] },
        { variant, config: passPlan[5] },
      );
    } else {
      passSpecs.push(
        { variant, config: passPlan[0] },
        { variant, config: passPlan[3] },
      );
    }
  });

  const passes = [];

  if (PADDLE_ENABLED) {
    for (let index = 0; index < variants.length; index += 1) {
      if (index > 2) break;
      const variant = variants[index];
      try {
        const result = await recognizePaddlePass(variant.buffer);
        if (!result.text) continue;
        passes.push({
          variant: variant.name,
          psm: 'paddle',
          whitelist: '',
          text: result.text,
          lines: toLines(result.text),
          confidence: result.confidence,
          words: result.words,
        });
      } catch {
        // Fall back to Tesseract passes when PaddleOCR is unavailable.
      }
    }
  }

  const runTesseractFallback = passes.length === 0;

  if (runTesseractFallback) {
  for (const spec of passSpecs) {
    try {
      const result = await recognizePass(spec.variant.buffer, mimeType, spec.config);
      if (!result.text) continue;
      passes.push({
        variant: spec.variant.name,
        psm: spec.config.psm,
        whitelist: spec.config.whitelist || '',
        text: result.text,
        lines: toLines(result.text),
        confidence: result.confidence,
        words: result.words,
      });
    } catch {
      // Continue with other fallback passes.
    }
  }
  }

  const dedupedPasses = uniqueBy(
    passes
      .sort((a, b) => b.confidence - a.confidence)
      .filter((pass) => pass.text.length > 0),
    (pass) => pass.text
  );

  const allLines = [];
  for (const pass of dedupedPasses) {
    for (const line of pass.lines) {
      allLines.push(line);
    }
  }

  const mergedText = uniqueBy(allLines, (line) => line.toUpperCase()).join('\n');

  return {
    passes: dedupedPasses,
    allLines,
    mergedText,
    bestText: dedupedPasses[0]?.text || '',
  };
}

async function decodeBarcodeVariant(buffer, angle) {
  const { data, info } = await sharp(buffer)
    .rotate(angle)
    .resize({ width: 2400, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const source = new RGBLuminanceSource(Uint8ClampedArray.from(data), info.width, info.height);
  const bitmap = new BinaryBitmap(new HybridBinarizer(source));
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
  reader.setHints(hints);

  return reader.decode(bitmap).getText();
}

function barcodeScore(value, contextText = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return -Infinity;

  let score = digits.length;
  if (digits.length === 13) score += 8;
  if (digits.length === 12) score += 6;
  if (digits.length === 8) score += 4;
  if (/barcode|ean|upc|code/i.test(contextText)) score += 12;
  if (/mrp|price|pkd|mfd|exp|batch|lot/i.test(contextText)) score -= 4;
  return score;
}

function extractBarcodeCandidatesFromOcr(ocrContext) {
  const candidates = [];

  for (const pass of ocrContext.passes) {
    for (const line of pass.lines) {
      const digitGroups = line.match(/\d[\d\s-]{6,20}\d/g) || [];
      for (const group of digitGroups) {
        const digits = group.replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 14) {
          candidates.push({
            value: digits,
            context: line,
            confidence: pass.confidence,
          });
        }
      }
    }

    if (Array.isArray(pass.words)) {
      for (const word of pass.words) {
        const digits = String(word?.text || '').replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 14) {
          candidates.push({
            value: digits,
            context: word?.text || '',
            confidence: Number.isFinite(word?.confidence) ? word.confidence : pass.confidence,
          });
        }
      }
    }
  }

  return candidates;
}

async function readBarcodeFromImage(buffer, ocrContext) {
  const variants = await makeOcrVariants(buffer);
  const decodedCandidates = [];

  for (const variant of variants) {
    for (const angle of [0, 90, 180, 270]) {
      try {
        const value = await decodeBarcodeVariant(variant.buffer, angle);
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) continue;
        decodedCandidates.push({ value: digits, context: `${variant.name}:${angle}`, confidence: 100 });
      } catch {
        // Continue scanning with other variants and orientations.
      }
    }
  }

  const ocrCandidates = extractBarcodeCandidatesFromOcr(ocrContext);
  const allCandidates = decodedCandidates.concat(ocrCandidates);
  if (allCandidates.length === 0) return '';

  const frequency = new Map();
  for (const candidate of allCandidates) {
    frequency.set(candidate.value, (frequency.get(candidate.value) || 0) + 1);
  }

  let best = '';
  let bestScore = -Infinity;
  for (const candidate of allCandidates) {
    const score = barcodeScore(candidate.value, candidate.context) + (candidate.confidence || 0) / 20 + (frequency.get(candidate.value) || 0) * 6;
    if (score > bestScore) {
      bestScore = score;
      best = candidate.value;
    }
  }

  return best;
}

function cleanCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, '')
    .replace(/\s+/g, ' ');
}

// Fix common OCR misreads char-by-char guided by what the format expects at each position.
// '#' expects a digit  → replace look-alike letters with digits
// '@' expects a letter → replace look-alike digits with letters
function applyFormatGuidedCorrection(text, format) {
  if (!text || !format) return text;

  const DIGIT_FIXES  = { O: '0', o: '0', I: '1', l: '1', i: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', g: '9', q: '9' };
  const LETTER_FIXES = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };

  // Align text chars to format chars, skipping literal separators in format that are missing in text
  const result = [];
  let ti = 0;
  for (let fi = 0; fi < format.length && ti < text.length; fi++) {
    const fc = format[fi];
    const tc = text[ti];
    if (fc === '#') {
      result.push(DIGIT_FIXES[tc] !== undefined ? DIGIT_FIXES[tc] : tc);
      ti++;
    } else if (fc === '@') {
      result.push(LETTER_FIXES[tc] !== undefined ? LETTER_FIXES[tc] : tc);
      ti++;
    } else {
      // Literal separator: if text char matches, consume it; if not, insert the expected char
      if (tc === fc) {
        result.push(tc);
        ti++;
      } else {
        result.push(fc);
      }
    }
  }
  // Append any remaining text chars
  while (ti < text.length) {
    result.push(text[ti++]);
  }
  return result.join('');
}

function buildFormatRegex(format) {
  if (!format) return null;

  let pattern = '';
  for (const char of format) {
    if (char === '#') {
      pattern += '\\d';
    } else if (char === '@') {
      pattern += '[A-Z]';
    } else if (char === ' ') {
      pattern += '\\s+';
    } else {
      pattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function inferBatchFormatFromCode(code) {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return '';

  return cleanCode
    .split('')
    .map((char) => {
      if (/\d/.test(char)) return '#';
      if (/[A-Za-z]/.test(char)) return '@';
      return char;
    })
    .join('');
}

function looksLikeDate(text) {
  return /\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b|\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b|\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)\b/i.test(String(text || ''));
}

function looksLikePrice(text) {
  return /(?:MRP|R\.?S\.?|₹|INR|PRICE)/i.test(String(text || ''));
}

function scoreBatchCandidate(candidate, line = '') {
  const text = cleanCandidate(candidate);
  if (!text) return -Infinity;

  let score = text.length;
  if (/[A-Za-z]/.test(text) && /\d/.test(text)) score += 8;
  if (/[:/\-. ]/.test(text)) score += 3;
  if (text.length >= 6 && text.length <= 20) score += 4;
  if (/batch|lot|code|mfg|mfd|pkd|b\.?\s*no/i.test(line)) score += 10;
  if (looksLikeDate(text)) score -= 10;
  if (looksLikePrice(text)) score -= 10;
  if (/^\d+$/.test(text) && text.length < 8) score -= 6;
  return score;
}

function findBatchCodeFromContext(ocrContext, batchFormat) {
  const formatRegex = buildFormatRegex(batchFormat);
  const candidates = [];

  for (const pass of ocrContext.passes) {
    const compactText = normalizeWhitespace(pass.text).replace(/\n/g, ' ');
    if (formatRegex) {
      const directMatches = compactText.match(new RegExp(formatRegex.source, 'gi')) || [];
      for (const match of directMatches) {
        const cleaned = cleanCandidate(match);
        if (cleaned) {
          candidates.push({ value: cleaned, score: 200 + pass.confidence / 10 });
        }
      }
    }

    for (const line of pass.lines) {
      const tokens = line.match(/[A-Z0-9][A-Z0-9:/ .-]{2,}[A-Z0-9]/gi) || [];
      for (const token of tokens) {
        const cleaned = cleanCandidate(token);
        if (!cleaned) continue;

        if (formatRegex && formatRegex.test(cleaned)) {
          candidates.push({ value: cleaned, score: 150 + pass.confidence / 10 });
          continue;
        }

        // Try correcting common OCR misreads guided by the format
        if (batchFormat) {
          const corrected = applyFormatGuidedCorrection(cleaned, batchFormat);
          if (corrected !== cleaned && formatRegex && formatRegex.test(corrected)) {
            candidates.push({ value: corrected, score: 120 + pass.confidence / 10 });
            continue;
          }
        }

        candidates.push({
          value: cleaned,
          score: scoreBatchCandidate(cleaned, line) + pass.confidence / 20,
        });
      }
    }
  }

  if (candidates.length === 0) return '';

  const grouped = new Map();
  for (const candidate of candidates) {
    grouped.set(candidate.value, (grouped.get(candidate.value) || 0) + candidate.score);
  }

  let best = '';
  let bestScore = -Infinity;
  for (const [value, score] of grouped.entries()) {
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }

  // Last resort: if the winner still doesn't match the format, try correcting it
  if (best && batchFormat && formatRegex && !formatRegex.test(best)) {
    const corrected = applyFormatGuidedCorrection(best, batchFormat);
    if (formatRegex.test(corrected)) return corrected;
  }

  return best;
}

function normalizeYear(year) {
  if (!year) return '';
  if (year.length === 2) {
    const numeric = Number(year);
    return numeric >= 70 ? `19${year}` : `20${year}`;
  }
  return year;
}

function formatDate(year, month, day = '01') {
  if (!year || !month) return '';
  const yy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parseMonthDate(text) {
  const upper = String(text || '').toUpperCase();
  const match = upper.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\b[\s,./-]*(\d{2,4})/);
  if (!match) return '';

  const month = MONTHS[match[1]];
  const year = normalizeYear(match[2]);
  if (!month || !year) return '';
  return formatDate(year, month, '01');
}

function parseNumericDate(text) {
  const normalized = String(text || '').replace(/[,()]/g, ' ');

  let match = normalized.match(/\b(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (match) return formatDate(match[1], match[2], match[3]);

  match = normalized.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return formatDate(normalizeYear(match[3]), month, day);
    }
  }

  if (/^\s*(?:₹|rs\.?|inr|mrp|price)\b/i.test(normalized) || /^\s*\d+\.\d{1,2}\s*$/i.test(normalized)) {
    return '';
  }

  match = normalized.match(/\b(\d{1,2})[\/-](\d{2,4})\b/);
  if (match) {
    const month = Number(match[1]);
    if (month >= 1 && month <= 12) {
      return formatDate(normalizeYear(match[2]), month, '01');
    }
  }

  return '';
}

function parseDateToken(text) {
  const cleaned = cleanCandidate(text);
  if (!cleaned) return '';
  return parseNumericDate(cleaned) || parseMonthDate(cleaned);
}

function extractDateCandidatesFromText(text) {
  const source = String(text || '');
  const matches = [];
  const patterns = [
    /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g,
    /\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/g,
    /\b\d{1,2}[\/.-]\d{2,4}\b/g,
    /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\b[\s,./-]*\d{2,4}\b/gi,
  ];

  for (const pattern of patterns) {
    const found = source.match(pattern) || [];
    for (const item of found) {
      const parsed = parseDateToken(item);
      if (parsed) {
        matches.push(parsed);
      }
    }
  }

  return uniqueBy(matches, (value) => value);
}

function joinLabelWindow(lines, index, span = 3) {
  const window = [];
  for (let offset = 0; offset <= span; offset += 1) {
    if (lines[index + offset]) window.push(lines[index + offset]);
  }
  return window.join(' ');
}

function findDateByLabels(ocrContext, labelRegex) {
  const scoredCandidates = [];

  for (const pass of ocrContext.passes) {
    for (let index = 0; index < pass.lines.length; index += 1) {
      const line = pass.lines[index];
      if (!labelRegex.test(line)) continue;

      const nearby = [
        line,
        pass.lines[index + 1] || '',
        pass.lines[index + 2] || '',
        pass.lines[index - 1] || '',
      ].filter(Boolean);

      for (const block of nearby) {
        const dateCandidates = extractDateCandidatesFromText(block);
        if (dateCandidates.length > 0) {
          const lineHasLabel = labelRegex.test(line) ? 12 : 0;
          const blockScore = block === line ? 10 : block === (pass.lines[index + 1] || '') ? 8 : 4;
          for (const candidate of dateCandidates) {
            scoredCandidates.push({ value: candidate, score: lineHasLabel + blockScore });
          }
        }
      }

      const windowText = joinLabelWindow(pass.lines, index, 4);
      const windowCandidates = extractDateCandidatesFromText(windowText);
      if (windowCandidates.length > 0) {
        for (const candidate of windowCandidates) {
          scoredCandidates.push({ value: candidate, score: 2 });
        }
      }
    }
  }

  if (scoredCandidates.length > 0) {
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates[0].value;
  }

  return '';
}

function extractPriceFromContext(ocrContext) {
  for (const pass of ocrContext.passes) {
    for (const line of pass.lines) {
      const priceMatch = line.match(/(?:MRP|R\.?S\.?|₹|INR|PRICE)\s*[:\-]?\s*(?:₹|RS\.?\s*)?([0-9]+(?:\.[0-9]{1,2})?)/i);
      if (!priceMatch) continue;
      const amount = priceMatch[1];
      if (/₹/.test(line)) return `₹${amount}`;
      return `Rs.${amount}`;
    }
  }

  return '';
}

function extractProductNameFromContext(ocrContext) {
  const ignorePattern = /(barcode|batch|lot|mfd|mfg|pkd|exp|use by|best before|mrp|price|rs\.?|₹|ingredients?|nutrition|net wt|net weight|manufactur|code|pack|gst|fssai)/i;

  const candidates = [];

  for (const pass of ocrContext.passes) {
    for (let index = 0; index < Math.min(pass.lines.length, 14); index += 1) {
      const line = pass.lines[index];
      if (!line || ignorePattern.test(line)) continue;

      const letters = (line.match(/[A-Z]/gi) || []).length;
      const digits = (line.match(/\d/g) || []).length;
      if (letters < 3 || digits > letters) continue;

      let score = letters + pass.confidence / 12;
      if (index <= 5) score += 8;
      if (line.length >= 8 && line.length <= 60) score += 6;
      if (/^[A-Z0-9\s&().,'/-]+$/i.test(line)) score += 3;
      if (/(mrp|batch|lot|exp|pkd|mfd|price)/i.test(line)) score -= 8;

      candidates.push({ line, score });
    }
  }

  if (candidates.length === 0) return '';

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].line;
}

function extractRelevantBatchText(ocrContext) {
  const labelPattern = /(batch|lot|mfd|mfg|pkd|exp|use by|best before|mrp|price|packed|manufactur|expiry|best-before|b\.?\s*no)/i;
  const selected = [];

  for (const line of ocrContext.allLines) {
    if (labelPattern.test(line)) {
      selected.push(line);
    }
  }

  const deduped = uniqueBy(selected, (line) => line.toUpperCase());
  if (deduped.length > 0) return deduped.join('\n');
  return ocrContext.bestText || ocrContext.mergedText || '';
}

async function recognizeText(buffer, mimeType) {
  const context = await buildOcrContext(buffer, mimeType);
  return context.bestText || context.mergedText || '';
}

async function extractProductInfoFromImageBuffer(buffer, mimeType) {
  const ocrContext = await buildOcrContext(buffer, mimeType);
  const barcode = await readBarcodeFromImage(buffer, ocrContext);
  const productName = extractProductNameFromContext(ocrContext);

  return {
    barcode: String(barcode || '').replace(/\D/g, ''),
    productName: productName || '',
  };
}

async function extractBatchCodeFromImageBuffer(buffer, mimeType, batchFormat) {
  const ocrContext = await buildOcrContext(buffer, mimeType);
  const batchCode = findBatchCodeFromContext(ocrContext, batchFormat || '');
  const productionDate = findDateByLabels(ocrContext, /(mfd|pkd|mfg|manufactured|packed on)/i);
  const expiryDate = findDateByLabels(ocrContext, /(exp|expiry|best before|best-before|use by|bb)/i);
  const price = extractPriceFromContext(ocrContext);

  return {
    batchCode: batchCode || '',
    productionDate: productionDate || '',
    expiryDate: expiryDate || '',
    price: price || '',
  };
}

async function extractBatchFormatFromImageBuffer(buffer, mimeType) {
  const ocrContext = await buildOcrContext(buffer, mimeType);
  const batchCode = findBatchCodeFromContext(ocrContext, '');
  const price = extractPriceFromContext(ocrContext);
  const priceMatch = price.match(/([0-9]+(?:\.[0-9]{1,2})?)/);

  return {
    batchInfoText: extractRelevantBatchText(ocrContext),
    batchFormat: batchCode ? inferBatchFormatFromCode(batchCode) : '',
    mrp: priceMatch ? Number(priceMatch[1]) : null,
    productionDate: findDateByLabels(ocrContext, /(mfd|pkd|mfg|manufactured|packed on)/i) || null,
    expiryDate: findDateByLabels(ocrContext, /(exp|expiry|best before|best-before|use by|bb)/i) || null,
  };
}

async function analyzeImageFromBuffer(buffer, mimeType, prompt) {
  const ocrContext = await buildOcrContext(buffer, mimeType);
  const barcode = await readBarcodeFromImage(buffer, ocrContext);
  const batchCode = findBatchCodeFromContext(ocrContext, '');
  const productionDate = findDateByLabels(ocrContext, /(mfd|pkd|mfg|manufactured|packed on)/i) || '[not found]';
  const expiryDate = findDateByLabels(ocrContext, /(exp|expiry|best before|best-before|use by|bb)/i) || '[not found]';
  const price = extractPriceFromContext(ocrContext) || '[not found]';
  const productName = extractProductNameFromContext(ocrContext) || '[not found]';

  const sections = [
    'Local OCR result',
    '-----------------',
    ocrContext.bestText || ocrContext.mergedText || '[No text detected]',
    '',
    'Detected fields',
    '----------------',
    `Barcode: ${String(barcode || '').replace(/\D/g, '') || '[not found]'}`,
    `Product Name: ${productName}`,
    `Batch Code: ${batchCode || '[not found]'}`,
    `Batch Format: ${batchCode ? inferBatchFormatFromCode(batchCode) : '[not found]'}`,
    `Production Date: ${productionDate}`,
    `Expiry Date: ${expiryDate}`,
    `MRP: ${price}`,
  ];

  if (prompt) {
    sections.push('', `Note: ${prompt}`);
    sections.push('This report is generated fully with local OCR + barcode decoding heuristics.');
  }

  return sections.join('\n');
}

module.exports = {
  recognizeText,
  readBarcodeFromImage,
  extractProductInfoFromImageBuffer,
  extractBatchCodeFromImageBuffer,
  extractBatchFormatFromImageBuffer,
  analyzeImageFromBuffer,
  inferBatchFormatFromCode,
  buildFormatRegex,
  extractProductInfoFromBuffer: extractProductInfoFromImageBuffer,
  extractBatchExtractionFromBuffer: extractBatchCodeFromImageBuffer,
  extractBatchFormatFromBuffer: extractBatchFormatFromImageBuffer,
  analyzeImageFromBuffer: analyzeImageFromBuffer,
};
