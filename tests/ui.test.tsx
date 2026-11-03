import { App, ConfigProvider } from 'antd';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CIEditor } from '../src/features/ci-editor';
import { ImportPage } from '../src/features/import';
import {
  RuntimeProvider,
  createRuntime,
  type Runtime,
} from '../src/shared/api/runtime';
import { models, sampleCsv } from '../src/shared/api/seed';

function shell(children: ReactNode, runtime: Runtime) {
  return (
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <RuntimeProvider value={runtime}>
          <MemoryRouter>{children}</MemoryRouter>
        </RuntimeProvider>
      </App>
    </ConfigProvider>
  );
}
describe('prototype workflows', () => {
  it('submits typed custom fields without losing zero or false values', async () => {
    const runtime = createRuntime(0),
      user = userEvent.setup(),
      onSaved = vi.fn();
    await runtime.api.createModel({
      id: 'middleware',
      name: '中间件',
      description: '',
    });
    const definitions = [
      { key: 'note', label: '备注', type: 'text' as const },
      { key: 'capacity', label: '容量', type: 'number' as const },
      { key: 'managed', label: '托管', type: 'boolean' as const },
      { key: 'renewal', label: '有效期', type: 'date' as const },
      {
        key: 'tier',
        label: '等级',
        type: 'enum' as const,
        options: ['A', 'B'],
      },
      {
        key: 'hostRef',
        label: '宿主机',
        type: 'reference' as const,
        referenceModelId: 'host',
      },
    ];
    for (const [index, field] of definitions.entries())
      await runtime.api.addField('middleware', {
        revision: index + 1,
        field: { ...field, description: '', required: true },
      });
    render(
      shell(
        <CIEditor
          ci={null}
          models={await runtime.api.models()}
          onClose={vi.fn()}
          onSaved={onSaved}
        />,
        runtime,
      ),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByLabelText('资源模型'));
    await user.click(
      screen.getByText('中间件', {
        selector: '.ant-select-item-option-content',
      }),
    );
    for (const [label, value] of Object.entries({
      资源标识: 'demo.typed-ui',
      名称: '示例中间件',
      '负责人 / 团队': '示例团队',
      备注: '虚构资料',
    }))
      fireEvent.change(dialog.getByLabelText(label), { target: { value } });
    fireEvent.change(dialog.getByLabelText('容量'), { target: { value: '0' } });
    await user.click(dialog.getByRole('radio', { name: '否 (false)' }));
    fireEvent.change(dialog.getByLabelText('有效期'), {
      target: { value: '2028-02-29' },
    });
    await user.click(dialog.getByLabelText('等级'));
    await user.click(
      screen.getByText('A', { selector: '.ant-select-item-option-content' }),
    );
    await user.click(dialog.getByLabelText('宿主机'));
    await user.click(
      await screen.findByText('示例应用节点 01 · demo.web-01', {
        selector: '.ant-select-item-option-content',
      }),
    );
    await user.click(dialog.getByRole('button', { name: '保存配置项' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onSaved.mock.calls[0]?.[0].attributes).toEqual({
      note: '虚构资料',
      capacity: 0,
      managed: false,
      renewal: '2028-02-29',
      tier: 'A',
      hostRef: 'ci-demo-host-01',
    });
  });
  it('keeps a failed CI submission editable and succeeds when retried', async () => {
    const runtime = createRuntime(0),
      onSaved = vi.fn(),
      user = userEvent.setup();
    render(
      shell(
        <CIEditor
          ci={null}
          models={models}
          onClose={vi.fn()}
          onSaved={onSaved}
        />,
        runtime,
      ),
    );
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText('资源标识'), 'demo.ui-host');
    await user.type(dialog.getByLabelText('名称'), '界面测试主机');
    await user.type(dialog.getByLabelText('负责人 / 团队'), '示例测试团队');
    runtime.demo.failNext();
    await user.click(dialog.getByRole('button', { name: '保存配置项' }));
    await screen.findByText(/模拟服务暂时不可用/);
    expect((dialog.getByLabelText('名称') as HTMLInputElement).value).toBe(
      '界面测试主机',
    );
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: '保存配置项' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect((await runtime.api.list({ q: 'demo.ui-host' })).total).toBe(1);
  });
  it('blocks import before preview, invalidates a changed preview and preserves failed input', async () => {
    const runtime = createRuntime(0),
      user = userEvent.setup();
    render(shell(<ImportPage />, runtime));
    const importButton = () =>
      screen.getByRole('button', { name: /确认导入/ }) as HTMLButtonElement;
    expect(importButton().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '填入示例' }));
    runtime.demo.failNext();
    await user.click(screen.getByRole('button', { name: '校验并预览' }));
    await screen.findByText(/模拟服务暂时不可用/);
    expect(
      (screen.getByLabelText('CSV 内容') as HTMLTextAreaElement).value,
    ).toBe(sampleCsv);
    await user.click(screen.getByRole('button', { name: '校验并预览' }));
    await screen.findByText(
      '校验通过，可以提交。提交时仍会重新校验唯一性和字段。',
    );
    expect(importButton().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('CSV 内容'), {
      target: {
        value:
          sampleCsv + '\ndemo.extra,示例额外主机,host,示例团队,staging,active',
      },
    });
    expect(importButton().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '校验并预览' }));
    await screen.findByRole('button', { name: '确认导入 3 项' });
    await user.click(screen.getByRole('button', { name: '确认导入 3 项' }));
    await screen.findByText('已导入 3 个配置项（模拟）');
    expect((await runtime.api.summary()).total).toBe(9);
  });
});
