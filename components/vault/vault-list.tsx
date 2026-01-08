'use client';

import { useState, useMemo } from 'react';
import { useVaultList } from '@/lib/hooks/useVault';
import { VaultViewDialog } from './vault-view-dialog';
import { VaultEditDialog } from './vault-edit-dialog';
import { VaultCreateDialog } from './vault-create-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VAULT_CATEGORIES } from '@/lib/constants/categories';
import { formatDate } from '@/lib/utils/date-formatter';

interface VaultListProps {
  onEntryClick?: (entryId: string) => void;
}

function isExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return false;
  return new Date() > new Date(expiresAt);
}

export function VaultList({ onEntryClick }: VaultListProps) {
  const { data, isLoading, error, refetch } = useVaultList();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'label' | 'category'>('date');
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    let result = data || [];

    // Category filter
    if (categoryFilter) {
      result = result.filter((entry) => entry.category === categoryFilter);
    }

    // Search filter (case-insensitive on label and description)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (entry) =>
          entry.label.toLowerCase().includes(term) ||
          entry.description?.toLowerCase().includes(term)
      );
    }

    // Sort
    if (sortBy === 'date') {
      result = [...result].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (sortBy === 'label') {
      result = [...result].sort((a, b) => a.label.localeCompare(b.label));
    } else if (sortBy === 'category') {
      result = [...result].sort((a, b) => a.category.localeCompare(b.category));
    }

    return result;
  }, [data, categoryFilter, searchTerm, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Vault Entries</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredEntries.length} entries
          </p>
        </div>
        <VaultCreateDialog />
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder="Search entries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setSearchTerm('')}
            >
              ×
            </Button>
          )}
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Category filter"
          className="flex h-9 w-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All</option>
          {VAULT_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'label' | 'category')}
          aria-label="Sort by"
          className="flex h-9 w-[180px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="date">Date</option>
          <option value="label">Label</option>
          <option value="category">Category</option>
        </select>
      </div>

      {/* List Content */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse" data-testid="skeleton">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded w-full mb-2"></div>
                <div className="h-4 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-destructive mb-4">Failed to load vault entries</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {!isLoading && !error && filteredEntries.length === 0 && !searchTerm && !categoryFilter && (
        <div className="text-center py-12 text-muted-foreground" data-testid="empty-state">
          <p>No vault entries yet. Create your first entry!</p>
        </div>
      )}

      {!isLoading && !error && filteredEntries.length === 0 && (searchTerm || categoryFilter) && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No entries match your filters</p>
        </div>
      )}

      {!isLoading && !error && filteredEntries.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map((entry) => (
            <Card
              key={entry.id}
              onClick={() => setSelectedEntry(entry.id)}
              className="cursor-pointer hover:shadow-md transition-shadow"
              role="article"
              data-testid="vault-entry"
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{entry.label}</CardTitle>
                  <Badge>{entry.category}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {entry.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {entry.description}
                  </p>
                )}
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Created: {formatDate(entry.createdAt)}
                </p>
                {isExpired(entry.expiresAt) && (
                  <Badge variant="destructive" className="mt-2">
                    Expired
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Dialog */}
      {selectedEntry && (
        <VaultViewDialog
          entryId={selectedEntry}
          open={!!selectedEntry}
          onOpenChange={(open) => !open && setSelectedEntry(null)}
          onEditClick={(id) => {
            setSelectedEntry(null); // Close view dialog
            setEditingEntry(id); // Open edit dialog
            onEntryClick?.(id);
          }}
        />
      )}

      {/* Edit Dialog */}
      {editingEntry && (
        <VaultEditDialog
          entryId={editingEntry}
          open={!!editingEntry}
          onOpenChange={(open) => !open && setEditingEntry(null)}
        />
      )}
    </div>
  );
}
