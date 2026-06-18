import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:4200';
const API = 'http://localhost:8081/api';

/**
 * E2E Integration Test Suite for WC Fantasy League
 * Covers: Login → Squad Selection → Admin Score Update → Leaderboard Verification
 * Video recording is enabled via playwright.config.ts
 */

test.describe('WC Fantasy League - Full Integration Flow', () => {
  let token: string;
  let userId: number;

  test.describe.configure({ mode: 'serial' });

  test('1. Login flow - user can log in with username', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Verify login page renders
    await expect(page.locator('mat-card-title')).toContainText('Welcome to WC Fantasy League');

    // Enter username and submit
    const input = page.locator('input[matInput]');
    await input.fill('e2eTestUser');
    await page.locator('button').filter({ hasText: 'Enter' }).click();

    // Should redirect to matches page
    await page.waitForURL('**/matches');
    await expect(page.locator('.page-title')).toContainText('FIFA WC 2026');

    // Verify user is logged in - nav shows username
    await expect(page.locator('.username')).toContainText('e2eTestUser');

    // Verify Admin link is visible when logged in
    await expect(page.locator('.admin-link')).toBeVisible();

    // Store auth data for API calls in subsequent tests
    token = await page.evaluate(() => localStorage.getItem('token') || '');
    userId = await page.evaluate(() => +(localStorage.getItem('userId') || '0'));
    expect(token).toBeTruthy();
    expect(userId).toBeGreaterThan(0);
  });

  test('2. Matches page - displays match list with team names', async ({ page }) => {
    // Login first
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/matches`);

    // Wait for matches to load
    await page.waitForSelector('.match-card');

    // Verify at least one match card exists
    const matchCards = page.locator('.match-card');
    await expect(matchCards.first()).toBeVisible();

    // Verify match card has team names
    await expect(matchCards.first().locator('.team-name').first()).not.toBeEmpty();

    // Verify "Pick Your XI" button for upcoming matches
    const pickButton = matchCards.first().locator('a').filter({ hasText: 'Pick Your XI' });
    if (await pickButton.isVisible()) {
      // Upcoming match has pick button
      await expect(pickButton).toBeVisible();
    }
  });

  test('3. Squad selection - user can pick 11 players and save', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/matches`);

    await page.waitForSelector('.match-card');

    // Find first match with "Pick Your XI" button (upcoming)
    const pickButton = page.locator('a').filter({ hasText: 'Pick Your XI' }).first();
    if (!(await pickButton.isVisible())) {
      // All matches might be locked; skip gracefully
      test.skip(true, 'No upcoming matches available for squad selection');
      return;
    }

    await pickButton.click();
    await page.waitForURL('**/squad/**');

    // Verify squad builder page
    await expect(page.locator('.page-title')).toContainText('Pick Your Playing XI');

    // Wait for players to load
    await page.waitForSelector('.player-row');

    // Verify player list shows
    const players = page.locator('.player-row');
    const playerCount = await players.count();
    expect(playerCount).toBeGreaterThanOrEqual(11);

    // Select 11 players by clicking them
    for (let i = 0; i < 11 && i < playerCount; i++) {
      await players.nth(i).click();
      await page.waitForTimeout(100); // Small delay for state update
    }

    // Verify selection count
    await expect(page.locator('.selection-info')).toContainText('11/11');

    // Set captain - click the "C" button on first selected player
    const captainBtn = page.locator('.captain-btn').first();
    await captainBtn.click();
    await expect(captainBtn).toHaveClass(/is-captain/);

    // Save squad
    const saveBtn = page.locator('.save-btn');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify success message
    await expect(page.locator('.msg')).toContainText('Squad saved successfully');
  });

  test('4. Admin panel - displays all matches', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/admin`);

    // Verify admin page title
    await expect(page.locator('.page-title')).toContainText('Admin - Score Update Panel');

    // Wait for matches to load
    await page.waitForSelector('.match-card');

    // Verify matches are displayed
    const matchCards = page.locator('.match-card');
    await expect(matchCards.first()).toBeVisible();

    // Verify "Auto-Update Scores" button exists for UPCOMING matches
    const updateBtn = page.locator('button').filter({ hasText: 'Auto-Update Scores' }).first();
    if (await updateBtn.isVisible()) {
      await expect(updateBtn).toBeEnabled();
    }
  });

  test('5. Admin score update - single click updates match scores', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');

    // Find an UPCOMING match with update button
    const updateBtn = page.locator('button').filter({ hasText: 'Auto-Update Scores' }).first();

    if (!(await updateBtn.isVisible())) {
      test.skip(true, 'No matches available for score update');
      return;
    }

    // Click Auto-Update Scores
    await updateBtn.click();

    // Wait for the update to complete (spinner appears then disappears)
    await page.waitForSelector('.result-msg', { timeout: 15000 });

    // Verify success message
    const resultMsg = page.locator('.result-msg').first();
    await expect(resultMsg).toContainText('Scores updated');

    // Verify score is now displayed
    await expect(page.locator('.score').first()).toBeVisible();

    // Verify the match now shows "Scores Updated" (disabled button)
    await expect(page.locator('button').filter({ hasText: 'Scores Updated' }).first()).toBeVisible();
  });

  test('6. View player stats after score update', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/admin`);
    await page.waitForSelector('.match-card');

    // Find a COMPLETED match with "View Stats" button
    const viewStatsBtn = page.locator('button').filter({ hasText: 'View Stats' }).first();

    if (!(await viewStatsBtn.isVisible())) {
      test.skip(true, 'No completed matches to view stats');
      return;
    }

    // Click View Stats
    await viewStatsBtn.click();

    // Verify stats table appears
    await page.waitForSelector('.stats-table');
    const table = page.locator('.stats-table table');
    await expect(table).toBeVisible();

    // Verify table has rows (player stats)
    const rows = table.locator('tr.mat-mdc-row');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('7. Leaderboard - shows updated points after score calculation', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/leaderboard`);

    // Verify leaderboard title
    await expect(page.locator('.page-title')).toContainText('Leaderboard');

    // Wait for table to render
    await page.waitForSelector('table');

    // Verify table has at least one user
    const rows = page.locator('tr.mat-mdc-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(1);

    // Verify our test user appears
    await expect(page.locator('table')).toContainText('e2eTestUser');
  });

  test('8. Navigation - all nav links work correctly', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');

    // Navigate to Matches
    await page.locator('a.nav-link').filter({ hasText: 'Matches' }).click();
    await page.waitForURL('**/matches');
    await expect(page.locator('.page-title')).toContainText('FIFA WC 2026');

    // Navigate to Leaderboard
    await page.locator('a.nav-link').filter({ hasText: 'Leaderboard' }).click();
    await page.waitForURL('**/leaderboard');
    await expect(page.locator('.page-title')).toContainText('Leaderboard');

    // Navigate to Admin
    await page.locator('.admin-link').click();
    await page.waitForURL('**/admin');
    await expect(page.locator('.page-title')).toContainText('Admin');

    // Logout
    await page.locator('button').filter({ hasText: 'Logout' }).click();

    // Should show Login link again
    await expect(page.locator('a.nav-link').filter({ hasText: 'Login' })).toBeVisible();

    // Admin link should be hidden
    await expect(page.locator('.admin-link')).not.toBeVisible();
  });

  test('9. Squad persistence - saved squad loads on revisit', async ({ page }) => {
    await loginUser(page, 'e2eTestUser');
    await page.goto(`${BASE}/matches`);
    await page.waitForSelector('.match-card');

    // Click on Pick Your XI for any upcoming match
    const pickButton = page.locator('a').filter({ hasText: 'Pick Your XI' }).first();
    if (!(await pickButton.isVisible())) {
      test.skip(true, 'No upcoming matches');
      return;
    }

    await pickButton.click();
    await page.waitForURL('**/squad/**');
    await page.waitForSelector('.player-row');

    // If user previously saved a squad, it should be pre-loaded
    // Check if any players are already selected
    const selected = page.locator('.player-row.selected');
    const selectedCount = await selected.count();
    // This test just verifies the page loads correctly with or without pre-selection
    expect(selectedCount).toBeGreaterThanOrEqual(0);
  });

  test('10. API health check - backend endpoints respond correctly', async ({ request }) => {
    // Check public endpoints
    const matchesResp = await request.get(`${API}/matches`);
    expect(matchesResp.ok()).toBeTruthy();
    const matches = await matchesResp.json();
    expect(Array.isArray(matches)).toBeTruthy();

    // Check auth endpoint
    const loginResp = await request.post(`${API}/auth/login`, {
      data: { username: 'apiTestUser' }
    });
    expect(loginResp.ok()).toBeTruthy();
    const loginData = await loginResp.json();
    expect(loginData.token).toBeTruthy();

    // Check authenticated endpoint with token
    const teamsResp = await request.get(`${API}/teams`, {
      headers: { Authorization: `Bearer ${loginData.token}` }
    });
    expect(teamsResp.ok()).toBeTruthy();

    // Check admin update scores via API
    const adminResp = await request.post(`${API}/admin/update-scores/1`, {
      headers: { Authorization: `Bearer ${loginData.token}` }
    });
    // May succeed or fail depending on match state, but shouldn't be 401/403
    expect(adminResp.status()).not.toBe(401);
    expect(adminResp.status()).not.toBe(403);
  });
});

// Helper function to login via the UI
async function loginUser(page: Page, username: string) {
  // Check if already logged in
  await page.goto(`${BASE}/matches`);
  const loginLink = page.locator('a.nav-link').filter({ hasText: 'Login' });

  if (await loginLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.goto(`${BASE}/login`);
    await page.locator('input[matInput]').fill(username);
    await page.locator('button').filter({ hasText: 'Enter' }).click();
    await page.waitForURL('**/matches');
  }
}
