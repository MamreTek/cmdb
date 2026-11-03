import { test, expect, type Page, type Locator } from '@playwright/test';

async function selectType(page: Page, control: Locator, name: string) {
  await control.click();
  const id = await control.getAttribute('aria-controls');
  const popup = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${id}"]`) });
  await popup
    .locator('.ant-select-item-option')
    .filter({
      has: page.locator('.ant-select-item-option-content', {
        hasText: new RegExp(
          '^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
        ),
      }),
    })
    .click();
  await expect(popup).not.toBeVisible();
}

test('CI Class inheritance, typed fields, class selection and read-only migration preview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/models');
  await page.getByText('主机 (host)', { exact: true }).click();
  await page.getByRole('button', { name: '新建子类', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '新建资源模型' });
  await dialog.getByLabel('模型标识').fill('linux');
  await dialog.getByLabel('模型名称').fill('Linux主机');
  await dialog.getByRole('button', { name: '创建模型' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('主机 · 继承只读', { exact: true })).toHaveCount(
    2,
  );
  await page.getByText('主机 (host)', { exact: true }).click();
  await page.getByRole('button', { name: '新增字段', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '新增字段 · 主机' });
  await dialog.getByLabel('字段标识', { exact: true }).fill('siteCode');
  await dialog.getByLabel('字段名称', { exact: true }).fill('机房编码');
  await selectType(
    page,
    dialog.getByLabel('字段类型', { exact: true }),
    'varchar（变长字符串）',
  );
  await dialog.getByLabel('最大字符数', { exact: true }).fill('2');
  await dialog.getByLabel('默认值（可选）', { exact: true }).fill('华北');
  await dialog.getByRole('checkbox', { name: '必填', exact: true }).check();
  await dialog.getByRole('button', { name: '预览影响' }).click();
  await expect(dialog.getByText('Linux主机', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '确认添加字段' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '新增字段', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '新增字段 · 主机' });
  await dialog.getByLabel('字段标识', { exact: true }).fill('observedAt');
  await dialog.getByLabel('字段名称', { exact: true }).fill('观测时间');
  await selectType(
    page,
    dialog.getByLabel('字段类型', { exact: true }),
    'timestamp（带时区时间点）',
  );
  await dialog.getByRole('button', { name: '预览影响' }).click();
  await dialog.getByRole('button', { name: '确认添加字段' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByText('Linux主机 (linux)', { exact: true }).click();
  await expect(page.getByText('主机 · 继承只读', { exact: true })).toHaveCount(
    4,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'artifacts/class-inheritance-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: '资源清单', exact: true }).click();
  await page.getByRole('button', { name: '新建配置项', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '新建配置项' });
  await dialog.getByLabel('资源模型', { exact: true }).click();
  await page
    .locator('.ant-select-tree-title')
    .getByText('Linux主机', { exact: true })
    .click();
  await dialog.getByLabel('资源标识', { exact: true }).fill('demo.linux-class');
  await dialog.getByLabel('名称', { exact: true }).fill('示例Linux节点');
  await dialog.getByLabel('负责人 / 团队', { exact: true }).fill('示例团队');
  await dialog.getByLabel('机房编码', { exact: true }).fill('华北区');
  await dialog
    .getByLabel('观测时间', { exact: true })
    .fill('2026-11-03T18:00:00+08:00');
  await dialog.getByRole('button', { name: '保存配置项' }).click();
  await expect(
    dialog.getByText('varchar 长度无效', { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByLabel('机房编码', { exact: true })).toHaveValue(
    '华北区',
  );
  await dialog.getByLabel('机房编码', { exact: true }).fill('华东');
  await dialog.getByRole('button', { name: '保存配置项' }).click();
  const detail = page.getByRole('dialog', { name: '配置项详情' });
  await expect(
    detail.getByText('2026-11-03T10:00:00.000Z', { exact: true }),
  ).toBeVisible();
  await detail.getByRole('button', { name: '关闭' }).click();
  await selectType(
    page,
    page.getByLabel('筛选资源模型', { exact: true }),
    '主机',
  );
  await expect(page.getByText('共 3 个配置项')).toBeVisible();
  await page.getByRole('checkbox', { name: '包含子类' }).click();
  await expect(page.getByRole('checkbox', { name: '包含子类' })).toBeChecked();
  await expect(page).toHaveURL(/includeDescendants=true/);
  await expect(page.getByText('共 4 个配置项')).toBeVisible();
  await page.getByRole('link', { name: '资源模型', exact: true }).click();
  await page.getByText('主机 (host)', { exact: true }).click();
  const row = page.locator('tr[data-row-key="siteCode"]');
  await row.getByRole('button', { name: '预览迁移' }).click();
  dialog = page.getByRole('dialog', { name: '字段迁移预览 · 主机' });
  await dialog.getByLabel('最大字符数', { exact: true }).fill('1');
  await dialog.getByLabel('默认值（可选）', { exact: true }).fill('');
  await dialog.getByRole('button', { name: '评估影响' }).click();
  await expect(
    dialog.getByText('影响 4 个资源，默认值回填 0 个，阻塞 4 个'),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: '确认添加字段' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/type-migration-preview.png',
    fullPage: true,
  });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Linux主机 (linux)', { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'artifacts/class-tree-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
