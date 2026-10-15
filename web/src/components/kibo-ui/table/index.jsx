import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { createContext, memo, useCallback, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TableBody as TableBodyRaw,
  TableCell as TableCellRaw,
  TableHeader as TableHeaderRaw,
  TableHead as TableHeadRaw,
  Table as TableRaw,
  TableRow as TableRowRaw,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const TableContext = createContext({
  data: [],
  columns: [],
  table: null,
});

export function TableProvider(
  {
    columns,
    data,
    children,
    className
  }
) {
  const [sorting, setSorting] = useState([]);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <TableContext.Provider
      value={{
        data,
        columns: columns,
        table: table,
      }}
    >
      <TableRaw className={className}>{children}</TableRaw>
    </TableContext.Provider>
  );
}

export const TableHead = memo(({
  header,
  className
}) => (
  <TableHeadRaw className={className} key={header.id}>
    {header.isPlaceholder
      ? null
      : flexRender(header.column.columnDef.header, header.getContext())}
  </TableHeadRaw>
));

TableHead.displayName = "TableHead";

export const TableHeaderGroup = ({
  headerGroup,
  children
}) => (
  <TableRowRaw key={headerGroup.id}>
    {headerGroup.headers.map((header) => children({ header }))}
  </TableRowRaw>
);

export const TableHeader = ({
  className,
  children
}) => {
  const { table } = useContext(TableContext);

  return (
    <TableHeaderRaw className={className}>
      {table?.getHeaderGroups().map((headerGroup) => children({ headerGroup }))}
    </TableHeaderRaw>
  );
};

export function TableColumnHeader(
  {
    column,
    title,
    className
  }
) {
  // Extract inline event handlers to prevent unnecessary re-renders
  const handleSortAsc = useCallback(() => {
    column.toggleSorting(false);
  }, [column]);

  const handleSortDesc = useCallback(() => {
    column.toggleSorting(true);
  }, [column]);

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <DropdownMenuTrigger>
          <Button
            className="-ml-3 h-8 data-[state=open]:bg-accent"
            size="sm"
            variant="ghost"
          >
            <span>{title}</span>
            {column.getIsSorted() === "desc" ? (
              <ArrowDownIcon className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "asc" ? (
              <ArrowUpIcon className="ml-2 h-4 w-4" />
            ) : (
              <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
            )}
          </Button>
        <DropdownMenu placement="bottom start">
          <DropdownMenuItem onAction={handleSortAsc} textValue="Ascending">
            <ArrowUpIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Ascending
          </DropdownMenuItem>
          <DropdownMenuItem onAction={handleSortDesc} textValue="Descending">
            <ArrowDownIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground/70" />
            Descending
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
    </div>
  );
}

export const TableCell = ({
  cell,
  className
}) => (
  <TableCellRaw className={className}>
    {flexRender(cell.column.columnDef.cell, cell.getContext())}
  </TableCellRaw>
);

export const TableRow = ({
  row,
  children,
  className
}) => (
  <TableRowRaw
    className={className}
    data-state={row.getIsSelected() && "selected"}
    key={row.id}
  >
    {row.getVisibleCells().map((cell) => children({ cell }))}
  </TableRowRaw>
);

export const TableBody = ({
  children,
  className
}) => {
  const { columns, table } = useContext(TableContext);
  const rows = table?.getRowModel().rows;

  return (
    <TableBodyRaw className={className}>
      {rows?.length ? (
        rows.map((row) => children({ row }))
      ) : (
        <TableRowRaw>
          <TableCellRaw className="h-24 text-center" colSpan={columns.length}>
            No results.
          </TableCellRaw>
        </TableRowRaw>
      )}
    </TableBodyRaw>
  );
};
