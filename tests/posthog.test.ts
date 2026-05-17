/**
 * Tests for the distinct_id derivation contract.
 *
 * The MCP server runs on user machines (Claude Desktop, Cursor, VS Code).
 * We want per-user analytics ("how many tool calls does this user make?")
 * but must never send the raw API key. The contract:
 *
 *   1. Same key → same distinct_id, forever (deterministic)
 *   2. Different keys → different distinct_ids
 *   3. Format is `mcp_<16 hex chars>` — compact + provably non-key
 *
 * @module tests/posthog
 */

import { _deriveDistinctId } from '../src/posthog';

describe('_deriveDistinctId', () => {
  it('is deterministic — same key produces same id every call', () => {
    const key = 'pt_live_abcdef0123456789';
    const a = _deriveDistinctId(key);
    const b = _deriveDistinctId(key);
    const c = _deriveDistinctId(key);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('returns the `mcp_` prefix followed by 16 hex chars', () => {
    const id = _deriveDistinctId('pt_live_test_key_12345');
    expect(id).toMatch(/^mcp_[0-9a-f]{16}$/);
  });

  it('produces different ids for different keys', () => {
    const a = _deriveDistinctId('pt_live_aaaaaaaaaaaaaa');
    const b = _deriveDistinctId('pt_live_bbbbbbbbbbbbbb');
    const c = _deriveDistinctId('pt_test_cccccccccccccc');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });

  it('does not include any substring of the raw key in the output', () => {
    // PII guarantee: even if someone has the distinct_id, they can't
    // recover the original key from it (SHA-256 is one-way).
    const key = 'pt_live_my_super_secret_token_value_xyz789';
    const id = _deriveDistinctId(key);
    expect(id).not.toContain('my_super_secret');
    expect(id).not.toContain('token_value');
    expect(id).not.toContain('xyz789');
    expect(id).not.toContain('pt_live');
  });
});
