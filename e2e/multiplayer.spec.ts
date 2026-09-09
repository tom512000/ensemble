import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, nickname: string) {
  await page.getByLabel('Votre pseudo').fill(nickname);
  await page.getByRole('button', { name: 'C’est parti' }).click();
}
async function createRoom(page: Page, nickname: string, objects = 30) {
  await page.goto('/games/sorting');
  await page.getByRole('button', { name: 'Créer une partie', exact: true }).click();
  await register(page, nickname);
  // Pinned so the scenario does not depend on whatever the default happens to be.
  await page.getByLabel('Objets à ranger').fill(String(objects));
  await page.getByRole('button', { name: 'Créer la partie', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'On s’installe ?' })).toBeVisible();
}

test('30 bottles, two independent browser contexts, reconnect and shared victory', async ({
  browser,
}) => {
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bContext = await browser.newContext({ viewport: { width: 1050, height: 850 } });
  const alice = await aContext.newPage(),
    bob = await bContext.newPage();
  const browserErrors: string[] = [];
  alice.on('pageerror', (error) => browserErrors.push(error.message));
  bob.on('pageerror', (error) => browserErrors.push(error.message));
  try {
    await alice.goto('/');
    await expect(alice.getByRole('heading', { name: /Des petits jeux/ })).toBeVisible();
    await alice.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
    await createRoom(alice, 'Camille');
    const url = alice.url();
    await expect(alice.getByLabel('Objets à ranger')).toHaveValue('30');
    await expect(alice.getByLabel('Nombre maximal de joueurs')).toHaveValue('4');
    await bob.goto(url);
    await register(bob, 'Alex');
    await expect(alice.getByText('Alex', { exact: true })).toBeVisible();
    await expect(bob.getByText('Camille', { exact: true })).toBeVisible();
    await alice.screenshot({ path: 'test-results/lobby-desktop.png', fullPage: true });
    await alice.getByRole('button', { name: 'Tout le monde est là, on joue !' }).click();
    await expect(alice.locator('[data-bottle]')).toHaveCount(30);
    await expect(bob.locator('[data-bottle]')).toHaveCount(30);
    expect(
      await alice
        .locator('[data-bottle]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-color'))),
    ).toEqual(
      await bob
        .locator('[data-bottle]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-color'))),
    );
    const aBoard = (await alice.getByTestId('sorting-board').boundingBox())!;
    await alice.mouse.move(aBoard.x + aBoard.width * 0.5, aBoard.y + aBoard.height * 0.5);
    await expect(bob.locator('[data-cursor]').first()).toHaveCSS('opacity', '1');
    const first = alice.locator('[data-bottle="b0"]');
    const firstBox = (await first.boundingBox())!;
    await alice.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await alice.mouse.down();
    await expect(bob.locator('[data-bottle="b0"]')).not.toHaveAttribute('data-owner', '');
    const beforeMove = await bob.locator('[data-bottle="b0"]').getAttribute('style');
    await alice.mouse.move(aBoard.x + aBoard.width * 0.55, aBoard.y + aBoard.height * 0.6, {
      steps: 8,
    });
    await expect
      .poll(() => bob.locator('[data-bottle="b0"]').getAttribute('style'))
      .not.toBe(beforeMove);
    await alice.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
    // Refresh while holding: the server must release the lock and restore the same round.
    await alice.reload();
    await expect(alice.locator('[data-bottle]')).toHaveCount(30);
    await expect(bob.locator('[data-bottle="b0"]')).toHaveAttribute('data-owner', '');
    await expect(alice.locator('[data-bottle="b0"]')).toHaveAttribute('data-owner', '');
    // Wrong drop must return the object without increasing the score.
    const wrongBottle = alice.locator('[data-bottle="b0"]');
    const color = await wrongBottle.getAttribute('data-color');
    const wrongBin = alice.locator('[data-bin]:not([data-bin="' + color + '"])').first();
    await wrongBottle.focus();
    await alice.keyboard.press('Enter');
    await expect(wrongBottle).not.toHaveAttribute('data-owner', '');
    await wrongBin.focus();
    await alice.keyboard.press('Enter');
    await expect(wrongBottle).toHaveAttribute('data-owner', '');
    await expect(wrongBottle).toHaveAttribute('data-sorted', 'false');
    for (let i = 0; i < 30; i++) {
      const player = i % 2 ? bob : alice;
      const bottle = player.locator('[data-bottle="b' + i + '"]');
      const color = await bottle.getAttribute('data-color');
      const box = (await bottle.boundingBox())!;
      const bin = (await player.locator('[data-bin="' + color + '"]').boundingBox())!;
      await player.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await player.mouse.down();
      await expect(bottle).not.toHaveAttribute('data-owner', '');
      await player.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 5 });
      await player.mouse.up();
      await expect(alice.locator('[data-bottle="b' + i + '"]')).toHaveAttribute(
        'data-sorted',
        'true',
      );
      await expect(bob.locator('[data-bottle="b' + i + '"]')).toHaveAttribute(
        'data-sorted',
        'true',
      );
      // Maintain realistic input frequency; network budgets are part of the application.
      await player.waitForTimeout(180);
    }
    await expect(
      alice.getByRole('heading', { name: 'C’est encore mieux ensemble.' }),
    ).toBeVisible();
    await expect(bob.getByRole('heading', { name: 'C’est encore mieux ensemble.' })).toBeVisible();
    await expect(alice.getByTestId('sorted-count')).toHaveText('30 / 30 rangées');
    await alice.screenshot({ path: 'test-results/victory-desktop.png', fullPage: true });
    await alice.getByRole('button', { name: 'On remet un peu de bazar ?' }).click();
    await expect(bob.getByRole('heading', { name: 'On s’installe ?' })).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await aContext.close();
    await bContext.close();
  }
});

test('mobile layout, touch drag and reduced motion', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    await page.goto('/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
    await createRoom(page, 'Lou');
    await page.getByRole('button', { name: 'Tout le monde est là, on joue !' }).click();
    await expect(page.locator('[data-bottle]')).toHaveCount(30);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bottle = page.locator('[data-bottle="b0"]');
    const color = await bottle.getAttribute('data-color');
    const box = (await bottle.boundingBox())!;
    const bin = (await page.locator('[data-bin="' + color + '"]').boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await expect(bottle).not.toHaveAttribute('data-owner', '');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: bin.x + bin.width / 2, y: bin.y + bin.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(bottle).toHaveAttribute('data-sorted', 'true');
    await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  } finally {
    await context.close();
  }
});
