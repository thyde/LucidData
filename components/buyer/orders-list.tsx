import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ExportDownload } from '@/components/buyer/export-download'
import { formatCents } from '@/components/dashboard/chart-theme'
import type { DataOrder } from '@/types/database.types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function OrdersList({ orgId, orders }: { orgId: string; orders: DataOrder[] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-muted-foreground">No purchases yet.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Records</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Export</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>{formatDate(order.created_at)}</TableCell>
            <TableCell className="capitalize">{order.order_type}</TableCell>
            <TableCell>{order.record_count}</TableCell>
            <TableCell>{formatCents(order.total_cents)}</TableCell>
            <TableCell>
              <Badge variant={order.status === 'paid' ? 'default' : 'secondary'}>
                {order.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <ExportDownload orgId={orgId} token={order.export_token} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
