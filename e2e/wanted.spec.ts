import { test, expect, type Page } from '@playwright/test';

async function register(page: Page, nickname: string) {
  await page.getByLabel('Votre pseudo').fill(nickname);
  await page.getByRole('button', { name: 'C’est parti' }).click();
}

/** Trouve la tête sans jumelle exactement comme un joueur : en comparant les visages. */
async function findLoner(page: Page) {
  const heads = await page
    .locator('[data-head]')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({ id: n.getAttribute('data-head')!, art: n.innerHTML })),
    );
  const counts = new Map<string, number>();
  for (const head of heads) counts.set(head.art, (counts.get(head.art) ?? 0) + 1);
  const alone = heads.filter((head) => counts.get(head.art) === 1);
  expect(alone, 'une seule tête doit être sans jumelle').toHaveLength(1);
  return { id: alone[0]!.id, total: heads.length };
}

test('deux navigateurs, niveaux qui montent et victoire partagée', async ({ browser }) => {
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bContext = await browser.newContext({ viewport: { width: 1100, height: 860 } });
  const alice = await aContext.newPage();
  const bob = await bContext.newPage();
  const errors: string[] = [];
  alice.on('pageerror', (e) => errors.push(e.message));
  bob.on('pageerror', (e) => errors.push(e.message));
  try {
    await alice.goto('/games/wanted');
    await alice.getByRole('button', { name: 'Créer une partie', exact: true }).click();
    await register(alice, 'Camille');
    await alice.getByLabel('Niveaux à franchir').fill('4');
    await alice.getByRole('button', { name: 'Créer la partie', exact: true }).click();
    await expect(alice.getByRole('heading', { name: 'On s’installe ?' })).toBeVisible();

    const url = alice.url();
    await bob.goto(url);
    await register(bob, 'Alex');
    await expect(alice.getByText('Alex', { exact: true })).toBeVisible();
    await alice.getByRole('button', { name: 'Tout le monde est là, on joue !' }).click();

    // Les deux joueurs voient la même foule.
    await expect(alice.locator('[data-head]')).toHaveCount(10);
    await expect(bob.locator('[data-head]')).toHaveCount(10);
    expect(
      await alice
        .locator('[data-head]')
        .evaluateAll((n) => n.map((x) => x.getAttribute('data-head'))),
    ).toEqual(
      await bob
        .locator('[data-head]')
        .evaluateAll((n) => n.map((x) => x.getAttribute('data-head'))),
    );

    let previous = 0;
    for (let level = 1; level <= 4; level++) {
      const finder = level % 2 ? alice : bob;
      const other = level % 2 ? bob : alice;
      const { id, total } = await findLoner(finder);
      // La foule grossit vraiment d'un niveau à l'autre.
      expect(total).toBeGreaterThan(previous);
      previous = total;
      if (level === 1) {
        // Une mauvaise réponse ne fait pas monter de niveau.
        const wrong = await finder.locator(`[data-head]:not([data-head="${id}"])`).first();
        await wrong.click();
        await expect(finder.getByTestId('wanted-level')).toContainText('1');
      }
      await finder.locator(`[data-head="${id}"]`).click();
      if (level < 4)
        await expect(other.getByTestId('wanted-level')).toContainText(String(level + 1));
    }

    await expect(alice.getByRole('heading', { name: /Tous les niveaux/ })).toBeVisible();
    await expect(bob.getByRole('heading', { name: /Tous les niveaux/ })).toBeVisible();
    await alice.screenshot({ path: 'test-results/wanted-victory.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await aContext.close();
    await bContext.close();
  }
});
