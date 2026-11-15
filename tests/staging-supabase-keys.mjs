export const stagingRef = 'bsxhmijczvsyidbgptfz';
export const stagingUrl = `https://${stagingRef}.supabase.co`;

function usable(key, role, prefix) {
  if (typeof key !== 'string') return false;
  if (key.startsWith(prefix)) return /^[A-Za-z0-9_-]{12,}$/.test(key.slice(prefix.length));
  if (!/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return claims.ref === stagingRef && claims.role === role;
  } catch {
    return false;
  }
}

function pair(anon, service) {
  const publicKey = anon?.trim();
  const serverKey = service?.trim();
  return usable(publicKey, 'anon', 'sb_publishable_') && usable(serverKey, 'service_role', 'sb_secret_')
    ? { anon: publicKey, service: serverKey }
    : null;
}

export function parseStagingKeys(stdout) {
  let response;
  try {
    response = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  } catch {
    return null;
  }
  let rows = response;
  for (let i = 0; i < 4 && rows && !Array.isArray(rows); i++) {
    rows = rows.keys ?? rows.api_keys ?? rows.data ?? rows.result ?? rows.output;
  }
  if (!Array.isArray(rows)) return null;
  const values = rows.map(row => row?.api_key ?? row?.key ?? row?.value);
  return pair(
    values.find(key => usable(key, 'anon', 'sb_publishable_')),
    values.find(key => usable(key, 'service_role', 'sb_secret_')),
  );
}

export function loadStagingKeys(env, run) {
  const stagingPublic = env.STAGING_SUPABASE_PUBLISHABLE_KEY || env.STAGING_SUPABASE_ANON_KEY;
  const stagingService = env.STAGING_SUPABASE_SERVICE_ROLE_KEY || env.STAGING_SUPABASE_SECRET_KEY;
  if (stagingPublic || stagingService) {
    const keys = pair(stagingPublic, stagingService);
    if (!keys) throw new Error('Staging environment requires a valid public and server key pair');
    return keys;
  }
  const configuredUrls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
  if (configuredUrls.length && configuredUrls.every(url => url.replace(/\/$/, '') === stagingUrl)) {
    const keys = pair(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY,
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY);
    if (keys) return keys;
  }
  const command = `projects api-keys --project-ref ${stagingRef}`;
  let readMetadata = false;
  for (const executable of ['supabase', 'pnpm exec supabase']) {
    // Supabase CLI releases use different output flags. Try the authenticated
    // unpinned CLI first, and only request reveal when ordinary output falls short.
    for (const options of ['--output json', '--output-format json', '--reveal --output-format json']) {
      const result = run(`${executable} ${command} ${options}`);
      if (result.status !== 0) continue;
      readMetadata = true;
      const keys = parseStagingKeys(result.stdout ?? '');
      if (keys) return keys;
    }
  }
  throw new Error(readMetadata
    ? 'Supabase CLI returned no usable Staging key pair'
    : 'Supabase CLI access failed for Staging');
}
