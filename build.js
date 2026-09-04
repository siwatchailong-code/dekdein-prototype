/**
 * Build step for Vercel (see vercel.json -> buildCommand / outputDirectory).
 *
 * This is a static HTML/CSS/JS project with no bundler, so "build" means
 * two things:
 *
 *   1. Assemble a real `public/` directory containing every static file
 *      the site needs (index.html, app.js, styles.css, assets/). Vercel's
 *      outputDirectory is set to "public" in vercel.json, so whatever ends
 *      up in here is exactly what gets deployed.
 *   2. Write public/env.js from environment variables — the only way to
 *      get Vercel Project Settings env vars into browser-side code without
 *      a bundler. index.html loads /env.js at runtime.
 *
 * SECURITY: this script must only ever read SUPABASE_URL and
 * SUPABASE_ANON_KEY. Never read or write SUPABASE_SERVICE_ROLE_KEY (or any
 * other secret) here — anything this script writes into public/env.js is
 * shipped to every visitor's browser in plain text.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');

// Files that must end up at the root of the deployed site.
const STATIC_FILES = ['index.html', 'app.js', 'styles.css'];
// Directories copied recursively if present (e.g. images/fonts). Empty or
// missing directories are skipped silently — this project currently ships
// with no binary assets (icons are inline SVG/emoji).
const STATIC_DIRS = ['assets'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ---- 1. assemble public/ ----
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of STATIC_FILES) {
  const src = path.join(ROOT, file);
  if (!fs.existsSync(src)) {
    throw new Error('[build] required file missing: ' + file);
  }
  fs.copyFileSync(src, path.join(OUT, file));
  console.log('[build] copied ' + file + ' -> public/' + file);
}

for (const dir of STATIC_DIRS) {
  const src = path.join(ROOT, dir);
  if (fs.existsSync(src) && fs.readdirSync(src).length > 0) {
    copyRecursive(src, path.join(OUT, dir));
    console.log('[build] copied ' + dir + '/ -> public/' + dir + '/');
  }
}

// ---- 2. write public/env.js from env vars (anon-safe values only) ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[build] SUPABASE_URL / SUPABASE_ANON_KEY are not set. ' +
    'Set them in Vercel -> Project Settings -> Environment Variables. ' +
    'Writing env.js with empty values so the build still completes; ' +
    'the deployed app will show "Supabase not configured" until you set them.'
  );
}

const envContents =
  '// AUTO-GENERATED at build time from environment variables. Do not edit by hand, do not commit.\n' +
  '// Only the public anon key ships here — never the service_role key.\n' +
  'window.__ENV__ = ' +
  JSON.stringify(
    {
      SUPABASE_URL: SUPABASE_URL || '',
      SUPABASE_ANON_KEY: SUPABASE_ANON_KEY || ''
    },
    null,
    2
  ) +
  ';\n';

fs.writeFileSync(path.join(OUT, 'env.js'), envContents);
console.log('[build] wrote public/env.js');

// ---- 3. sanity check: this is what Vercel will actually deploy ----
for (const required of ['index.html', 'app.js', 'styles.css', 'env.js']) {
  if (!fs.existsSync(path.join(OUT, required))) {
    throw new Error('[build] public/' + required + ' is missing after build — aborting');
  }
}
console.log('[build] done — public/ is ready to deploy');
