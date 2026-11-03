import { Input, InputNumber, Radio, Select } from 'antd';
import type { AttributeValue, CI, CIModel, ModelField } from './api/contracts';
import { isWithinClass } from './api/class-schema';

export const fieldTypeLabels = {
  text: '文本',
  number: '数字',
  boolean: '布尔',
  date: '日期',
  enum: '枚举',
  reference: '引用',
  varchar: 'varchar（变长字符串）',
  integer: 'integer（32位整数）',
  timestamp: 'timestamp（带时区时间点）',
};
export function fieldControl(
  field: ModelField,
  cis: CI[] = [],
  retainedValue?: AttributeValue,
  models: CIModel[] = [],
) {
  switch (field.type) {
    case 'integer':
      return (
        <InputNumber
          style={{ width: '100%' }}
          changeOnBlur={false}
          min={field.minValue ?? -2147483648}
          max={field.maxValue ?? 2147483647}
        />
      );
    case 'varchar':
      return (
        <Input
          showCount
          count={{
            max: field.maxLength ?? 255,
            strategy: (value) => Array.from(value).length,
          }}
        />
      );
    case 'timestamp':
      return <Input placeholder="2026-11-03T10:00:00.000Z 或显式 +08:00" />;
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
                (models.length
                  ? isWithinClass(ci.modelId, field.referenceModelId!, models)
                  : ci.modelId === field.referenceModelId) &&
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
