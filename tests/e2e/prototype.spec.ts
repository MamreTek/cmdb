import { test, expect } from '@playwright/test';

test('create, edit, relate and retire a configuration item', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/#/cis');
  await expect(page.getByText('产品原型 / 模拟数据')).toBeVisible();
  await expect(
    page.getByRole('button', { name: '示例应用节点 01' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '新建配置项', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '新建配置项' });
  await editor
    .getByLabel('资源标识', { exact: true })
    .fill('demo.browser-host');
  await editor.getByLabel('名称', { exact: true }).fill('浏览器测试节点');
  await editor
    .getByLabel('负责人 / 团队', { exact: true })
    .fill('示例测试团队');
  await editor.getByLabel('IPv4 地址', { exact: true }).fill('192.0.2.90');
  await editor.getByRole('button', { name: '保存配置项' }).click();
  const detail = page.getByRole('dialog', { name: '配置项详情' });
  await expect(
    detail.getByRole('heading', { name: '浏览器测试节点' }),
  ).toBeVisible();
  await expect(detail.getByText('192.0.2.90', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '编辑属性' }).click();
  const edit = page.getByRole('dialog', {
    name: '编辑配置项 · 浏览器测试节点',
  });
  await edit.getByLabel('负责人 / 团队', { exact: true }).fill('示例接管团队');
  await edit.getByRole('button', { name: '保存配置项' }).click();
  await expect(detail.getByText('示例接管团队', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '建立关系', exact: true }).click();
  const relation = page.getByRole('dialog', { name: '建立资源关系' });
  await relation.getByLabel('目标配置项', { exact: true }).click();
  await relation
    .getByLabel('目标配置项', { exact: true })
    .fill('示例订单数据库');
  await relation.getByLabel('目标配置项', { exact: true }).press('ArrowDown');
  await relation.getByLabel('目标配置项', { exact: true }).press('Enter');
  await relation.getByRole('button', { name: '保存关系' }).click();
  await detail.getByRole('tab', { name: '资源关系 (1)' }).click();
  await expect(
    detail.getByRole('link', { name: '示例订单数据库' }),
  ).toBeVisible();
  await detail.getByRole('button', { name: '移除', exact: true }).click();
  await page.getByRole('button', { name: '确认移除' }).click();
  await expect(detail.getByRole('tab', { name: '资源关系 (0)' })).toBeVisible();
  await detail.getByRole('button', { name: '标记退役' }).click();
  await page.getByRole('button', { name: '确认退役' }).click();
  await expect(detail.getByText('已退役', { exact: true })).toBeVisible();
  await expect(
    detail.getByRole('button', { name: '建立关系', exact: true }),
  ).toBeDisabled();
  await detail.getByRole('tab', { name: '变更记录' }).click();
  await expect(
    detail.getByText(/移除 浏览器测试节点 → 示例订单数据库/),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('search empty state, service retry and atomic CSV import', async ({
  page,
}) => {
  await page.goto('/#/cis');
  await expect(
    page.getByRole('button', { name: '示例应用节点 01' }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: '搜索配置项' })
    .fill('does-not-exist');
  await page.getByRole('searchbox', { name: '搜索配置项' }).press('Enter');
  await expect(page.getByText('还没有匹配的配置项')).toBeVisible();
  await page.getByRole('button', { name: '模拟下次失败' }).click();
  await page.getByRole('button', { name: '刷新清单' }).click();
  await expect(page.getByText(/模拟服务暂时不可用/)).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('还没有匹配的配置项')).toBeVisible();
  await page.getByRole('link', { name: '快速导入' }).click();
  await page.getByRole('button', { name: '填入示例' }).click();
  await page.getByRole('button', { name: '校验并预览' }).click();
  await page.getByRole('button', { name: '确认导入 2 项' }).click();
  await expect(page.getByText('已导入 2 个配置项（模拟）')).toBeVisible();
  await page.getByRole('link', { name: '前往资源清单查看新记录' }).click();
  await expect(page.getByRole('button', { name: '示例新服务' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('共 6 个配置项')).toBeVisible();
});

test('mobile navigation and overview fit a narrow viewport', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: '建立 示例订单服务', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'artifacts/overview-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '让每一项资源，都有清晰的来处' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '打开导航' }).click();
  const nav = page.getByRole('dialog');
  await nav.getByRole('link', { name: '资源模型' }).click();
  await expect(
    page.getByRole('heading', { name: '模型，够用就好' }),
  ).toBeVisible();
  await expect(page.getByText('ipAddress', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/models-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
