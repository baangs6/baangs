import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/tailwind.css';
import {
  TableProvider, TableHeader, TableHeaderGroup, TableHead,
  TableBody, TableRow, TableCell, TableColumnHeader,
} from '../../src/components/kibo-ui/table';

const columns = [{
  accessorKey: 'name',
  header: ({ column }) => <TableColumnHeader column={column} title="Name" />,
}];
const data = [{ name: 'Zoe' }, { name: 'Amy' }];

function Example({ rows = data }) {
  return (
    <TableProvider columns={columns} data={rows}>
      <TableHeader>{({ headerGroup }) => (
        <TableHeaderGroup key={headerGroup.id} headerGroup={headerGroup}>
          {({ header }) => <TableHead key={header.id} header={header} />}
        </TableHeaderGroup>
      )}</TableHeader>
      <TableBody>{({ row }) => (
        <TableRow key={row.id} row={row}>
          {({ cell }) => <TableCell key={cell.id} cell={cell} />}
        </TableRow>
      )}</TableBody>
    </TableProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <><Example /><Example /><Example rows={[]} /></>,
);
