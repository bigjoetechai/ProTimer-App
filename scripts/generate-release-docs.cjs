#!/usr/bin/env node
/**
 * Automatically generates:
 *   1. RELEASE_NOTES_<TAG>.md  (e.g. RELEASE_NOTES_v3.0.1.md)
 *   2. README.md
 *
 * Designed to run both locally (`npm run docs:release`) and inside GitHub Actions
 * whenever a new version tag or GitHub Release is created.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

function readPackageJson() {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function parseRepoSlug(pkg) {
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.includes('/')) {
    return process.env.GITHUB_REPOSITORY.trim();
  }
  const rawUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository && pkg.repository.url;
  if (rawUrl) {
    const match = rawUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/i);
    if (match) return match[1];
  }
  return 'bigjoetechai/ProTimer-App';
}

function sanitizeTagForFilename(tag) {
  return String(tag).trim().replace(/[^A-Za-z0-9._-]/g, '_');
}

function normalizeVersion(rawVersion, rawTag) {
  let version = (rawVersion || '').trim().replace(/^v/i, '');
  let tag = (rawTag || '').trim();

  if (!version && tag) {
    version = tag.replace(/^v/i, '');
  }
  if (!tag && version) {
    tag = `v${version}`;
  }
  if (!tag.startsWith('v') && /^\d+\.\d+\.\d+/.test(tag)) {
    tag = `v${tag}`;
  }
  return { version, tag };
}

function parseSemver(ver) {
  const clean = String(ver || '').trim().replace(/^v/i, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareSemverDesc(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return String(b).localeCompare(String(a));
  if (!pa) return 1;
  if (!pb) return -1;
  if (pa.major !== pb.major) return pb.major - pa.major;
  if (pa.minor !== pb.minor) return pb.minor - pa.minor;
  if (pa.patch !== pb.patch) return pb.patch - pa.patch;
  if (!pa.prerelease && pb.prerelease) return -1;
  if (pa.prerelease && !pb.prerelease) return 1;
  return pb.prerelease.localeCompare(pa.prerelease);
}

function detectReleaseType(version, previousTag) {
  const curr = parseSemver(version);
  if (!curr) return 'Standard Release';
  if (curr.prerelease) {
    const pre = curr.prerelease.toLowerCase();
    if (pre.includes('alpha')) return 'Alpha Pre-Release';
    if (pre.includes('beta')) return 'Beta Pre-Release';
    if (pre.includes('rc')) return 'Release Candidate';
    return 'Pre-Release';
  }
  const prev = parseSemver(previousTag);
  if (prev) {
    if (curr.major > prev.major) return 'Major Release';
    if (curr.minor > prev.minor) return 'Minor Feature Release';
    if (curr.patch > prev.patch) return 'Patch & Maintenance Release';
  }
  if (curr.minor === 0 && curr.patch === 0) return 'Major Release';
  if (curr.patch === 0) return 'Minor Feature Release';
  return 'Patch & Maintenance Release';
}

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function findPreviousTag(currentTag) {
  const rawTags = runGit(['tag', '--list', 'v*', '--sort=-v:refname']);
  if (!rawTags) return '';
  const tags = rawTags
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const t of tags) {
    if (t !== currentTag) {
      return t;
    }
  }
  return '';
}

function collectGitCommits(previousTag, targetRef) {
  const ref = targetRef || 'HEAD';
  const range = previousTag ? `${previousTag}..${ref}` : ref;
  const format = '%h%x1f%s%x1f%an';
  const args = ['log', range, `--pretty=format:${format}`, '--no-merges'];
  if (!previousTag) {
    args.push('-n', '30');
  }
  const output = runGit(args);
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .map((line) => line.split('\x1f'))
    .filter((parts) => parts.length >= 2)
    .map(([hash, subject, author]) => ({
      hash: (hash || '').trim(),
      subject: (subject || '').trim(),
      author: (author || '').trim(),
    }))
    .filter((c) => {
      if (!c.subject) return false;
      if (/\[skip ci\]/i.test(c.subject)) return false;
      if (/^docs\(release\):/i.test(c.subject)) return false;
      if (/^merge (pull request|branch)/i.test(c.subject)) return false;
      return true;
    });
}

function categorizeCommits(commits) {
  const buckets = {
    features: [],
    fixes: [],
    improvements: [],
  };

  for (const commit of commits) {
    const s = commit.subject;
    const lower = s.toLowerCase();
    const cleaned = s.replace(/^(feat|fix|perf|refactor|chore|docs|ci|build|style)(\([^)]+\))?:\s*/i, '').trim();
    const label = cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : s;
    const entry = { ...commit, label };

    if (/^(feat(\(|:)|add\b|implement\b|introduce\b|support\b)/i.test(lower)) {
      buckets.features.push(entry);
    } else if (/^(fix(\(|:)|resolve\b|repair\b|patch\b|hotfix\b)/i.test(lower) || /\bfix(es|ed)?\b/i.test(lower)) {
      buckets.fixes.push(entry);
    } else {
      buckets.improvements.push(entry);
    }
  }

  return buckets;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx >= 2 ? 1 : 0)} ${units[idx]}`;
}

function computeSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function scanAssetsDirectory(assetsDir) {
  if (!assetsDir) return [];
  const resolved = path.resolve(ROOT_DIR, assetsDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];

  return fs
    .readdirSync(resolved)
    .map((name) => {
      const fullPath = path.join(resolved, name);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return null;
      return {
        name,
        fullPath,
        size: stat.size,
        sizeLabel: formatBytes(stat.size),
      };
    })
    .filter(Boolean);
}

function resolveDownloadEntries(version, tag, repo, scannedAssets) {
  const baseUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}`;

  const findAsset = (matcher, fallbackName) => {
    const found = scannedAssets.find((a) => matcher(a.name));
    const filename = found ? found.name : fallbackName;
    return {
      filename,
      url: `${baseUrl}/${encodeURIComponent(filename)}`,
      sizeLabel: found ? found.sizeLabel : null,
      fullPath: found ? found.fullPath : null,
    };
  };

  return [
    {
      platform: 'Windows (x64)',
      packageType: 'Installer (Auto-Update)',
      notes: 'Recommended — supports automatic in-app updates',
      ...findAsset((n) => /Setup\.exe$/i.test(n), `ProTimer-v${version}-Setup.exe`),
    },
    {
      platform: 'Windows (x64)',
      packageType: 'Portable Executable',
      notes: 'No installation required',
      ...findAsset((n) => /Portable\.exe$/i.test(n), `ProTimer-v${version}-Portable.exe`),
    },
    {
      platform: 'macOS (Apple Silicon)',
      packageType: 'DMG Installer (`arm64`)',
      notes: 'For M1 / M2 / M3 / M4 Macs',
      ...findAsset((n) => /Mac-arm64\.dmg$/i.test(n), `ProTimer-v${version}-Mac-arm64.dmg`),
    },
    {
      platform: 'macOS (Apple Silicon)',
      packageType: 'ZIP Archive (`arm64`)',
      notes: 'Portable macOS bundle',
      ...findAsset((n) => /Mac-arm64\.zip$/i.test(n), `ProTimer-v${version}-Mac-arm64.zip`),
    },
    {
      platform: 'macOS (Intel)',
      packageType: 'DMG Installer (`x64`)',
      notes: 'For Intel-based Macs',
      ...findAsset((n) => /Mac-x64\.dmg$/i.test(n), `ProTimer-v${version}-Mac-x64.dmg`),
    },
    {
      platform: 'macOS (Intel)',
      packageType: 'ZIP Archive (`x64`)',
      notes: 'Portable macOS bundle',
      ...findAsset((n) => /Mac-x64\.zip$/i.test(n), `ProTimer-v${version}-Mac-x64.zip`),
    },
    {
      platform: 'Linux (x64)',
      packageType: 'AppImage (Auto-Update)',
      notes: 'Universal Linux package with auto-update support',
      ...findAsset((n) => /\.AppImage$/i.test(n), `ProTimer-v${version}-Linux-x64.AppImage`),
    },
    {
      platform: 'Linux (x64)',
      packageType: 'Debian / Ubuntu (`.deb`)',
      notes: 'Install with `sudo apt install ./ProTimer-*.deb`',
      ...findAsset((n) => /\.deb$/i.test(n), `ProTimer-v${version}-Linux-amd64.deb`),
    },
  ];
}

function buildDownloadsTable(entries, includeSize) {
  const header = includeSize
    ? '| Platform | Package | Download | Size | Notes |\n| :--- | :--- | :--- | ---: | :--- |'
    : '| Platform | Package | Download | Notes |\n| :--- | :--- | :--- | :--- |';

  const rows = entries.map((e) => {
    const link = `[${e.filename}](${e.url})`;
    if (includeSize) {
      return `| ${e.platform} | ${e.packageType} | ${link} | ${e.sizeLabel || '—'} | ${e.notes} |`;
    }
    return `| ${e.platform} | ${e.packageType} | ${link} | ${e.notes} |`;
  });

  return `${header}\n${rows.join('\n')}`;
}

function buildReleaseNotesMarkdown({
  productName,
  author,
  version,
  tag,
  releaseType,
  releaseDate,
  repo,
  previousTag,
  commits,
  downloadEntries,
  scannedAssets,
}) {
  const hasRealSizes = downloadEntries.some((e) => Boolean(e.sizeLabel));
  const categorized = categorizeCommits(commits);
  const totalCommits = commits.length;

  const lines = [];
  lines.push(`# ${productName} ${tag} — Release Notes`);
  lines.push('');
  lines.push(`> **${releaseType}** · Released on **${releaseDate}** · Published by **${author}**`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| :--- | :--- |');
  lines.push(`| **Version** | \`${version}\` |`);
  lines.push(`| **Release Tag** | [\`${tag}\`](https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}) |`);
  lines.push(`| **Release Type** | ${releaseType} |`);
  lines.push(`| **Release Date** | ${releaseDate} |`);
  if (previousTag) {
    lines.push(
      `| **Full Changelog** | [\`${previousTag}...${tag}\`](https://github.com/${repo}/compare/${encodeURIComponent(previousTag)}...${encodeURIComponent(tag)}) |`
    );
  }
  lines.push('');

  lines.push('## What\'s New & Changed');
  lines.push('');

  if (totalCommits > 0) {
    if (categorized.features.length > 0) {
      lines.push('### New Features');
      for (const c of categorized.features) {
        lines.push(`- ${c.label} (\`${c.hash}\`)`);
      }
      lines.push('');
    }
    if (categorized.fixes.length > 0) {
      lines.push('### Fixes & Reliability');
      for (const c of categorized.fixes) {
        lines.push(`- ${c.label} (\`${c.hash}\`)`);
      }
      lines.push('');
    }
    if (categorized.improvements.length > 0) {
      lines.push('### Improvements & Maintenance');
      for (const c of categorized.improvements) {
        lines.push(`- ${c.label} (\`${c.hash}\`)`);
      }
      lines.push('');
    }
  } else {
    lines.push('### Highlights');
    lines.push('- **Cross-Platform Desktop Releases**: Native builds for Windows (x64 Installer & Portable), macOS Apple Silicon (`arm64`), macOS Intel (`x64`), and Linux (`AppImage` & `.deb`).');
    lines.push('- **Independent Multi-List NDI® Broadcast Output**: Stream each timer list tab as its own dedicated NDI network video source with clean stream names and independent state synchronization.');
    lines.push('- **Global Keyboard Shortcuts Manager**: Trigger Start/Pause, Reset, Next/Previous timer, and tab switching without leaving your production workflow.');
    lines.push('- **Reusable List Templates**: Save any cue list as a template or instantly load built-in presets (Sunday Service, Sports, Conference, and more) in the New Timer workflow.');
    lines.push('- **GitHub Auto-Updater**: Reliable one-click **Check for Updates** and automatic installer updates via GitHub Releases (`latest.yml`, `latest-mac.yml`, `latest-linux.yml`).');
    lines.push('- **Refined Launch Experience & Tab Controls**: Extended animated ProTimer launch splash and full right-click tab context menu (Edit, Rename, Save as Template, Delete).');
    lines.push('');
  }

  lines.push(`## Downloads (${tag})`);
  lines.push('');
  lines.push(buildDownloadsTable(downloadEntries, hasRealSizes));
  lines.push('');

  const checksumTargets = downloadEntries.filter((e) => e.fullPath && fs.existsSync(e.fullPath));
  if (checksumTargets.length > 0) {
    lines.push('<details>');
    lines.push('<summary>SHA-256 Checksums</summary>');
    lines.push('');
    lines.push('```text');
    for (const item of checksumTargets) {
      lines.push(`${computeSha256(item.fullPath)}  ${item.filename}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  } else if (scannedAssets.length > 0) {
    lines.push(`_Built with ${scannedAssets.length} verified release assets and auto-updater manifests._`);
    lines.push('');
  }

  lines.push('## Upgrading & Auto-Updates');
  lines.push('');
  lines.push('- **Windows Installer (`Setup.exe`) & Linux (`AppImage`)**: Open **Help → Check for Updates** (or **Settings → Updates**) inside ProTimer to download and install new releases automatically.');
  lines.push('- **Windows Portable / macOS (`.dmg` / `.zip`) / Linux (`.deb`)**: ProTimer notifies you as soon as a new release is available and lets you download the matching installer directly from GitHub Releases.');
  lines.push('- **macOS First Launch Note**: Because macOS builds are currently ad-hoc signed, if Gatekeeper warns on first launch, right-click `ProTimer.app` → **Open** (or allow it under **System Settings → Privacy & Security**).');
  lines.push('');
  lines.push('---');
  lines.push(`_Generated automatically for ${productName} ${tag} · [All Releases](https://github.com/${repo}/releases) · [README](./README.md)_`);
  lines.push('');

  return lines.join('\n');
}

function collectReleaseHistoryFiles(outDir, currentFilename, currentTag) {
  const existing = fs
    .readdirSync(outDir)
    .filter((name) => /^RELEASE_NOTES_.+\.md$/i.test(name));

  if (!existing.includes(currentFilename)) {
    existing.push(currentFilename);
  }

  const parsed = existing.map((filename) => {
    const match = filename.match(/^RELEASE_NOTES_(.+)\.md$/i);
    const tag = match ? match[1] : currentTag;
    return { filename, tag };
  });

  parsed.sort((a, b) => compareSemverDesc(a.tag, b.tag));
  return parsed;
}

function encodeShieldsSegment(value) {
  return encodeURIComponent(String(value).replace(/-/g, '--').replace(/_/g, '__'));
}

function buildReadmeMarkdown({
  productName,
  author,
  description,
  version,
  tag,
  releaseType,
  releaseDate,
  repo,
  releaseNotesFilename,
  downloadEntries,
  historyFiles,
}) {
  const hasRealSizes = downloadEntries.some((e) => Boolean(e.sizeLabel));
  const encodedTag = encodeURIComponent(tag);

  const lines = [];
  lines.push(`# ${productName}`);
  lines.push('');
  lines.push(
    `[![Latest Release](https://img.shields.io/badge/release-${encodeShieldsSegment(tag)}-0ea5e9?style=for-the-badge)](https://github.com/${repo}/releases/tag/${encodedTag}) ` +
      `[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-1e293b?style=for-the-badge)](https://github.com/${repo}/releases/latest) ` +
      `[![Release Type](https://img.shields.io/badge/type-${encodeShieldsSegment(releaseType)}-10b981?style=for-the-badge)](./${releaseNotesFilename})`
  );
  lines.push('');
  lines.push(`**${description}** — built by **${author}** for churches, broadcast studios, live conferences, sports venues, and stage production teams.`);
  lines.push('');
  lines.push(`> **Latest Release:** [\`${tag}\`](https://github.com/${repo}/releases/tag/${encodedTag}) (${releaseDate}) — [Read the ${tag} Release Notes](./${releaseNotesFilename}) · [Browse All Releases](https://github.com/${repo}/releases)`);
  lines.push('');

  lines.push('## Key Features');
  lines.push('');
  lines.push('- **Multi-Timer Cue Lists & Templates**: Manage multiple independent timer lists with right-click tab editing, renaming, deletion, and one-click presets (Sunday Service, Sports, Conference, or your own saved templates).');
  lines.push('- **Broadcast NDI® Output per List Tab**: Stream each timer list independently over NDI® to OBS, vMix, TriCaster, ProPresenter, and live switchers with per-tab stream configuration.');
  lines.push('- **Multi-Screen Stage & Presenter Displays**: Launch dedicated fullscreen Output, Presenter, and Preview displays across external monitors with customizable typography, themes, progress bars, and live stage messaging.');
  lines.push('- **Global Keyboard Shortcuts Manager**: Control Start/Pause, Reset, timer navigation, and list tab switching directly from the keyboard.');
  lines.push('- **LAN & QR Code Remote Control**: Share a local network link or QR code so stage managers and speakers can view or control timers from phones, tablets, or secondary computers.');
  lines.push('- **Built-in GitHub Auto-Updates**: Check for updates in-app and install new releases seamlessly across Windows, macOS (Apple Silicon & Intel), and Linux.');
  lines.push('');

  lines.push(`## Download ${productName} ${tag}`);
  lines.push('');
  lines.push(buildDownloadsTable(downloadEntries, hasRealSizes));
  lines.push('');
  lines.push(`For checksums, upgrade steps, and the full change summary, see **[${releaseNotesFilename}](./${releaseNotesFilename})**.`);
  lines.push('');

  lines.push('## Installation & Updating');
  lines.push('');
  lines.push('1. **Windows**: Download `Setup.exe` for full installation with automatic updates, or `Portable.exe` to run without installing.');
  lines.push('2. **macOS**: Download the `arm64` build for Apple Silicon (M1–M4) or `x64` for Intel Macs, open the `.dmg`, and drag **ProTimer** to **Applications**.');
  lines.push('3. **Linux**: Make the `.AppImage` executable (`chmod +x ProTimer-*.AppImage`) and run it, or install the Debian/Ubuntu `.deb` package (`sudo apt install ./ProTimer-*.deb`).');
  lines.push('4. **Staying Up to Date**: Inside ProTimer, open **Help → Check for Updates** or **Settings → Updates** to detect and download the latest GitHub release.');
  lines.push('');

  lines.push('## Release History');
  lines.push('');
  lines.push('| Version | Release Notes | GitHub Release |');
  lines.push('| :--- | :--- | :--- |');
  for (const item of historyFiles) {
    const label = item.tag === tag ? `**${item.tag}** (Latest)` : item.tag;
    lines.push(
      `| ${label} | [${item.filename}](./${item.filename}) | [View Release](https://github.com/${repo}/releases/tag/${encodeURIComponent(item.tag)}) |`
    );
  }
  lines.push('');

  lines.push('## Development & Building from Source');
  lines.push('');
  lines.push('Requires **Node.js 20+** and **npm**.');
  lines.push('');
  lines.push('```bash');
  lines.push('# Install dependencies');
  lines.push('npm install --legacy-peer-deps');
  lines.push('');
  lines.push('# Run web development server (port 3000)');
  lines.push('npm run dev');
  lines.push('');
  lines.push('# Launch Electron desktop app in development');
  lines.push('npm run electron:dev');
  lines.push('');
  lines.push('# Build platform installers');
  lines.push('npm run dist:win     # Windows x64 (Setup + Portable)');
  lines.push('npm run dist:mac     # macOS Apple Silicon (arm64) + Intel (x64)');
  lines.push('npm run dist:linux   # Linux x64 (AppImage + .deb)');
  lines.push('');
  lines.push('# Regenerate RELEASE_NOTES_<TAG>.md and README.md locally');
  lines.push('npm run docs:release');
  lines.push('```');
  lines.push('');
  lines.push('See [BUILD-INSTRUCTIONS.md](./BUILD-INSTRUCTIONS.md) for detailed packaging and signing notes.');
  lines.push('');

  lines.push('## Automated GitHub Releases');
  lines.push('');
  lines.push('Whenever a new GitHub Release is published or a version tag (`v*`, e.g. `v3.0.2`) is pushed, the GitHub Actions workflow in `.github/workflows/build.yml` automatically:');
  lines.push('');
  lines.push('1. Stamps the release version into all Windows, macOS (`arm64` & `x64`), and Linux binaries plus `latest*.yml` auto-updater manifests.');
  lines.push('2. Generates `RELEASE_NOTES_<TAG>.md` (with commit changelog, direct download links, and SHA-256 checksums) and updates `README.md`.');
  lines.push('3. Publishes all installers and release notes to GitHub Releases and commits the updated documentation back to the repository.');
  lines.push('');
  lines.push('---');
  lines.push(`© ${new Date().getUTCFullYear()} ${author}. All rights reserved.`);
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pkg = readPackageJson();

  const { version, tag } = normalizeVersion(
    args.version || process.env.RELEASE_VERSION || pkg.version,
    args.tag || process.env.RELEASE_TAG || ''
  );

  if (!version || !tag) {
    throw new Error('Could not resolve release version or tag.');
  }

  const repo = (args.repo || parseRepoSlug(pkg)).trim();
  const outDir = path.resolve(ROOT_DIR, args['out-dir'] || '.');
  const releaseDate = (args.date || new Date().toISOString().slice(0, 10)).trim();
  const previousTag = (args['previous-tag'] || findPreviousTag(tag)).trim();
  const targetRef = (args['target-ref'] || 'HEAD').trim();
  const releaseType = detectReleaseType(version, previousTag);

  const safeTag = sanitizeTagForFilename(tag);
  const releaseNotesFilename = `RELEASE_NOTES_${safeTag}.md`;

  const scannedAssets = scanAssetsDirectory(args['assets-dir']);
  const downloadEntries = resolveDownloadEntries(version, tag, repo, scannedAssets);
  const commits = collectGitCommits(previousTag, targetRef);

  const releaseNotesContent = buildReleaseNotesMarkdown({
    productName: pkg.productName || 'ProTimer',
    author: pkg.author || 'Bigjoe Technology',
    version,
    tag,
    releaseType,
    releaseDate,
    repo,
    previousTag,
    commits,
    downloadEntries,
    scannedAssets,
  });

  const releaseNotesPath = path.join(outDir, releaseNotesFilename);
  fs.writeFileSync(releaseNotesPath, releaseNotesContent, 'utf8');

  const historyFiles = collectReleaseHistoryFiles(outDir, releaseNotesFilename, tag);
  const readmeContent = buildReadmeMarkdown({
    productName: pkg.productName || 'ProTimer',
    author: pkg.author || 'Bigjoe Technology',
    description: pkg.description || 'ProTimer - Professional Multi-Timer & Stage Production Management',
    version,
    tag,
    releaseType,
    releaseDate,
    repo,
    releaseNotesFilename,
    downloadEntries,
    historyFiles,
  });

  const readmePath = path.join(outDir, 'README.md');
  fs.writeFileSync(readmePath, readmeContent, 'utf8');

  console.log(`[generate-release-docs] Generated ${releaseNotesFilename} (${releaseType}) and README.md for ${tag} (${repo})`);
}

main();
