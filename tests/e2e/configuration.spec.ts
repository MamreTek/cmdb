import { test, expect, type Page } from '@playwright/test';

async function choose(page: Page, label: string, value: string) {
  const control = page.getByLabel(label, { exact: true });
  await control.click();
  const listId = await control.getAttribute('aria-controls');
  if (!listId) throw new Error(`Select ${label} has no associated list`);
  const popup = page
    .locator('.ant-select-dropdown')
    .filter({ has: page.locator(`[id="${listId}"]`) });
  await popup
    .locator('.ant-select-item-option')
    .filter({
      has: page.locator('.ant-select-item-option-content', {
        hasText: new RegExp(
          `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        ),
      }),
    })
    .click();
  await expect(popup).not.toBeVisible();
}

test('configure a model field, map an update import, save a view and inspect service dependencies', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/models');
  const hostRow = page
    .getByRole('row')
    .filter({ has: page.getByText('host', { exact: true }) });
  await hostRow.getByRole('button', { name: '新增字段' }).click();
  const field = page.getByRole('dialog', { name: '新增字段 · 主机' });
  await field.getByLabel('字段标识', { exact: true }).fill('costCenter');
  await field.getByLabel('字段名称', { exact: true }).fill('成本中心');
  await field.getByLabel('默认值（可选）', { exact: true }).fill('demo-center');
  await field.getByRole('checkbox', { name: '必填', exact: true }).check();
  await field.getByRole('button', { name: '预览影响' }).click();
  await expect(
    field.getByText('影响 3 个资源，默认值回填 3 个，阻塞 0 个'),
  ).toBeVisible();
  await expect(
    field.getByRole('button', { name: '确认添加字段' }),
  ).toBeEnabled();
  await page.screenshot({
    path: 'artifacts/schema-preview-desktop.png',
    fullPage: true,
  });
  await field.getByRole('button', { name: '确认添加字段' }).click();
  await expect(field).not.toBeVisible();
  await expect(page.getByText('costCenter', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '快速导入', exact: true }).click();
  await page
    .getByLabel('CSV 内容')
    .fill(
      '标识,名称,模型,团队,环境,状态,中心\ndemo.web-01,示例节点映射更新,host,示例接管团队,production,active,demo-updated',
    );
  await choose(page, '导入模式', '新增或更新（按资源标识）');
  await page.getByRole('checkbox', { name: '自定义列映射' }).check();
  for (const [target, source] of Object.entries({
    externalKey: '标识',
    name: '名称',
    modelId: '模型',
    owner: '团队',
    environment: '环境',
    status: '状态',
    'attributes.costCenter': '中心',
  }))
    await choose(page, `映射 ${target}`, source);
  await page.getByRole('button', { name: '校验并预览' }).click();
  await expect(page.getByText('更新 1', { exact: true })).toBeVisible();
  await expect(
    page.getByText('attributes.costCenter：demo-center → demo-updated'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '确认导入 1 项' }),
  ).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'artifacts/mapped-import-desktop.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '确认导入 1 项' }).click();
  await expect(
    page.getByText('导入完成：新增 0，更新 1，无变化 0（模拟）'),
  ).toBeVisible();
  await page.getByRole('link', { name: '前往资源清单查看新记录' }).click();
  await choose(page, '筛选资源模型', '主机');
  await choose(page, '筛选模型属性', '成本中心');
  await page.getByLabel('属性等值条件', { exact: true }).fill('demo-updated');
  await page.getByLabel('属性等值条件', { exact: true }).press('Enter');
  await expect(page.getByText('共 1 个配置项')).toBeVisible();
  await page
    .getByRole('button', { name: '示例节点映射更新', exact: true })
    .click();
  const detail = page.getByRole('dialog', { name: '配置项详情' });
  await expect(detail.getByText('192.0.2.10', { exact: true })).toBeVisible();
  await expect(detail.getByText('demo-updated', { exact: true })).toBeVisible();
  await expect(detail.getByText(/CSV 演示导入/)).toBeVisible();
  await detail.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '保存当前筛选' }).click();
  await page.getByLabel('视图名称').fill('映射后的生产节点');
  await page.getByRole('button', { name: '保存视图', exact: true }).click();
  await page.getByRole('link', { name: '资源关系', exact: true }).click();
  await expect(page.getByText('服务依赖树', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('tree')
      .getByRole('link', { name: '示例节点映射更新', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/service-tree-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: '资源清单', exact: true }).click();
  await choose(page, '保存的视图', '映射后的生产节点');
  await expect(page.getByText('共 1 个配置项')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '示例节点映射更新', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('custom model creation and schema/relationship forms fit a narrow viewport', async ({
  page,
}) => {
  await page.goto('/#/models');
  await page.getByRole('button', { name: '新建模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建资源模型' });
  await dialog.getByLabel('模型标识').fill('middleware');
  await dialog.getByLabel('模型名称').fill('中间件');
  await dialog.getByRole('button', { name: '创建模型' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('middleware', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: '模型关系规则' }).click();
  await page.getByRole('button', { name: '新增规则' }).click();
  const rule = page.getByRole('dialog', { name: '新增模型关系规则' });
  await choose(page, '源模型', '中间件');
  await choose(page, '目标模型', '主机');
  await choose(page, '关系基数', '1:1');
  await rule.getByRole('button', { name: '保存规则' }).click();
  await expect(rule).not.toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/model-rules-mobile.png',
    fullPage: true,
  });
});
