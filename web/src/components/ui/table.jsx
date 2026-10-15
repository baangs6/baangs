import * as React from "react"
import { cn } from "cn"
const CellPrimitive = "td";
const ColumnPrimitive = "th";
const RowPrimitive = "tr";
const TableBodyPrimitive = "tbody";
const TableFooterPrimitive = "tfoot";
const TableHeaderPrimitive = "thead";
const TablePrimitive = "table";

function Table({
  className,
  ...props
}) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <TablePrimitive
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader(
  {
    className,
    ...props
  }
) {
  return (
    <TableHeaderPrimitive
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody(
  {
    className,
    ...props
  }
) {
  return (
    <TableBodyPrimitive
      data-slot="table-body"
      className={cn(
        "data-empty:h-24 data-empty:text-center [&_tr:last-child]:border-0",
        className
      )}
      {...props}
    />
  )
}

function TableFooter(
  {
    className,
    ...props
  }
) {
  return (
    <TableFooterPrimitive
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow(
  {
    className,
    ...props
  }
) {
  return (
    <RowPrimitive
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-selected:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  ...props
}) {
  return (
    <ColumnPrimitive
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  ...props
}) {
  return (
    <CellPrimitive
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}) {
  return (
    <figcaption
      data-slot="table-caption"
      className={cn(
        "mt-4 text-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
