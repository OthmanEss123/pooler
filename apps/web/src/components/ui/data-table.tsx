import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  header: string;
  accessor?: keyof T;
  cell?: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  data: T[];
  empty?: ReactNode;
};

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  empty,
}: DataTableProps<T>) {
  if (data.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-left text-sm">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    "whitespace-nowrap px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-neutral-500",
                    column.className,
                  )}
                  key={column.header}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {data.map((row) => (
              <tr className="transition hover:bg-neutral-50" key={row.id}>
                {columns.map((column) => (
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-3.5 text-neutral-700",
                      column.className,
                    )}
                    key={`${row.id}-${column.header}`}
                  >
                    {column.cell
                      ? column.cell(row)
                      : column.accessor
                        ? String(row[column.accessor] ?? "")
                        : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
