import { bad } from './validation';
interface CSVRecord {
  line: number;
  cells: string[];
}
export function parseCsv(csv: string): CSVRecord[] {
  const rows: CSVRecord[] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const commit = () => {
    rows.push({ line: start, cells: [...cells, cell] });
    cells = [];
    cell = '';
    closed = false;
    start = line + 1;
  };
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]!;
    if (quoted) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += char;
        if (char === '\n') line++;
      }
      continue;
    }
    if (char === '"') {
      if (cell || closed)
        return bad(`第 ${line} 行：引号位置不正确`, {
          csv: '双引号必须从单元格开头开始',
        });
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
      closed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[index + 1] === '\n') index++;
      commit();
      line++;
      start = line;
    } else {
      if (closed)
        return bad(`第 ${line} 行：引号后存在额外字符`, {
          csv: '闭合引号后只能跟逗号或换行',
        });
      cell += char;
    }
  }
  if (quoted) return bad('CSV 引号未闭合', { csv: '请检查引号配对' });
  if (cell || cells.length || closed)
    rows.push({ line: start, cells: [...cells, cell] });
  return rows.filter((row) => row.cells.some((value) => value.trim() !== ''));
}
