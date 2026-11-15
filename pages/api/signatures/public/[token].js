import {serviceSupabase,sha256Hex} from '../../../../lib/serverSupabase';
const limiter=new Map();
function limited(ip){const now=Date.now(),row=limiter.get(ip)||{at:now,count:0};if(now-row.at>60000){row.at=now;row.count=0}row.count++;limiter.set(ip,row);return row.count>30}
export default async function handler(req, res) {
  if (limited(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }
  try {
    const token = String(req.query.token || '');
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      return res.status(404).json({ error: 'SIGNING_LINK_INVALID' });
    }
    const db = serviceSupabase();
    const hash = await sha256Hex(token);
    const { data: request, error } = await db.from('signature_requests')
      .select('id,organization_id,employee_name,employee_id,status,token_expires_at,signature_templates(id,name,version,original_file_path,original_file_name,signature_page,signature_x,signature_y,signature_width,signature_height,page_width,page_height)')
      .eq('token_hash', hash).maybeSingle();
    if (error || !request) return res.status(404).json({ error: 'SIGNING_LINK_INVALID' });

    const now = new Date();
    if (new Date(request.token_expires_at) <= now) {
      return res.status(410).json({ error: 'SIGNING_LINK_EXPIRED' });
    }
    let status = request.status;
    if (['pending_send', 'sent'].includes(status)) {
      // The Worker can mark a pending request as sent between the read and this update.
      const { data: opened, error: updateError } = await db.from('signature_requests')
        .update({ status: 'awaiting_signature' }).eq('id', request.id)
        .in('status', ['pending_send', 'sent']).gt('token_expires_at', now.toISOString())
        .select('status').maybeSingle();
      if (updateError) throw updateError;
      if (opened) {
        status = opened.status;
        await db.from('signature_events').insert({
          organization_id: request.organization_id, request_id: request.id, event_type: 'opened', details: {},
        });
      } else {
        const { data: current, error: readError } = await db.from('signature_requests')
          .select('status').eq('id', request.id).maybeSingle();
        if (readError) throw readError;
        status = current?.status;
      }
    }
    if (status !== 'awaiting_signature') {
      return res.status(409).json({ error: 'SIGNING_NOT_AVAILABLE' });
    }

    const template = request.signature_templates;
    const { data: file, error: fileError } = await db.storage.from('knowledge-files')
      .createSignedUrl(template.original_file_path, 600);
    if (fileError) return res.status(503).json({ error: 'DOCUMENT_UNAVAILABLE' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      requestId: request.id, employeeName: request.employee_name, employeeId: request.employee_id,
      status, expiresAt: request.token_expires_at,
      template: {
        name: template.name, version: template.version, fileName: template.original_file_name,
        url: file.signedUrl, page: template.signature_page, x: template.signature_x, y: template.signature_y,
        width: template.signature_width, height: template.signature_height,
        pageWidth: template.page_width, pageHeight: template.page_height,
      },
    });
  } catch (error) {
    const missingConfig = error.message === 'SERVER_AUTH_NOT_CONFIGURED';
    return res.status(missingConfig ? 503 : 500).json({
      error: missingConfig ? 'SERVER_AUTH_NOT_CONFIGURED' : 'SIGNING_LINK_FAILED',
    });
  }
}
