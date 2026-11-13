import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import {
  assertNoDangerousHtml,
  assertSafeStoragePath,
  optionalString,
  parseJsonBody,
  requireString,
  requireUuid,
} from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'evidence_auth', 30, 60);

    if (req.method !== 'POST') {
      throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Use POST for evidence-auth.');
    }

    const body = await parseJsonBody<Record<string, unknown>>(req);
    const action = requireString(body.action ?? 'add_note', 'action', 3, 30);
    const disputeId = requireUuid(body.disputeId, 'disputeId');

    const { data: dispute } = await adminClient
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .maybeSingle();

    if (!dispute) throw new AppError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found.');
    if (dispute.reporter_id !== user.id && dispute.counterparty_id !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Only dispute participants can access or submit evidence.');
    }

    if (action === 'create_upload_url') {
      const fileName = requireString(body.fileName, 'fileName', 1, 120).replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${disputeId}/${crypto.randomUUID()}-${fileName}`;

      const { data: signed, error: signErr } = await adminClient.storage
        .from('dispute-evidence')
        .createSignedUploadUrl(objectPath);

      if (signErr || !signed) {
        throw new AppError(500, 'SIGNED_URL_FAILED', signErr?.message ?? 'Could not create upload URL.');
      }

      return jsonResponse({
        objectPath,
        signedUrl: signed.signedUrl,
        token: signed.token,
      });
    }

    if (action === 'create_download_url') {
      const storagePath = assertSafeStoragePath(
        requireString(body.storagePath, 'storagePath', 5, 300),
        `${disputeId}/`
      );

      const { data: signed, error: signErr } = await adminClient.storage
        .from('dispute-evidence')
        .createSignedUrl(storagePath, 300);

      if (signErr || !signed) {
        throw new AppError(500, 'SIGNED_URL_FAILED', signErr?.message ?? 'Could not create download URL.');
      }

      return jsonResponse({ signedUrl: signed.signedUrl });
    }

    if (action === 'add_note' || action === 'commit_evidence') {
      const label = assertNoDangerousHtml(requireString(body.label, 'label', 2, 160), 'label');
      const note = assertNoDangerousHtml(requireString(body.note, 'note', 2, 2000), 'note');
      const rawStoragePath = optionalString(body.storagePath, 'storagePath', 300);
      const storagePath = rawStoragePath
        ? assertSafeStoragePath(rawStoragePath, `${disputeId}/`)
        : null;
      const mimeType = optionalString(body.mimeType, 'mimeType', 100);
      const byteSize = typeof body.byteSize === 'number' && body.byteSize >= 0 ? Math.floor(body.byteSize) : null;

      const { data: item, error } = await adminClient
        .from('evidence')
        .insert({
          dispute_id: disputeId,
          submitted_by: user.id,
          label,
          note,
          storage_path: storagePath,
          mime_type: mimeType,
          byte_size: byteSize,
        })
        .select('*')
        .single();

      if (error) throw new AppError(400, 'EVIDENCE_INSERT_FAILED', error.message);

      if (dispute.status === 'open') {
        await adminClient
          .from('disputes')
          .update({ status: 'evidence_submitted' })
          .eq('id', disputeId);
      }

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'evidence.submitted',
        resourceType: 'evidence',
        resourceId: item.id,
        metadata: { disputeId, hasFile: Boolean(storagePath) },
      });

      return jsonResponse({ evidence: item }, 201);
    }

    throw new AppError(400, 'UNKNOWN_ACTION', `Unsupported action: ${action}`);
  } catch (err) {
    return errorResponse(err);
  }
});

