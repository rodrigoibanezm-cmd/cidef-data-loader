import { listCustomGptActions, runCustomGptAction } from '../lib/custom-gpt-router.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST required' });
  }

  const action = req.body?.action;
  if (typeof action !== 'string' || !action) {
    return res.status(400).json({
      ok: false,
      error: 'action is required',
      allowedActions: listCustomGptActions(),
    });
  }

  try {
    const result = await runCustomGptAction(action, req.body?.input ?? {});
    return res.status(200).json({
      ok: true,
      endpoint: 'custom-gpt',
      action,
      result,
    });
  } catch (error) {
    const message = error?.message || 'Custom GPT request failed';
    const status = message === 'Unknown Custom GPT action' ? 400 : 500;
    return res.status(status).json({
      ok: false,
      endpoint: 'custom-gpt',
      action,
      error: message,
      allowedActions: listCustomGptActions(),
    });
  }
}
