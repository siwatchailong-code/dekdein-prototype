/**
 * Build step for Vercel (see vercel.json -> buildCommand).
 *
 * This is a static HTML/CSS/JS project with no bundler, so there is no
 * other mechanism to get environment variables from Vercel's project
 * settings into browser-side code. This script runs during the Vercel
 * build and writes env.js from process.env — env.js is what index.html
 * actually loads at runtime.
 *
 * It never reads or writes a real key into the git repo: env.js is
 * git-ignored and only ever exists inside the build output.
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[generate-env] SUPABASE_URL / SUPABASE_ANON_KEY are not set. ' +
    'Set them in Vercel -> Project Settings -> Environment Variables. ' +
    'Writing env.js with empty values so the build still completes; ' +
    'the deployed app will show "Supabase not configured" until you set them.'
  );
}

const contents =
  '// AUTO-GENERATED at build time from environment variables. Do not edit by hand, do not commit.\n' +
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

fs.writeFileSync(path.join(__dirname, '..', 'env.js'), contents);
console.log('[generate-env] wrote env.js');
