import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { parseJsonBody, requireUuid } from '../_shared/validation.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'notifications', 60, 60);

    if (req.method === 'GET') {
      const { data, error } = await userClient
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw new AppError(500, 'NOTIFICATIONS_FETCH_FAILED', error.message);
      return jsonResponse({ notifications: data ?? [] }, 200, req);
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const nowIso = new Date().toISOString();

      if (body.markAllRead === true) {
        const { error } = await userClient
          .from('notifications')
          .update({ is_read: true, read_at: nowIso })
          .eq('user_id', user.id)
          .eq('is_read', false);

        if (error) throw new AppError(500, 'MARK_READ_FAILED', error.message);
        return jsonResponse({ updated: true }, 200, req);
      }

      const notificationId = requireUuid(body.notificationId, 'notificationId');
      const { data, error } = await userClient
        .from('notifications')
        .update({ is_read: true, read_at: nowIso })
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) throw new AppError(400, 'MARK_READ_FAILED', error.message);
      return jsonResponse({ notification: data }, 200, req);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err, req);
  }
});

