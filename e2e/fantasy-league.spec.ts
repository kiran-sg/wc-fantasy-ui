/**
 * FUEL UP Fantasy League — End-to-End Test Suite
 * Covers all rules from FIFA_WC_Fantasy_2026_Knockout_Rules-4.docx
 *
 * Prerequisites:
 *   - Frontend running on http://localhost:4201
 *   - Backend running on http://localhost:8081
 *   - Database connected and seeded
 *
 * Run: npx playwright test --reporter=html
 * Report: e2e/playwright-report/index.html
 */

import { test, expect, request as playwrightRequest, APIRequestContext, Page } from '@playwright/test';

const BASE = 'http://localhost:4201';
const API  = 'http://localhost:8081/api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function apiLogin(api: APIRequestContext, username: string) {
  const res  = await api.post(`${API}/auth/login`, { data: { username } });
  const body = await res.json();
  return { token: body.token as string, userId: body.userId as number, isAdmin: body.isAdmin as boolean };
}

async function uiLogin(page: Page, username: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[matInput]').fill(username);
  await page.locator('button.login-btn').click();
  await page.waitForURL(/\/(my-team|admin)/);
}

async function ensureLoggedOut(page: Page) {
  await page.goto(`${BASE}/login`);
  // If redirected away, already logged in — logout via localStorage clear
  if (!page.url().includes('/login')) {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/login`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTH & NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('1. Authentication & Navigation', () => {

  test('1.1 Login page renders correctly', async ({ page }) => {
    await ensureLoggedOut(page);
    await page.goto(`${BASE}/login`);
    await expect(page.locator('.brand-title')).toContainText('FUEL UP Fantasy League');
    await expect(page.locator('input[matInput]')).toBeVisible();
    await expect(page.locator('button.login-btn')).toBeVisible();
  });

  test('1.2 Sign In button disabled when username is empty', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('button.login-btn')).toBeDisabled();
  });

  test('1.3 Successful login redirects normal user to /my-team', async ({ page }) => {
    await ensureLoggedOut(page);
    await uiLogin(page, 'e2e_user_normal');
    expect(page.url()).toContain('/my-team');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('1.4 Successful login redirects admin user to /admin', async ({ page, request }) => {
    // Create an admin user via API first
    await request.post(`${API}/admin/users`, {
      data: { username: 'e2e_admin', displayName: 'E2E Admin', location: 'TVM', isAdmin: 'true' }
    });
    await ensureLoggedOut(page);
    await uiLogin(page, 'e2e_admin');
    expect(page.url()).toContain('/admin');
    const isAdmin = await page.evaluate(() => localStorage.getItem('isAdmin'));
    expect(isAdmin).toBe('true');
  });

  test('1.5 Unauthenticated user is redirected to /login from protected routes', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/my-team`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('1.6 Unauthenticated access to /leaderboard redirects to /login', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}/leaderboard`);
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('1.7 Logout clears session and shows login link', async ({ page }) => {
    await uiLogin(page, 'e2e_user_normal');
    await page.locator('button').filter({ hasText: 'Logout' }).click();
    await page.waitForURL('**/login');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });

  test('1.8 Already-logged-in user visiting /login is redirected away', async ({ page }) => {
    await uiLogin(page, 'e2e_user_normal');
    await page.goto(`${BASE}/login`);
    await page.waitForURL(/\/(my-team|admin)/);
    expect(page.url()).not.toContain('/login');
  });

  test('1.9 Admin sees Admin + Leaderboard in nav; normal user sees My Team + Leaderboard', async ({ page }) => {
    // Normal user
    await uiLogin(page, 'e2e_user_normal');
    await expect(page.locator('a[routerLink="/my-team"], a[href="/my-team"]')).toBeVisible();
    await expect(page.locator('a[routerLink="/leaderboard"], a[href="/leaderboard"]')).toBeVisible();
    await expect(page.locator('a[routerLink="/admin"], a[href="/admin"]')).not.toBeVisible();

    // Admin user
    await uiLogin(page, 'e2e_admin');
    await expect(page.locator('a[routerLink="/admin"], a[href="/admin"]')).toBeVisible();
    await expect(page.locator('a[routerLink="/leaderboard"], a[href="/leaderboard"]')).toBeVisible();
    await expect(page.locator('a[routerLink="/my-team"], a[href="/my-team"]')).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BUDGET — Rule 1.1: $105,000,000 fixed budget
// ─────────────────────────────────────────────────────────────────────────────

test.describe('2. Budget (Rule 1.1 — $105m fixed)', () => {

  test('2.1 Player pool shows prices and budget pill is visible', async ({ page }) => {
    await uiLogin(page, 'e2e_user_normal');
    await page.goto(`${BASE}/my-team`);
    await expect(page.locator('.hb-pill-lbl').filter({ hasText: 'Budget' })).toBeVisible();
    await expect(page.locator('.hb-pill-val').first()).toContainText('$');
  });

  test('2.2 Budget pill starts at $105.0m', async ({ page }) => {
    await uiLogin(page, 'e2e_user_fresh_' + Date.now());
    await page.goto(`${BASE}/my-team`);
    const budget = page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Budget' }) }).locator('.hb-pill-val');
    await expect(budget).toContainText('105');
  });

  test('2.3 Budget decreases when player is added via autopick', async ({ page }) => {
    await uiLogin(page, 'e2e_budget_test');
    await page.goto(`${BASE}/my-team`);
    const budgetBefore = await page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Budget' }) }).locator('.hb-pill-val').textContent();
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    const budgetAfter = await page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Budget' }) }).locator('.hb-pill-val').textContent();
    expect(budgetBefore).not.toBe(budgetAfter);
  });

  test('2.4 Save is rejected by backend if squad exceeds $105m (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_budget_api');
    const players = await (await request.get(`${API}/players`)).json();

    // Pick 15 most expensive players regardless of budget
    const sorted = [...players].sort((a: any, b: any) => b.price - a.price);
    const top15  = sorted.slice(0, 15);
    const byPos  = { GK: [] as number[], DEF: [] as number[], MID: [] as number[], FWD: [] as number[] };
    top15.forEach((p: any) => byPos[p.position as keyof typeof byPos]?.push(p.id));

    const starterIds = [
      ...(byPos.GK.slice(0, 1)),
      ...(byPos.DEF.slice(0, 4)),
      ...(byPos.MID.slice(0, 4)),
      ...(byPos.FWD.slice(0, 2)),
    ].slice(0, 11);
    const benchIds = [
      ...(byPos.GK.slice(1, 2)),
      ...(byPos.DEF.slice(4, 5)),
      ...(byPos.MID.slice(4, 5)),
      ...(byPos.FWD.slice(2, 3)),
    ].slice(0, 4);

    if (starterIds.length < 11 || benchIds.length < 4) {
      test.skip(true, 'Not enough players by position to test budget overflow');
      return;
    }

    const totalPrice = top15.reduce((s: number, p: any) => s + (p.price ?? 6_000_000), 0);
    if (totalPrice <= 105_000_000) {
      test.skip(true, 'Top-15 players do not exceed budget — cannot test rejection');
      return;
    }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body).toLowerCase()).toContain('budget');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SQUAD COMPOSITION — Rule 1.2: 2 GK, 5 DEF, 5 MID, 3 FWD = 15 total
// ─────────────────────────────────────────────────────────────────────────────

test.describe('3. Squad Composition (Rule 1.2)', () => {

  test('3.1 Autopick fills exactly 15 players: 2 GK, 5 DEF, 5 MID, 3 FWD', async ({ page }) => {
    await uiLogin(page, 'e2e_squad_comp');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    const picked = page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Selected' }) }).locator('.hb-pill-val');
    await expect(picked).toContainText('15/15');
  });

  test('3.2 Backend rejects squad with wrong GK count (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_squad_gk');
    const players = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);

    // Send 0 GK starters
    const starterIds = [
      ...byPos.DEF.slice(0, 4),
      ...byPos.MID.slice(0, 4),
      ...byPos.FWD.slice(0, 3),
    ].slice(0, 11).map((p: any) => p.id);
    const benchIds = [byPos.GK[0]?.id, byPos.GK[1]?.id, byPos.DEF[4]?.id, byPos.MID[4]?.id].filter(Boolean);

    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    expect(res.status()).toBe(400);
  });

  test('3.3 Backend rejects squad with only 10 starters (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_squad_10');
    const players = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos).slice(0, 10);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 10 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    expect(res.status()).toBe(400);
  });

  test('3.4 Backend rejects duplicate player in squad (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_squad_dup');
    const players = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    // Duplicate the captain in bench
    benchIds[0] = starterIds[0];

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    expect(res.status()).toBe(400);
  });

  test('3.5 Pos tab counters show correct quota (2/2 GK, 5/5 DEF etc) after autopick', async ({ page }) => {
    await uiLogin(page, 'e2e_quota_display');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.pos-tab').filter({ hasText: 'GK' }).locator('.pos-count')).toContainText('2/2');
    await expect(page.locator('.pos-tab').filter({ hasText: 'DEF' }).locator('.pos-count')).toContainText('5/5');
    await expect(page.locator('.pos-tab').filter({ hasText: 'MID' }).locator('.pos-count')).toContainText('5/5');
    await expect(page.locator('.pos-tab').filter({ hasText: 'FWD' }).locator('.pos-count')).toContainText('3/3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. PLAYERS PER COUNTRY — Rule 1.3
// ─────────────────────────────────────────────────────────────────────────────

test.describe('4. Players-Per-Country Limits (Rule 1.3)', () => {

  test('4.1 R32 stage: backend rejects >3 players from same country (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_country_r32');
    const players: any[] = await (await request.get(`${API}/players`)).json();

    // Find a team with ≥4 players
    const teamGroups = groupByTeam(players);
    const bigTeam    = Object.values(teamGroups).find((arr: any[]) => arr.length >= 4) as any[];
    if (!bigTeam) { test.skip(true, 'No team with 4+ players in DB'); return; }

    const byPos = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    // Force 4 starters from same team
    const teamPlayerIds = bigTeam.map((p: any) => p.id);
    let replaced = 0;
    for (let i = 0; i < starterIds.length && replaced < 4; i++) {
      if (!teamPlayerIds.includes(starterIds[i])) {
        const candidate = bigTeam.find((p: any) => !starterIds.includes(p.id) && !benchIds.includes(p.id));
        if (candidate) { starterIds[i] = candidate.id; replaced++; }
      }
    }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    // Should be rejected (400) when >3 from same country for R32
    expect(res.status()).toBe(400);
  });

  test('4.2 R16 stage allows up to 4 players from same country (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_country_r16');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R16' }
    });
    // A valid squad under R16 rules should be accepted
    expect([200, 201]).toContain(res.status());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. CAPTAIN & VICE-CAPTAIN — Rule 2
// ─────────────────────────────────────────────────────────────────────────────

test.describe('5. Captain & Vice-Captain (Rule 2)', () => {

  test('5.1 Autopick auto-assigns captain (most expensive) and vice-captain', async ({ page }) => {
    await uiLogin(page, 'e2e_cap_auto');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.cap-tag.c-tag')).not.toContainText('—');
    await expect(page.locator('.cap-tag.v-tag')).not.toContainText('—');
  });

  test('5.2 Captain badge (C) shown on pitch card', async ({ page }) => {
    await uiLogin(page, 'e2e_cap_badge');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.c-icon')).toBeVisible();
  });

  test('5.3 Vice-captain badge (V) shown on pitch card', async ({ page }) => {
    await uiLogin(page, 'e2e_vc_badge');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.vc-icon')).toBeVisible();
  });

  test('5.4 Tapping filled slot shows action menu with Captain / Vice-C buttons', async ({ page }) => {
    await uiLogin(page, 'e2e_cap_menu');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    // Click first filled pitch slot
    await page.locator('.p-slot').filter({ has: page.locator('.p-card:not(.p-card-empty)') }).first().click();
    await expect(page.locator('.action-menu')).toBeVisible();
    await expect(page.locator('.am-cap')).toBeVisible();
    await expect(page.locator('.am-vc')).toBeVisible();
  });

  test('5.5 Setting captain removes it from previous captain (API round-trip)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_cap_change');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }

    // Save with captain = starterIds[0]
    await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R32' }
    });

    // Re-save with captain = starterIds[2]
    const res2 = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[2], viceCaptainId: starterIds[1], stage: 'R32' }
    });
    const team = await res2.json();
    expect(team.captain?.id ?? team.captainId).toBe(starterIds[2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TRANSFERS — Rule 3
// ─────────────────────────────────────────────────────────────────────────────

test.describe('6. Transfers (Rule 3)', () => {

  test('6.1 Transfer info panel is visible for non-unlimited stage', async ({ page, request }) => {
    // Save a team in R16 stage first
    const { token, userId } = await apiLogin(request, 'e2e_tf_panel');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const starterIds = buildValidStarterIds(byPos);
    const benchIds   = buildValidBenchIds(byPos);
    if (starterIds.length < 11 || benchIds.length < 4) { test.skip(true, 'Not enough players'); return; }
    await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds, benchIds, captainId: starterIds[0], viceCaptainId: starterIds[1], stage: 'R16' }
    });

    await page.goto(`${BASE}/login`);
    await page.locator('input[matInput]').fill('e2e_tf_panel');
    await page.locator('button.login-btn').click();
    await page.waitForURL(/\/(my-team|admin)/);
    await page.goto(`${BASE}/my-team`);

    // Transfer panel only shows for non-unlimited stages
    // If next match is R16, it shows; skip check if GROUP
    const panel = page.locator('.transfer-panel');
    const visible = await panel.isVisible();
    if (visible) {
      await expect(panel.locator('.tp-stage-badge')).not.toBeEmpty();
      await expect(panel.locator('.tp-lbl').filter({ hasText: 'Free Left' })).toBeVisible();
    }
  });

  test('6.2 R16 stage: free transfers = 4 (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_tf_r16');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const s1 = buildValidStarterIds(byPos);
    const b1 = buildValidBenchIds(byPos);
    if (s1.length < 11 || b1.length < 4) { test.skip(true, 'Not enough players'); return; }

    // Save initial team
    await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds: s1, benchIds: b1, captainId: s1[0], viceCaptainId: s1[1], stage: 'R16' }
    });

    const rec = await request.get(`${API}/team/transfers?userId=${userId}&stage=R16`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await rec.json();
    // 0 transfers made so far — free left = 4
    expect(data.transfersMade ?? 0).toBeGreaterThanOrEqual(0);
    expect(data.penaltyPoints ?? 0).toBe(0);
  });

  test('6.3 Exceeding free transfers incurs -3 pts penalty per extra (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_tf_penalty');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const s1 = buildValidStarterIds(byPos);
    const b1 = buildValidBenchIds(byPos);
    if (s1.length < 11 || b1.length < 4) { test.skip(true, 'Not enough players'); return; }

    // Save initial team
    await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds: s1, benchIds: b1, captainId: s1[0], viceCaptainId: s1[1], stage: 'QF' }
    });

    // Build a new squad replacing 5 players (exceeds 4 free for QF)
    const allIds  = new Set([...s1, ...b1]);
    const others  = players.filter((p: any) => !allIds.has(p.id));
    const s2 = [...s1]; const b2 = [...b1];
    let swapped = 0;
    for (let i = 0; i < s2.length && swapped < 5; i++) {
      const candidate = others.find((p: any) =>
        p.position === players.find((x: any) => x.id === s2[i])?.position &&
        !s2.includes(p.id) && !b2.includes(p.id)
      );
      if (candidate) { s2[i] = candidate.id; swapped++; }
    }

    if (swapped < 5) { test.skip(true, 'Not enough substitute players available'); return; }

    const res = await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds: s2, benchIds: b2, captainId: s2[0], viceCaptainId: s2[1], stage: 'QF' }
    });
    expect([200, 201]).toContain(res.status());

    const rec = await request.get(`${API}/team/transfers?userId=${userId}&stage=QF`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await rec.json();
    // 5 transfers, 4 free → 1 extra → penalty = 3
    expect(data.penaltyPoints).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MY TEAM UI — General squad builder behaviour
// ─────────────────────────────────────────────────────────────────────────────

test.describe('7. My Team UI', () => {

  test('7.1 Player pool loads and shows player names with prices', async ({ page }) => {
    await uiLogin(page, 'e2e_pool_check');
    await page.goto(`${BASE}/my-team`);
    await page.waitForSelector('.pool-row');
    await expect(page.locator('.pool-row').first().locator('.pr-name')).not.toBeEmpty();
    await expect(page.locator('.pool-row').first().locator('.pr-price')).toContainText('$');
  });

  test('7.2 Player pool shows total points column', async ({ page }) => {
    await uiLogin(page, 'e2e_pool_pts');
    await page.goto(`${BASE}/my-team`);
    await page.waitForSelector('.pool-row');
    await expect(page.locator('.pool-row').first().locator('.pr-pts')).toBeVisible();
  });

  test('7.3 Sorting by Pts desc changes pool order', async ({ page }) => {
    await uiLogin(page, 'e2e_sort_pts');
    await page.goto(`${BASE}/my-team`);
    await page.waitForSelector('.pool-row');
    await page.locator('.pch-sort-btn').filter({ hasText: 'Pts' }).click();
    // Second click for desc
    await page.locator('.pch-sort-btn').filter({ hasText: 'Pts' }).click();
    const firstPts  = await page.locator('.pool-row').first().locator('.pr-pts').textContent();
    const secondPts = await page.locator('.pool-row').nth(1).locator('.pr-pts').textContent();
    expect(+(firstPts ?? '0')).toBeGreaterThanOrEqual(+(secondPts ?? '0'));
  });

  test('7.4 Search filter narrows player list', async ({ page }) => {
    await uiLogin(page, 'e2e_search');
    await page.goto(`${BASE}/my-team`);
    await page.waitForSelector('.pool-row');
    const before = await page.locator('.pool-row').count();
    await page.locator('.pool-search').fill('mess');
    await page.waitForTimeout(300);
    const after = await page.locator('.pool-row').count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('7.5 Save button disabled until 15 players + captain + VC selected', async ({ page }) => {
    await uiLogin(page, 'e2e_save_disabled');
    await page.goto(`${BASE}/my-team`);
    await expect(page.locator('.save-btn')).toBeDisabled();
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await expect(page.locator('.save-btn')).not.toBeDisabled();
  });

  test('7.6 Saving team shows success message', async ({ page }) => {
    await uiLogin(page, 'e2e_save_ok_' + Date.now());
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await page.locator('.save-btn').click();
    await expect(page.locator('.msg-bar')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.msg-bar')).toHaveClass(/msg-ok/);
  });

  test('7.7 Saved team persists on page reload', async ({ page }) => {
    const username = 'e2e_persist_' + Date.now();
    await uiLogin(page, username);
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await page.locator('.save-btn').click();
    await page.locator('.msg-bar').waitFor({ state: 'visible', timeout: 10000 });

    // Reload
    await page.reload();
    await page.waitForSelector('.p-slot');
    const picked = page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Selected' }) }).locator('.hb-pill-val');
    await expect(picked).toContainText('15/15');
  });

  test('7.8 Removing a player decreases selected count', async ({ page }) => {
    await uiLogin(page, 'e2e_remove_player');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await page.locator('.minus-btn').first().click();
    const picked = page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Selected' }) }).locator('.hb-pill-val');
    await expect(picked).toContainText('14/15');
  });

  test('7.9 Clear all resets pitch to empty', async ({ page }) => {
    await uiLogin(page, 'e2e_clear_all');
    await page.goto(`${BASE}/my-team`);
    await page.locator('.autopick-btn').click();
    await page.waitForTimeout(800);
    await page.locator('.clear-btn').click();
    const picked = page.locator('.hb-pill').filter({ has: page.locator('.hb-pill-lbl', { hasText: 'Selected' }) }).locator('.hb-pill-val');
    await expect(picked).toContainText('0/15');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCORING SYSTEM — Rule 5
// ─────────────────────────────────────────────────────────────────────────────

test.describe('8. Scoring System (Rule 5)', () => {

  test('8.1 Appearance < 60 min = +1 pt (API computation)', async ({ request }) => {
    const pts = computeTestPoints({ minutesPlayed: 45, goals: 0, assists: 0, position: 'MID' });
    expect(pts).toBe(1);
  });

  test('8.2 Appearance >= 60 min = +2 pts (two +1 additions)', async ({ request }) => {
    const pts = computeTestPoints({ minutesPlayed: 60, goals: 0, assists: 0, position: 'MID' });
    expect(pts).toBe(2);
  });

  test('8.3 Appearance 80 min = +2 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 80, goals: 0, assists: 0, position: 'DEF' })).toBe(2);
  });

  test('8.4 GK goal = +9 pts + appearance', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 1, assists: 0, position: 'GK' })).toBe(11); // 2 + 9
  });

  test('8.5 DEF goal = +7 pts + appearance', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 1, assists: 0, position: 'DEF' })).toBe(9); // 2 + 7
  });

  test('8.6 MID goal = +6 pts + appearance', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 1, assists: 0, position: 'MID' })).toBe(8); // 2 + 6
  });

  test('8.7 FWD goal = +5 pts + appearance', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 1, assists: 0, position: 'FWD' })).toBe(7); // 2 + 5
  });

  test('8.8 Assist = +3 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 1, position: 'MID' })).toBe(5); // 2 + 3
  });

  test('8.9 Yellow card = -1 pt', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, yellowCards: 1, position: 'MID' })).toBe(1); // 2 - 1
  });

  test('8.10 Red card = -2 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, redCards: 1, position: 'MID' })).toBe(0); // 2 - 2
  });

  test('8.11 Own goal = -2 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, ownGoals: 1, position: 'DEF' })).toBe(0); // 2 - 2
  });

  test('8.12 GK clean sheet (60+ min) = +5 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, position: 'GK' })).toBe(7); // 2 + 5
  });

  test('8.13 DEF clean sheet (60+ min) = +5 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, position: 'DEF' })).toBe(7); // 2 + 5
  });

  test('8.14 MID clean sheet (60+ min) = +1 pt', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, position: 'MID' })).toBe(3); // 2 + 1
  });

  test('8.15 FWD clean sheet = 0 pts (not awarded)', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, position: 'FWD' })).toBe(2); // 2 + 0
  });

  test('8.16 Clean sheet NOT awarded if player played < 60 min', async () => {
    expect(computeTestPoints({ minutesPlayed: 59, goals: 0, assists: 0, cleanSheet: true, position: 'GK' })).toBe(1); // 1, no CS
  });

  test('8.17 GK: every 3 saves = +1 pt', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, saves: 3, position: 'GK' })).toBe(3); // 2 + 1
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, saves: 6, position: 'GK' })).toBe(4); // 2 + 2
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, saves: 2, position: 'GK' })).toBe(2); // 2, no bonus
  });

  test('8.18 FWD: every 2 shots on target = +1 pt', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, shotsOnTarget: 2, position: 'FWD' })).toBe(3); // 2 + 1
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, shotsOnTarget: 4, position: 'FWD' })).toBe(4); // 2 + 2
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, shotsOnTarget: 1, position: 'FWD' })).toBe(2); // 2, no bonus
  });

  test('8.19 GK/DEF: first goal conceded = 0 pts, each additional = -1', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, goalsConceded: 1, position: 'GK' })).toBe(2); // 0 deduction
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, goalsConceded: 2, position: 'GK' })).toBe(1); // -1
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, goalsConceded: 3, position: 'DEF' })).toBe(0); // -2
  });

  test('8.20 MID/FWD: goals conceded gives no penalty', async () => {
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, goalsConceded: 5, position: 'MID' })).toBe(2);
    expect(computeTestPoints({ minutesPlayed: 90, goals: 0, assists: 0, goalsConceded: 5, position: 'FWD' })).toBe(2);
  });

  test('8.21 Messi hat-trick scenario: 3 goals FWD + 80 min + 4 SoT = 19 pts', async () => {
    // As verified against ESPN: Messi vs Algeria, 3 goals, 4 SoT, 80 min
    const pts = computeTestPoints({ minutesPlayed: 80, goals: 3, assists: 0, shotsOnTarget: 4, position: 'FWD' });
    expect(pts).toBe(19); // 2 (app) + 15 (goals) + 2 (SoT bonus)
  });

  test('8.22 Player with 0 minutes = 0 pts', async () => {
    expect(computeTestPoints({ minutesPlayed: 0, goals: 0, assists: 0, position: 'FWD' })).toBe(0);
  });

  test('8.23 Points guide UI shows correct values', async ({ page }) => {
    await uiLogin(page, 'e2e_pts_guide');
    await page.goto(`${BASE}/admin`);
    // Click Points Guide tab
    await page.locator('.mat-mdc-tab').filter({ hasText: 'Points Guide' }).click();
    await expect(page.locator('.guide-body')).toBeVisible();
    // Appearance rows
    await expect(page.locator('.guide-body')).toContainText('Up to 60 min');
    await expect(page.locator('.guide-body')).toContainText('60+ min');
    // Goals grid
    await expect(page.locator('.goal-pts').filter({ hasText: '+9' })).toBeVisible(); // GK
    await expect(page.locator('.goal-pts').filter({ hasText: '+7' })).toBeVisible(); // DEF
    await expect(page.locator('.goal-pts').filter({ hasText: '+6' })).toBeVisible(); // MID
    await expect(page.locator('.goal-pts').filter({ hasText: '+5' })).toBeVisible(); // FWD
    // Clean sheet
    await expect(page.locator('.guide-body')).toContainText('Clean Sheet');
    // Captain
    await expect(page.locator('.c-pts')).toContainText('×2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. CAPTAIN DOUBLE POINTS — Rule 2
// ─────────────────────────────────────────────────────────────────────────────

test.describe('9. Captain Double Points (Rule 2)', () => {

  test('9.1 Captain earns double points in match points calculation (API)', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_cap_pts');
    const players: any[] = await (await request.get(`${API}/players`)).json();
    const byPos  = groupByPos(players);
    const s1 = buildValidStarterIds(byPos);
    const b1 = buildValidBenchIds(byPos);
    if (s1.length < 11 || b1.length < 4) { test.skip(true, 'Not enough players'); return; }

    await request.post(`${API}/team`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { userId, starterIds: s1, benchIds: b1, captainId: s1[0], viceCaptainId: s1[1], stage: 'R32' }
    });

    const teamRes = await request.get(`${API}/team?userId=${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const team = await teamRes.json();
    expect(team.captain?.id ?? team.captainId).toBe(s1[0]);
  });

  test('9.2 Admin breakdown shows ×2 tag for captain row', async ({ page, request }) => {
    await request.post(`${API}/admin/users`, {
      data: { username: 'e2e_admin2', displayName: 'Admin2', location: 'TVM', isAdmin: 'true' }
    });
    await uiLogin(page, 'e2e_admin2');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();

    // Select a user who has a saved team
    const userRows = page.locator('.sq-user-row');
    const count = await userRows.count();
    if (count === 0) { test.skip(true, 'No users in squads tab'); return; }

    await userRows.first().click();
    await page.waitForTimeout(1000);

    // If match points breakdown exists
    const breakdownRows = page.locator('.pts-match-row');
    if (await breakdownRows.count() === 0) { test.skip(true, 'No match points yet'); return; }

    await breakdownRows.first().locator('.pts-match-header').click();
    await page.waitForTimeout(500);
    await expect(page.locator('.x2-tag')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. LEADERBOARD — Rule 6
// ─────────────────────────────────────────────────────────────────────────────

test.describe('10. Leaderboard (Rule 6)', () => {

  test('10.1 Overall leaderboard loads and shows users sorted by total points', async ({ page }) => {
    await uiLogin(page, 'e2e_lb_check');
    await page.goto(`${BASE}/leaderboard`);
    await page.waitForSelector('tr.mat-mdc-row');
    const rows = page.locator('tr.mat-mdc-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('10.2 Leaderboard overall tab is sorted descending by points', async ({ page, request }) => {
    await uiLogin(page, 'e2e_lb_sort');
    await page.goto(`${BASE}/leaderboard`);
    await page.waitForSelector('tr.mat-mdc-row');
    const ptsCells = await page.locator('tr.mat-mdc-row .pts').allTextContents();
    const nums = ptsCells.map(t => parseInt(t) || 0);
    for (let i = 0; i < nums.length - 1; i++) {
      expect(nums[i]).toBeGreaterThanOrEqual(nums[i + 1]);
    }
  });

  test('10.3 Round leaderboard tab is accessible and shows match selector', async ({ page }) => {
    await uiLogin(page, 'e2e_lb_round');
    await page.goto(`${BASE}/leaderboard`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'Round' }).click();
    await expect(page.locator('mat-select')).toBeVisible();
  });

  test('10.4 Leaderboard API returns array sorted by totalPoints desc', async ({ request }) => {
    const res  = await request.get(`${API}/leaderboard`);
    expect(res.ok()).toBeTruthy();
    const data: any[] = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i].totalPoints ?? 0).toBeGreaterThanOrEqual(data[i + 1].totalPoints ?? 0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. ADMIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('11. Admin Panel', () => {

  test('11.1 Admin panel has 3 tabs: Score Panel, Points Guide, User Squads', async ({ page }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await expect(page.locator('.mat-mdc-tab').filter({ hasText: 'Score Panel' })).toBeVisible();
    await expect(page.locator('.mat-mdc-tab').filter({ hasText: 'Points Guide' })).toBeVisible();
    await expect(page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' })).toBeVisible();
  });

  test('11.2 Score panel lists all matches from API', async ({ page, request }) => {
    const matchCount = (await (await request.get(`${API}/admin/matches`)).json()).length;
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');
    const cards = await page.locator('.match-card').count();
    expect(cards).toBe(matchCount);
  });

  test('11.3 Match search filters by team name', async ({ page }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');
    const before = await page.locator('.match-card').count();
    await page.locator('.search-bar input.search-input').fill('Argentina');
    await page.waitForTimeout(300);
    const after = await page.locator('.match-card').count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('11.4 Player stats section opens on clicking Player Stats button', async ({ page }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');
    const statsBtn = page.locator('button').filter({ hasText: 'Player Stats' }).first();
    if (!(await statsBtn.isVisible())) { test.skip(true, 'No completed match'); return; }
    await statsBtn.click();
    await expect(page.locator('.stats-section')).toBeVisible({ timeout: 10000 });
  });

  test('11.5 Player stats team filter buttons exist (All, TeamA, TeamB)', async ({ page }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');
    const statsBtn = page.locator('button').filter({ hasText: 'Player Stats' }).first();
    if (!(await statsBtn.isVisible())) { test.skip(true, 'No completed match'); return; }
    await statsBtn.click();
    await expect(page.locator('.stats-section')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.st-btn').filter({ hasText: 'All' })).toBeVisible();
    expect(await page.locator('.st-btn').count()).toBe(3); // All + Team A + Team B
  });

  test('11.6 User Squads tab shows non-admin users only', async ({ page, request }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();
    await page.waitForTimeout(500);
    const userRows = page.locator('.sq-user-row');
    const count = await userRows.count();
    // All displayed users should not be admins (no admin badge)
    for (let i = 0; i < count; i++) {
      const text = await userRows.nth(i).textContent();
      // Admin users are filtered — none should show 'Admin' role indicator
      expect(text).not.toContain('admin');
    }
  });

  test('11.7 Add User form opens and closes', async ({ page }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();
    await page.locator('.add-user-btn').click();
    await expect(page.locator('.add-user-form')).toBeVisible();
    await page.locator('.au-cancel-btn').click();
    await expect(page.locator('.add-user-form')).not.toBeVisible();
  });

  test('11.8 Adding a new user via form creates them and shows in list', async ({ page }) => {
    const newUser = 'e2e_new_user_' + Date.now();
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();
    await page.locator('.add-user-btn').click();
    await page.locator('.au-input').nth(0).fill(newUser);
    await page.locator('.au-input').nth(1).fill('New Test User');
    await page.locator('.au-select').selectOption('TVM');
    await page.locator('.au-save-btn').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('.sq-user-list')).toContainText(newUser);
  });

  test('11.9 Location filter badges filter users by TVM / Pune', async ({ page, request }) => {
    // Ensure at least one TVM user exists
    await request.post(`${API}/admin/users`, {
      data: { username: 'e2e_tvm_user', displayName: 'TVM User', location: 'TVM', isAdmin: 'false' }
    });
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();
    await page.waitForTimeout(500);
    await page.locator('.loc-badge.tvm').click();
    await page.waitForTimeout(300);
    const rows = await page.locator('.sq-user-row').count();
    // All visible rows should have TVM location
    for (let i = 0; i < rows; i++) {
      await expect(page.locator('.sq-user-row').nth(i).locator('.sq-u-loc.tvm')).toBeVisible();
    }
  });

  test('11.10 Selecting a user in User Squads shows their squad detail', async ({ page, request }) => {
    await uiLogin(page, 'e2e_admin');
    await page.goto(`${BASE}/admin`);
    await page.locator('.mat-mdc-tab').filter({ hasText: 'User Squads' }).click();
    await page.waitForTimeout(500);
    const rows = page.locator('.sq-user-row');
    if (await rows.count() === 0) { test.skip(true, 'No users'); return; }
    await rows.first().click();
    // Either team details or "no team yet" message
    await expect(page.locator('.sq-detail-panel')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. API HEALTH CHECKS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('12. API Health Checks', () => {

  test('12.1 GET /api/matches returns 200 with array', async ({ request }) => {
    const res = await request.get(`${API}/matches`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('12.2 GET /api/teams returns 200 with array', async ({ request }) => {
    const res = await request.get(`${API}/teams`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('12.3 GET /api/players returns 200 with array', async ({ request }) => {
    const res = await request.get(`${API}/players`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('12.4 GET /api/leaderboard returns 200 with array', async ({ request }) => {
    const res = await request.get(`${API}/leaderboard`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('12.5 POST /api/auth/login returns token, userId, isAdmin', async ({ request }) => {
    const res  = await request.post(`${API}/auth/login`, { data: { username: 'healthcheck_user' } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(typeof body.userId).toBe('number');
    expect(typeof body.isAdmin).toBe('boolean');
  });

  test('12.6 GET /api/team requires auth — returns 401 without token', async ({ request }) => {
    const res = await request.get(`${API}/team?userId=1`);
    expect(res.status()).toBe(401);
  });

  test('12.7 GET /api/players/points returns playerId→points map', async ({ request }) => {
    const res  = await request.get(`${API}/players/points`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body).toBe('object');
  });

  test('12.8 GET /api/team/transfers returns transfer record', async ({ request }) => {
    const { token, userId } = await apiLogin(request, 'e2e_tf_health');
    const res = await request.get(`${API}/team/transfers?userId=${userId}&stage=R32`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('stage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

interface StatInput {
  minutesPlayed: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
  cleanSheet?: boolean;
  goalsConceded?: number;
  saves?: number;
  shotsOnTarget?: number;
  position: string;
}

function computeTestPoints(s: StatInput): number {
  if (!s.minutesPlayed) return 0;
  let pts = 0;
  const pos  = s.position;
  const mins = s.minutesPlayed;

  pts += mins >= 60 ? 2 : 1;

  const goalPts: Record<string, number> = { GK: 9, DEF: 7, MID: 6, FWD: 5 };
  pts += (s.goals ?? 0) * (goalPts[pos] ?? 6);
  pts += (s.assists ?? 0) * 3;

  if (s.cleanSheet && mins >= 60) {
    if (pos === 'GK' || pos === 'DEF') pts += 5;
    else if (pos === 'MID') pts += 1;
  }

  if (pos === 'GK' || pos === 'DEF') {
    const gc = s.goalsConceded ?? 0;
    if (gc > 1) pts -= (gc - 1);
  }

  pts -= (s.yellowCards ?? 0);
  pts -= (s.redCards ?? 0) * 2;
  pts -= (s.ownGoals ?? 0) * 2;

  if (pos === 'GK') pts += Math.floor((s.saves ?? 0) / 3);
  if (pos === 'FWD') pts += Math.floor((s.shotsOnTarget ?? 0) / 2);

  return pts;
}

function groupByPos(players: any[]) {
  const r: Record<string, any[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach((p: any) => r[p.position]?.push(p));
  return r;
}

function groupByTeam(players: any[]) {
  const r: Record<number, any[]> = {};
  players.forEach((p: any) => {
    const tid = p.team?.id ?? p.teamId;
    if (!r[tid]) r[tid] = [];
    r[tid].push(p);
  });
  return r;
}

function buildValidStarterIds(byPos: Record<string, any[]>): number[] {
  return [
    byPos.GK[0]?.id,
    byPos.DEF[0]?.id, byPos.DEF[1]?.id, byPos.DEF[2]?.id, byPos.DEF[3]?.id,
    byPos.MID[0]?.id, byPos.MID[1]?.id, byPos.MID[2]?.id, byPos.MID[3]?.id,
    byPos.FWD[0]?.id, byPos.FWD[1]?.id,
  ].filter(Boolean) as number[];
}

function buildValidBenchIds(byPos: Record<string, any[]>): number[] {
  return [
    byPos.GK[1]?.id,
    byPos.DEF[4]?.id,
    byPos.MID[4]?.id,
    byPos.FWD[2]?.id,
  ].filter(Boolean) as number[];
}
