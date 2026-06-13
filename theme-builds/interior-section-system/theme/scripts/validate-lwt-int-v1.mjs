import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');

const sectionFiles = [
  'sections/lwt-int-hero-v1.liquid',
  'sections/lwt-int-card-grid-v1.liquid',
  'sections/lwt-int-proof-strip-v1.liquid',
  'sections/lwt-int-split-v1.liquid',
  'sections/lwt-int-process-v1.liquid',
  'sections/lwt-int-cta-v1.liquid',
];

const supportFiles = [
  'assets/lwt-int-v1.css',
  'snippets/lwt-int-v1-bg.liquid',
  'snippets/lwt-int-v1-style-loader.liquid',
  'templates/page.lwt-int-preview.json',
];

const errors = [];

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function parseThemeJson(relativePath, source) {
  const withoutHeaderComment = source.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  try {
    return JSON.parse(withoutHeaderComment);
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
    return null;
  }
}

function extractSchema(relativePath, source) {
  const match = source.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/);
  if (!match) {
    errors.push(`${relativePath}: missing schema block`);
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    errors.push(`${relativePath}: invalid schema JSON (${error.message})`);
    return null;
  }
}

for (const file of [...supportFiles, ...sectionFiles]) {
  if (!(await exists(file))) {
    errors.push(`${file}: missing`);
  }
}

for (const file of sectionFiles) {
  if (!(await exists(file))) continue;

  const source = await read(file);
  const schema = extractSchema(file, source);

  if (schema?.name && schema.name.length > 25) {
    errors.push(`${file}: schema name "${schema.name}" is ${schema.name.length} characters; max is 25`);
  }

  if (!source.includes("{% render 'lwt-int-v1-style-loader' %}")) {
    errors.push(`${file}: must render lwt-int-v1-style-loader`);
  }

  if (!source.includes("{% render 'lwt-int-v1-bg'")) {
    errors.push(`${file}: must render lwt-int-v1-bg`);
  }

  const settings = Array.isArray(schema?.settings) ? schema.settings : [];
  const hasFlowSetting = settings.some((setting) => setting.id === 'flow_position');
  if (!hasFlowSetting) {
    errors.push(`${file}: schema must include flow_position setting`);
  }

  for (const bgSetting of ['bg_image', 'bg_asset', 'bg_position', 'bg_size', 'bg_opacity']) {
    if (!settings.some((setting) => setting.id === bgSetting)) {
      errors.push(`${file}: schema must include ${bgSetting} setting`);
    }
  }
}

if (await exists('assets/lwt-int-v1.css')) {
  const css = await read('assets/lwt-int-v1.css');
  for (const requiredClass of ['.lwt-int__bg-image', '.lwt-int-flow--continuous']) {
    if (!css.includes(requiredClass)) {
      errors.push(`assets/lwt-int-v1.css: missing ${requiredClass}`);
    }
  }

  if (/font-size\s*:\s*[^;]*vw/i.test(css)) {
    errors.push('assets/lwt-int-v1.css: do not scale font size directly with viewport width');
  }
}

if (await exists('snippets/lwt-int-v1-bg.liquid')) {
  const bgSnippet = await read('snippets/lwt-int-v1-bg.liquid');
  for (const requiredText of ['lwt-int__bg', 'lwt-int__bg-image', 'bg_image']) {
    if (!bgSnippet.includes(requiredText)) {
      errors.push(`snippets/lwt-int-v1-bg.liquid: missing ${requiredText}`);
    }
  }
}

if (await exists('templates/index.json')) {
  const indexTemplate = await read('templates/index.json');
  if (indexTemplate.includes('lwt-int-')) {
    errors.push('templates/index.json: homepage must not use lwt-int-v1 sections');
  }
}

if (await exists('templates/page.lwt-int-preview.json')) {
  const previewTemplate = parseThemeJson(
    'templates/page.lwt-int-preview.json',
    await read('templates/page.lwt-int-preview.json'),
  );
  if (previewTemplate) {
    const sections = previewTemplate.sections ?? {};
    for (const [sectionId, section] of Object.entries(sections)) {
      if (!section?.type?.startsWith('lwt-int-')) continue;
      const sectionPath = `sections/${section.type}.liquid`;
      if (!(await exists(sectionPath))) {
        errors.push(`templates/page.lwt-int-preview.json: section "${sectionId}" references missing ${sectionPath}`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('lwt-int-v1 validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('lwt-int-v1 validation passed');
