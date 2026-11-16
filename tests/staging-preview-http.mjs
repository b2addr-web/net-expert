const previewPattern = /^https:\/\/net-expert-[a-z0-9]+-b2addr-9372s-projects\.vercel\.app$/;

export async function requestPreview(fetchImpl, preview, bypass, path, { token, body, post = false } = {}) {
  if (!previewPattern.test(preview ?? '')) throw new Error('Set the exact NetExpert Preview URL');
  if (!/^\/(?:api|sign)\/[A-Za-z0-9_/-]+$/.test(path)) throw new Error('Invalid Preview route');
  if (!bypass || !/^[\x21-\x7e]+$/.test(bypass)) {
    throw new Error('Set VERCEL_AUTOMATION_BYPASS_SECRET to the existing project bypass');
  }

  const headers = { 'x-vercel-protection-bypass': bypass };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  let raw;
  try {
    response = await fetchImpl(preview + path, {
      method: post ? 'POST' : 'GET', headers, redirect: 'manual',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    raw = await response.text();
  } catch {
    throw new Error('Preview request failed before returning a response');
  }

  let json;
  try { json = JSON.parse(raw); } catch { /* Signing page returns HTML. */ }
  const status = response.status;
  if ((status >= 300 && status < 400) || (!json && (status === 401 || status === 403 || /Login [–-] Vercel/i.test(raw)))) {
    throw new Error('Vercel Deployment Protection rejected the existing bypass');
  }
  return { status, json, page: raw.includes('__NEXT_DATA__') };
}
