import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { optionalString, parseJsonBody, requireNetwork } from '../_shared/validation.ts';
import { recordAuditLog } from '../_shared/logger.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'profile', 60, 60);

    if (req.method === 'GET') {
      const { data: profile, error } = await userClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        throw new AppError(500, 'PROFILE_FETCH_FAILED', error.message);
      }

      if (!profile) {
        const displayName =
          (user.user_metadata?.display_name as string | undefined)?.trim() ||
          user.email?.split('@')[0] ||
          'Word User';

        const { data: created, error: createErr } = await adminClient
          .from('profiles')
          .insert({
            id: user.id,
            display_name: displayName.slice(0, 120),
            email: user.email ?? null,
          })
          .select('*')
          .single();

        if (createErr) {
          throw new AppError(500, 'PROFILE_CREATE_FAILED', createErr.message);
        }
        return jsonResponse({ profile: created });
      }

      return jsonResponse({ profile });
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const updates: Record<string, unknown> = {};

      const displayName = optionalString(body.displayName, 'displayName', 120);
      if (displayName !== null) updates.display_name = displayName;

      if (body.defaultNetwork !== undefined) {
        updates.default_network = requireNetwork(body.defaultNetwork);
      }

      if (typeof body.onboardingCompleted === 'boolean') {
        updates.onboarding_completed = body.onboardingCompleted;
      }

      if (body.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences)) {
        updates.preferences = body.preferences;
      }

      if (Object.keys(updates).length === 0) {
        throw new AppError(400, 'NO_UPDATES', 'No valid profile fields provided.');
      }

      const { data: updated, error } = await userClient
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('*')
        .single();

      if (error) {
        throw new AppError(400, 'PROFILE_UPDATE_FAILED', error.message);
      }

      await recordAuditLog(adminClient, {
        actorUserId: user.id,
        action: 'profile.updated',
        resourceType: 'profiles',
        resourceId: user.id,
        metadata: { fields: Object.keys(updates) },
      });

      return jsonResponse({ profile: updated });
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err);
  }
});

