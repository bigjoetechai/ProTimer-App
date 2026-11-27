/**
 * Shared GitHub Releases Update Checker & Semver Helper.
 * Used by both Electron main process (as automatic fallback / Portable / unsigned macOS / dev check)
 * and the Express/LAN HTTP server (`/api/lan/updates/check`).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_GITHUB_OWNER = 'bigjoetechai';
const DEFAULT_GITHUB_REPO = 'ProTimer-App';

function normalizeVersion(raw) {
  if (!raw || typeof raw !== 'string') return '0.0.0';
  return raw.trim().replace(/^v/i, '');
}

function parseSemverParts(raw) {
  const clean = normalizeVersion(raw);
  const [corePart, prePart = ''] = clean.split('-', 2);
  const nums = corePart.split('.').map((n) => {
    const parsed = parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return {
    major: nums[0] || 0,
    minor: nums[1] || 0,
    patch: nums[2] || 0,
    prerelease: prePart.trim(),
  };
}

/**
 * Returns > 0 if version A is newer than version B, < 0 if older, 0 if equal.
 */
function compareSemver(versionA, versionB) {
  const a = parseSemverParts(versionA);
  const b = parseSemverParts(versionB);
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  // Release version is newer than a prerelease of the same core version
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease !== b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
  }
  return 0;
}

function parseGitHubRepoFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const match = rawUrl.match(/github\.com[:/]([^/\s]+)\/([^/\s#.]+?)(?:\.git)?(?:[/?#]|$)/i);
  if (match && match[1] && match[2]) {
    return { owner: match[1].trim(), repo: match[2].trim() };
  }
  const shortMatch = rawUrl.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  return null;
}

function resolveGitHubRepo(rootDir) {
  if (process.env.PROTIMER_GITHUB_REPO) {
    const fromEnv = parseGitHubRepoFromUrl(process.env.PROTIMER_GITHUB_REPO);
    if (fromEnv) return fromEnv;
  }

  // 1. Check packaged Electron resources/app-update.yml (written by electron-builder from CI)
  const appUpdateCandidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app-update.yml') : null,
    rootDir ? path.join(rootDir, 'resources', 'app-update.yml') : null,
  ].filter(Boolean);

  for (const ymlPath of appUpdateCandidates) {
    try {
      if (fs.existsSync(ymlPath)) {
        const yml = fs.readFileSync(ymlPath, 'utf8');
        const ownerMatch = yml.match(/^\s*owner:\s*['"]?([^\s'"]+)['"]?\s*$/m);
        const repoMatch = yml.match(/^\s*repo:\s*['"]?([^\s'"]+)['"]?\s*$/m);
        if (ownerMatch && repoMatch) {
          return { owner: ownerMatch[1].trim(), repo: repoMatch[1].trim() };
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // 2. Check package.json repository field
  const pkgCandidates = [
    rootDir ? path.join(rootDir, 'package.json') : null,
    path.resolve(__dirname, '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ].filter(Boolean);

  for (const pkgPath of pkgCandidates) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const repoField =
          typeof pkg.repository === 'string'
            ? pkg.repository
            : pkg.repository && typeof pkg.repository.url === 'string'
            ? pkg.repository.url
            : '';
        const parsed = parseGitHubRepoFromUrl(repoField);
        if (parsed) return parsed;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return { owner: DEFAULT_GITHUB_OWNER, repo: DEFAULT_GITHUB_REPO };
}

function resolvePackageVersion(rootDir) {
  const candidates = [
    rootDir ? path.join(rootDir, 'package.json') : null,
    path.resolve(__dirname, '..', 'package.json'),
    path.join(process.cwd(), 'package.json'),
  ].filter(Boolean);

  for (const pkgPath of candidates) {
    try {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
          return normalizeVersion(pkg.version);
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  return '3.0.2';
}

function fetchJsonHttps(url, userAgent, timeoutMs = 12000, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': userAgent || 'ProTimer-Updater/3.0.2',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          return resolve(fetchJsonHttps(res.headers.location, userAgent, timeoutMs, redirectsLeft - 1));
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = rawBody ? JSON.parse(rawBody) : null;
          } catch {
            json = null;
          }
          resolve({
            statusCode: res.statusCode || 0,
            json,
            rawBody,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('GitHub Releases request timed out'));
    });
    req.on('error', reject);
  });
}

function pickAssetDownloadUrl(assets, platform, arch, isPortable) {
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const usable = assets.filter(
    (a) =>
      a &&
      typeof a.name === 'string' &&
      typeof a.browser_download_url === 'string' &&
      !a.name.endsWith('.yml') &&
      !a.name.endsWith('.blockmap')
  );

  const findBy = (pred) => {
    const found = usable.find((a) => pred(a.name.toLowerCase()));
    return found ? found.browser_download_url : null;
  };

  if (platform === 'win32') {
    if (isPortable) {
      return (
        findBy((n) => n.includes('portable') && n.endsWith('.exe')) ||
        findBy((n) => n.includes('setup') && n.endsWith('.exe')) ||
        findBy((n) => n.endsWith('.exe'))
      );
    }
    return (
      findBy((n) => n.includes('setup') && n.endsWith('.exe')) ||
      findBy((n) => n.endsWith('.exe') && !n.includes('portable')) ||
      findBy((n) => n.endsWith('.exe'))
    );
  }

  if (platform === 'darwin') {
    const archHint = arch === 'arm64' ? 'arm64' : 'x64';
    return (
      findBy((n) => n.includes(archHint) && n.endsWith('.dmg')) ||
      findBy((n) => n.includes(archHint) && n.endsWith('.zip')) ||
      findBy((n) => n.endsWith('.dmg')) ||
      findBy((n) => n.endsWith('.zip'))
    );
  }

  if (platform === 'linux') {
    return (
      findBy((n) => n.endsWith('.appimage')) ||
      findBy((n) => n.endsWith('.deb'))
    );
  }

  return (
    findBy((n) => n.includes('setup') && n.endsWith('.exe')) ||
    findBy((n) => n.endsWith('.dmg')) ||
    findBy((n) => n.endsWith('.appimage')) ||
    (usable[0] ? usable[0].browser_download_url : null)
  );
}

function trimReleaseNotes(body) {
  if (!body || typeof body !== 'string') return null;
  const cleaned = body.trim();
  if (!cleaned) return null;
  return cleaned.length > 1500 ? `${cleaned.slice(0, 1500)}...` : cleaned;
}

async function fetchLatestGitHubRelease({
  owner,
  repo,
  currentVersion,
  platform = process.platform,
  arch = process.arch,
  isPortable = false,
  timeoutMs = 12000,
}) {
  const cleanCurrent = normalizeVersion(currentVersion);
  const userAgent = `ProTimer/${cleanCurrent} (${platform}; ${arch})`;
  const latestUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`;
  const releasesListUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=10`;
  const fallbackReleasesPage = `https://github.com/${owner}/${repo}/releases`;

  let release = null;
  const latestRes = await fetchJsonHttps(latestUrl, userAgent, timeoutMs);

  if (latestRes.statusCode === 200 && latestRes.json && latestRes.json.tag_name) {
    release = latestRes.json;
  } else if (latestRes.statusCode === 404) {
    // Fallback to listing releases in case none was flagged as 'latest' yet
    const listRes = await fetchJsonHttps(releasesListUrl, userAgent, timeoutMs);
    if (listRes.statusCode === 200 && Array.isArray(listRes.json)) {
      const published = listRes.json.filter((r) => r && !r.draft && !r.prerelease && r.tag_name);
      published.sort((a, b) => compareSemver(b.tag_name, a.tag_name));
      release = published[0] || null;
    } else if (listRes.statusCode === 404) {
      return {
        ok: true,
        noReleasesYet: true,
        currentVersion: cleanCurrent,
        availableVersion: cleanCurrent,
        isUpdateAvailable: false,
        releaseUrl: fallbackReleasesPage,
        downloadUrl: null,
        releaseNotes: null,
        publishedAt: null,
      };
    } else {
      throw new Error(
        (listRes.json && listRes.json.message) || `GitHub API returned HTTP ${listRes.statusCode}`
      );
    }
  } else {
    throw new Error(
      (latestRes.json && latestRes.json.message) || `GitHub API returned HTTP ${latestRes.statusCode}`
    );
  }

  if (!release) {
    return {
      ok: true,
      noReleasesYet: true,
      currentVersion: cleanCurrent,
      availableVersion: cleanCurrent,
      isUpdateAvailable: false,
      releaseUrl: fallbackReleasesPage,
      downloadUrl: null,
      releaseNotes: null,
      publishedAt: null,
    };
  }

  const remoteVersion = normalizeVersion(release.tag_name || release.name || '');
  const isUpdateAvailable = Boolean(remoteVersion && compareSemver(remoteVersion, cleanCurrent) > 0);
  const downloadUrl =
    pickAssetDownloadUrl(release.assets, platform, arch, isPortable) ||
    release.html_url ||
    fallbackReleasesPage;

  return {
    ok: true,
    noReleasesYet: false,
    currentVersion: cleanCurrent,
    availableVersion: remoteVersion || cleanCurrent,
    isUpdateAvailable,
    releaseUrl: release.html_url || fallbackReleasesPage,
    downloadUrl,
    releaseNotes: trimReleaseNotes(release.body),
    publishedAt: release.published_at || null,
  };
}

module.exports = {
  DEFAULT_GITHUB_OWNER,
  DEFAULT_GITHUB_REPO,
  normalizeVersion,
  compareSemver,
  resolveGitHubRepo,
  resolvePackageVersion,
  pickAssetDownloadUrl,
  fetchLatestGitHubRelease,
};
