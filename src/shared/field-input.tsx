import { Input, InputNumber, Radio, Select } from 'antd';
import type { AttributeValue, CI, ModelField } from './api/contracts';

export const fieldTypeLabels = {
  text: '文本',
  number: '数字',
  boolean: '布尔',
  date: '日期',
  enum: '枚举',
  reference: '引用',
};
export function fieldControl(
  field: ModelField,
  cis: CI[] = [],
  retainedValue?: AttributeValue,
) {
  switch (field.type) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} />;
    case 'boolean':
      return (
        <Radio.Group
          options={[
            { label: '未设置', value: undefined },
            { label: '是 (true)', value: true },
            { label: '否 (false)', value: false },
          ]}
        />
      );
    case 'date':
      return <Input type="date" />;
    case 'enum':
      return (
        <Select
          allowClear
          options={field.options?.map((value) => ({ label: value, value }))}
        />
      );
    case 'reference':
      return (
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          options={cis
            .filter(
              (ci) =>
                ci.modelId === field.referenceModelId &&
                (ci.status !== 'retired' || ci.id === retainedValue),
            )
            .map((ci) => ({
              value: ci.id,
              label: `${ci.name} · ${ci.externalKey}`,
              disabled: ci.status === 'retired',
            }))}
        />
      );
    default:
      return <Input maxLength={120} />;
  }
}
export const attributeText = (value: unknown) =>
  value === undefined || value === null || value === ''
    ? '未填写'
    : typeof value === 'boolean'
      ? value
        ? '是 (true)'
        : '否 (false)'
      : String(value);
