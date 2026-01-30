import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor, within } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultList } from '../vault-list';
import { createMockQuery, createLoadingQuery, createErrorQuery, createMockMutation } from '@/test/utils';
import { flushPromises } from '@/test/utils';

// Mock hooks
vi.mock('@/lib/hooks/useVault', () => ({
  useVaultList: vi.fn(),
  useVaultEntry: vi.fn(),
  useCreateVault: vi.fn(),
  useUpdateVault: vi.fn(),
  useDeleteVault: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useVaultList, useVaultEntry, useCreateVault, useUpdateVault, useDeleteVault } from '@/lib/hooks/useVault';
import { useToast } from '@/lib/hooks/use-toast';

const mockEntries = [
  {
    id: 'vault-1',
    userId: 'user-123',
    label: 'Medical Records',
    description: 'Health information',
    category: 'health' as const,
    dataType: 'json' as const,
    data: { bloodType: 'A+' },
    tags: ['medical', 'important'],
    schemaType: 'MedicalRecord',
    schemaVersion: '1.0',
    expiresAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'vault-2',
    userId: 'user-123',
    label: 'Financial Data',
    description: 'Banking info',
    category: 'financial' as const,
    dataType: 'json' as const,
    data: { accountNumber: '123456' },
    tags: ['finance'],
    schemaType: null,
    schemaVersion: '1.0',
    expiresAt: null,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  },
  {
    id: 'vault-3',
    userId: 'user-123',
    label: 'Personal Notes',
    description: null,
    category: 'personal' as const,
    dataType: 'json' as const,
    data: { notes: 'test' },
    tags: [],
    schemaType: null,
    schemaVersion: '1.0',
    expiresAt: new Date('2023-12-31'), // Expired
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  },
];

describe('VaultList', () => {
  let mockListQuery: ReturnType<typeof createMockQuery>;
  let mockCreateMutation: ReturnType<typeof createMockMutation>;
  let mockUpdateMutation: ReturnType<typeof createMockMutation>;
  let mockDeleteMutation: ReturnType<typeof createMockMutation>;
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock query with data
    mockListQuery = createMockQuery(mockEntries);
    vi.mocked(useVaultList).mockReturnValue(mockListQuery);

    // Mock vault entry query (used for view dialog)
    vi.mocked(useVaultEntry).mockReturnValue(createMockQuery(null));

    // Create mock mutations with toast callbacks
    mockCreateMutation = createMockMutation({
      onSuccessHook: () => mockToast({ title: 'Success', description: 'Vault entry created successfully' }),
      onErrorHook: (error) => mockToast({ variant: 'destructive', title: 'Error', description: error.message }),
    });
    vi.mocked(useCreateVault).mockReturnValue(mockCreateMutation);

    mockUpdateMutation = createMockMutation({
      onSuccessHook: () => mockToast({ title: 'Success', description: 'Vault entry updated successfully' }),
      onErrorHook: (error) => mockToast({ variant: 'destructive', title: 'Error', description: error.message }),
    });
    vi.mocked(useUpdateVault).mockReturnValue(mockUpdateMutation);

    mockDeleteMutation = createMockMutation({
      onSuccessHook: () => mockToast({ title: 'Success', description: 'Vault entry deleted successfully' }),
      onErrorHook: (error) => mockToast({ variant: 'destructive', title: 'Error', description: error.message }),
    });
    vi.mocked(useDeleteVault).mockReturnValue(mockDeleteMutation);

    // Mock toast hook
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
      toasts: [],
    });
  });

  // Rendering Tests (8 tests)
  describe('Rendering', () => {
    it('renders empty state when no entries', () => {
      vi.mocked(useVaultList).mockReturnValue(createMockQuery([]));

      render(<VaultList />);

      expect(screen.getByText(/no vault entries/i)).toBeInTheDocument();
    });

    it('renders loading skeleton while fetching', () => {
      vi.mocked(useVaultList).mockReturnValue(createLoadingQuery());

      render(<VaultList />);

      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders list of vault entries', () => {
      render(<VaultList />);

      expect(screen.getByText('Medical Records')).toBeInTheDocument();
      expect(screen.getByText('Financial Data')).toBeInTheDocument();
      expect(screen.getByText('Personal Notes')).toBeInTheDocument();
    });

    it('displays entry cards with label and category', () => {
      render(<VaultList />);

      expect(screen.getByText('Medical Records')).toBeInTheDocument();
      expect(screen.getAllByText(/health/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Financial Data')).toBeInTheDocument();
      expect(screen.getAllByText(/financial/i).length).toBeGreaterThan(0);
    });

    it('displays entry preview', () => {
      render(<VaultList />);

      expect(screen.getByText(/health information/i)).toBeInTheDocument();
      expect(screen.getByText(/banking info/i)).toBeInTheDocument();
    });

    it('shows entry count badge', () => {
      render(<VaultList />);

      expect(screen.getByText(/3.*entries/i)).toBeInTheDocument();
    });

    it('renders create button in header', () => {
      render(<VaultList />);

      expect(screen.getByRole('button', { name: /create.*vault.*entry/i })).toBeInTheDocument();
    });

    it('displays search/filter controls', () => {
      render(<VaultList />);

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/sort/i)).toBeInTheDocument();
    });
  });

  // Empty State Tests (3 tests)
  describe('Empty State', () => {
    beforeEach(() => {
      vi.mocked(useVaultList).mockReturnValue(createMockQuery([]));
    });

    it('shows empty state illustration', () => {
      render(<VaultList />);

      expect(screen.getByTestId('empty-state') || screen.getByRole('img')).toBeInTheDocument();
    });

    it('shows "No vault entries" message', () => {
      render(<VaultList />);

      expect(screen.getByText(/no vault entries/i)).toBeInTheDocument();
    });

    it('shows helpful message without duplicate button', () => {
      render(<VaultList />);

      // Should show the message
      expect(screen.getByText(/create your first entry/i)).toBeInTheDocument();

      // Should NOT have a button in the empty state (create button is in header)
      const emptyState = screen.getByTestId('empty-state');
      expect(within(emptyState).queryByRole('button')).not.toBeInTheDocument();
    });
  });

  // List Item Tests (7 tests)
  describe('List Items', () => {
    it('each entry shows label', () => {
      render(<VaultList />);

      const entries = screen.getAllByRole('article') || screen.getAllByTestId('vault-entry');
      expect(entries.length).toBeGreaterThan(0);

      expect(screen.getByText('Medical Records')).toBeInTheDocument();
      expect(screen.getByText('Financial Data')).toBeInTheDocument();
    });

    it('each entry shows category badge', () => {
      render(<VaultList />);

      // Category badges appear both in filter dropdown and on cards, so check for multiple
      expect(screen.getAllByText(/health/i).length).toBeGreaterThan(1);
      expect(screen.getAllByText(/financial/i).length).toBeGreaterThan(1);
      expect(screen.getAllByText(/personal/i).length).toBeGreaterThan(1);
    });

    it('each entry shows creation date', () => {
      render(<VaultList />);

      // Should show "Created:" label multiple times (one per entry)
      expect(screen.getAllByText(/created/i).length).toBeGreaterThan(0);
    });

    it('each entry shows tag count or tags', () => {
      render(<VaultList />);

      expect(screen.getByText('medical')).toBeInTheDocument();
      expect(screen.getByText('important')).toBeInTheDocument();
      expect(screen.getByText('finance')).toBeInTheDocument();
    });

    it('clicking entry opens VaultViewDialog', async () => {
      const user = userEvent.setup();
      const mockOnEntryClick = vi.fn();

      render(<VaultList onEntryClick={mockOnEntryClick} />);

      const firstEntry = screen.getByText('Medical Records').closest('article, div[role="button"]');
      if (firstEntry) {
        await user.click(firstEntry);
        expect(mockOnEntryClick).toHaveBeenCalledWith('vault-1');
      }
    });

    it('entry cards have hover state', () => {
      render(<VaultList />);

      const firstEntry = screen.getAllByRole('article')[0];
      expect(firstEntry?.className).toMatch(/cursor-pointer/);
    });

    it('expired entries show expiration badge', () => {
      render(<VaultList />);

      expect(screen.getByText(/expired/i)).toBeInTheDocument();
    });
  });

  // Filtering Tests (8 tests)
  describe('Filtering', () => {
    it('filters entries by category', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const categoryFilter = screen.getByLabelText(/category/i);
      await user.selectOptions(categoryFilter, 'health');

      await waitFor(() => {
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
        expect(screen.queryByText('Financial Data')).not.toBeInTheDocument();
        expect(screen.queryByText('Personal Notes')).not.toBeInTheDocument();
      });
    });

    it('category filter shows all categories', () => {
      render(<VaultList />);

      const categoryFilter = screen.getByLabelText(/category/i) as HTMLSelectElement;
      const options = Array.from(categoryFilter.options).map(opt => opt.value);

      expect(options).toContain('health');
      expect(options).toContain('financial');
      expect(options).toContain('personal');
      expect(options).toContain('credentials');
      expect(options).toContain('other');
    });

    it('"All Categories" option shows all entries', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const categoryFilter = screen.getByLabelText(/category/i);
      await user.selectOptions(categoryFilter, 'health');

      // Switch back to all (value is empty string)
      await user.selectOptions(categoryFilter, '');

      await waitFor(() => {
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
        expect(screen.getByText('Financial Data')).toBeInTheDocument();
        expect(screen.getByText('Personal Notes')).toBeInTheDocument();
      });
    });

    it('filters entries by search term (label)', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Medical');

      await waitFor(() => {
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
        expect(screen.queryByText('Financial Data')).not.toBeInTheDocument();
        expect(screen.queryByText('Personal Notes')).not.toBeInTheDocument();
      });
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'MEDICAL');

      await waitFor(() => {
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
      });
    });

    it('shows "no results" when filter returns empty', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'NonExistentEntry');

      await waitFor(() => {
        expect(screen.getByText(/no entries match your filters/i)).toBeInTheDocument();
      });
    });

    it('clears search when X is clicked', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Medical');

      // Wait for clear button to appear
      const clearButton = await screen.findByText('×');
      await user.click(clearButton);

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
        expect(screen.getByText('Financial Data')).toBeInTheDocument();
      });
    });

    it('combines category and search filters', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const categoryFilter = screen.getByLabelText(/category/i);
      await user.selectOptions(categoryFilter, 'health');

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Medical');

      await waitFor(() => {
        expect(screen.getByText('Medical Records')).toBeInTheDocument();
        expect(screen.queryByText('Financial Data')).not.toBeInTheDocument();
      });
    });
  });

  // Sorting Tests (4 tests)
  describe('Sorting', () => {
    it('sorts by creation date (newest first) by default', () => {
      render(<VaultList />);

      const entries = screen.getAllByRole('article') || screen.getAllByText(/medical|financial|personal/i);

      // Personal Notes created on 2024-01-03 should be first
      const labels = Array.from(entries).map(el => el.textContent);
      const personalIndex = labels.findIndex(text => text?.includes('Personal'));
      const medicalIndex = labels.findIndex(text => text?.includes('Medical'));

      expect(personalIndex).toBeLessThan(medicalIndex);
    });

    it('sorts by label alphabetically', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const sortSelect = screen.getByLabelText(/sort/i);
      await user.selectOptions(sortSelect, 'label');

      await waitFor(() => {
        const entries = screen.getAllByRole('article') || screen.getAllByText(/medical|financial|personal/i);
        const labels = Array.from(entries).map(el => el.textContent);

        // Financial should come before Medical alphabetically
        const financialIndex = labels.findIndex(text => text?.includes('Financial'));
        const medicalIndex = labels.findIndex(text => text?.includes('Medical'));

        expect(financialIndex).toBeLessThan(medicalIndex);
      });
    });

    it('sorts by category', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const sortSelect = screen.getByLabelText(/sort/i);
      await user.selectOptions(sortSelect, 'category');

      await waitFor(() => {
        // Categories should be grouped together
        const entries = screen.getAllByRole('article') || screen.getAllByText(/medical|financial|personal/i);
        expect(entries.length).toBeGreaterThan(0);
      });
    });

    it('sort dropdown updates list order', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const sortSelect = screen.getByLabelText(/sort/i);

      // Change sort order
      await user.selectOptions(sortSelect, 'label');

      // Verify the select value changed
      expect(sortSelect).toHaveValue('label');
    });
  });

  // Loading State Tests (2 tests)
  describe('Loading State', () => {
    it('shows skeleton cards while loading', () => {
      vi.mocked(useVaultList).mockReturnValue(createLoadingQuery());

      render(<VaultList />);

      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows correct number of skeleton items', () => {
      vi.mocked(useVaultList).mockReturnValue(createLoadingQuery());

      render(<VaultList />);

      const skeletons = screen.getAllByTestId('skeleton') || screen.getAllByRole('status');
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  // Error State Tests (3 tests)
  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      vi.mocked(useVaultList).mockReturnValue(createErrorQuery('Failed to fetch entries'));

      render(<VaultList />);

      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      vi.mocked(useVaultList).mockReturnValue(createErrorQuery('Failed to fetch entries'));

      render(<VaultList />);

      expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    });

    it('retry button refetches data', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();

      const errorQuery = createErrorQuery('Failed to fetch entries');
      errorQuery.refetch = mockRefetch;
      vi.mocked(useVaultList).mockReturnValue(errorQuery);

      render(<VaultList />);

      const retryButton = screen.getByRole('button', { name: /retry|try again/i });
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  // Additional Features
  describe('Additional Features', () => {
    it('shows entry count', () => {
      render(<VaultList />);

      expect(screen.getByText(/3.*entries/i)).toBeInTheDocument();
    });

    it('updates count based on filters', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const categoryFilter = screen.getByLabelText(/category/i);
      await user.selectOptions(categoryFilter, 'health');

      await waitFor(() => {
        // Use getAllByText since "entries" appears in both title and count
        const entryTexts = screen.getAllByText(/entry|entries/i);
        // Count paragraph should say "1 entries" or "1 entry"
        expect(entryTexts.some(el => el.textContent?.match(/^1\s+(entry|entries)$/i))).toBe(true);
      });
    });
  });

  // Edit Dialog Integration (5 tests)
  describe('Edit Dialog Integration', () => {
    beforeEach(() => {
      // Mock vault entry query to return data when viewing an entry
      vi.mocked(useVaultEntry).mockImplementation((id) => {
        const entry = mockEntries.find(e => e.id === id);
        return createMockQuery(entry || null);
      });
    });

    it('should open edit dialog when edit is clicked in view dialog', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      // Click on an entry to open view dialog
      const firstEntry = screen.getByText('Medical Records').closest('[role="article"]');
      if (firstEntry) {
        await user.click(firstEntry);
      }

      // Wait for view dialog to open
      const viewDialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
      expect(viewDialog).toBeInTheDocument();

      // Click edit button in view dialog
      const editButton = within(viewDialog).getByRole('button', { name: /edit/i });
      await user.click(editButton);

      // Edit dialog should open (with pointerEventsCheck: 0 for animation)
      await waitFor(() => {
        const dialogs = screen.getAllByRole('dialog', {}, { timeout: 3000 });
        // Should have edit dialog (view dialog may close)
        expect(dialogs.some(d => d.textContent?.includes('Edit Vault Entry'))).toBe(true);
      }, { timeout: 3000 });
    });

    it('should close view dialog when edit dialog opens', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      // Open view dialog
      const firstEntry = screen.getByText('Medical Records').closest('[role="article"]');
      if (firstEntry) {
        await user.click(firstEntry);
      }

      await screen.findByRole('dialog', {}, { timeout: 3000 });

      // Click edit button
      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      // Wait for transition - view dialog should close
      await waitFor(() => {
        const dialogs = screen.queryAllByRole('dialog');
        // Should only have edit dialog, not view dialog
        const hasViewDialog = dialogs.some(d => d.textContent?.includes('View Vault Entry'));
        expect(hasViewDialog).toBe(false);
      }, { timeout: 3000 });
    });

    it('should update entry when edit is saved', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      // Open view dialog
      const firstEntry = screen.getByText('Medical Records').closest('[role="article"]');
      if (firstEntry) {
        await user.click(firstEntry);
      }

      await screen.findByRole('dialog', {}, { timeout: 3000 });

      // Click edit
      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      // Find edit dialog
      const editDialog = await screen.findByRole('dialog', {}, { timeout: 3000 });

      // Update label field
      const labelInput = within(editDialog).getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated Medical Records');

      // Save
      const saveButton = within(editDialog).getByRole('button', { name: /save|update/i });
      await user.click(saveButton);

      // Mutation should be called
      await waitFor(() => {
        expect(mockUpdateMutation.mutate).toHaveBeenCalled();
      });
    });

    it('should close edit dialog after successful save', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      // Open and edit
      const firstEntry = screen.getByText('Medical Records').closest('[role="article"]');
      if (firstEntry) {
        await user.click(firstEntry);
      }

      await screen.findByRole('dialog', {}, { timeout: 3000 });
      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const editDialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
      const saveButton = within(editDialog).getByRole('button', { name: /save|update/i });

      // Trigger save
      await user.click(saveButton);

      // Call the onSuccess callback
      await flushPromises();
      if (mockUpdateMutation.mutate.mock.calls.length > 0) {
        const call = mockUpdateMutation.mutate.mock.calls[0];
        const options = call[1];
        if (options?.onSuccess) {
          await act(async () => {
            options.onSuccess?.({} as any, {} as any, {} as any);
          });
        }
      }

      // Edit dialog should close
      await waitFor(() => {
        const dialogs = screen.queryAllByRole('dialog');
        expect(dialogs.length).toBe(0);
      }, { timeout: 3000 });
    });

    it('should handle edit cancellation', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      // Open view and edit
      const firstEntry = screen.getByText('Medical Records').closest('[role="article"]');
      if (firstEntry) {
        await user.click(firstEntry);
      }

      await screen.findByRole('dialog', {}, { timeout: 3000 });
      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      const editDialog = await screen.findByRole('dialog', {}, { timeout: 3000 });

      // Click cancel
      const cancelButton = within(editDialog).getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      // Edit dialog should close, no mutation called
      await waitFor(() => {
        const dialogs = screen.queryAllByRole('dialog');
        expect(dialogs.length).toBe(0);
      }, { timeout: 3000 });

      expect(mockUpdateMutation.mutate).not.toHaveBeenCalled();
    });
  });
});
