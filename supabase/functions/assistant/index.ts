import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { AppError, errorResponse, jsonResponse } from '../_shared/errors.ts';
import { optionalString, parseJsonBody, requireString, requireUuid } from '../_shared/validation.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';

function buildAssistantReply(prompt: string, contextSummary: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('scam') || lower.includes('risk') || lower.includes('safe') || lower.includes('verify')) {
    return [
      'Here is a structured safety checklist based on your account context:',
      contextSummary,
      '1. Confirm the recipient wallet control proof (`verified_control`) before signing.',
      '2. Verify the exact token symbol, decimal amount, and network match the payment agreement.',
      '3. Never share your recovery phrase or sign blind approvals for unknown contracts.',
    ].join('\n\n');
  }

  if (lower.includes('dispute') || lower.includes('evidence') || lower.includes('agreement')) {
    return [
      'For accountability and dispute readiness:',
      contextSummary,
      'Attach your payment agreement reference, timestamped screenshots, or receipt hash in the Dispute flow so all evidence stays linked to the transaction ID.',
    ].join('\n\n');
  }

  return [
    'Word Assistant summary for your current workspace:',
    contextSummary,
    'Ask me to review a recipient address, explain a risk score, or prepare a payment summary before you approve.',
  ].join('\n\n');
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { user, userClient, adminClient } = await requireAuth(req);
    await enforceRateLimit(adminClient, user.id, 'assistant', 30, 60);

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');

      if (sessionId) {
        const validId = requireUuid(sessionId, 'sessionId');
        const { data: messages, error } = await userClient
          .from('assistant_messages')
          .select('*')
          .eq('session_id', validId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) throw new AppError(500, 'MESSAGES_FETCH_FAILED', error.message);
        return jsonResponse({ messages: messages ?? [] });
      }

      const { data: sessions, error } = await userClient
        .from('assistant_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(30);

      if (error) throw new AppError(500, 'SESSIONS_FETCH_FAILED', error.message);
      return jsonResponse({ sessions: sessions ?? [] });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req);
      const messageText = requireString(body.message, 'message', 1, 2000);
      const title = optionalString(body.title, 'title', 160) ?? messageText.slice(0, 60);
      let sessionId = body.sessionId ? requireUuid(body.sessionId, 'sessionId') : null;

      if (!sessionId) {
        const { data: newSession, error: sessErr } = await adminClient
          .from('assistant_sessions')
          .insert({
            user_id: user.id,
            title,
            context_type: 'general',
          })
          .select('*')
          .single();

        if (sessErr) throw new AppError(500, 'SESSION_CREATE_FAILED', sessErr.message);
        sessionId = newSession.id;
      }

      const { data: userMsg, error: uErr } = await adminClient
        .from('assistant_messages')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          role: 'user',
          content: messageText,
        })
        .select('*')
        .single();

      if (uErr) throw new AppError(500, 'MESSAGE_SAVE_FAILED', uErr.message);

      const [{ count: txCount }, { count: riskCount }] = await Promise.all([
        adminClient
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`),
        adminClient
          .from('risk_assessments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);

      const contextSummary = `Account snapshot: ${txCount ?? 0} recorded transactions and ${riskCount ?? 0} risk checks on file.`;
      const replyContent = buildAssistantReply(messageText, contextSummary);

      const { data: assistantMsg, error: aErr } = await adminClient
        .from('assistant_messages')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          role: 'assistant',
          content: replyContent,
          metadata: { txCount: txCount ?? 0, riskCount: riskCount ?? 0 },
        })
        .select('*')
        .single();

      if (aErr) throw new AppError(500, 'REPLY_SAVE_FAILED', aErr.message);

      await adminClient
        .from('assistant_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      return jsonResponse({ sessionId, userMessage: userMsg, assistantMessage: assistantMsg }, 201);
    }

    throw new AppError(405, 'METHOD_NOT_ALLOWED', 'Unsupported HTTP method.');
  } catch (err) {
    return errorResponse(err);
  }
});

