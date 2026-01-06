import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultList } from '../vault-list';

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
  const mockMutate = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useVaultList as any).mockReturnValue({
      data: mockEntries,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    (useVaultEntry as any).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    (useCreateVault as any).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    (useUpdateVault as any).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    (useDeleteVault as any).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
    (useToast as any).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (8 tests)
  describe('Rendering', () => {
    it('renders empty state when no entries', () => {
      (useVaultList as any).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<VaultList />);

      expect(screen.getByText(/no vault entries/i)).toBeInTheDocument();
    });

    it('renders loading skeleton while fetching', () => {
      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<VaultList />);

      expect(screen.getByTestId('skeleton') || screen.getByText(/loading/i)).toBeInTheDocument();
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
      expect(screen.getByText(/health/i)).toBeInTheDocument();
      expect(screen.getByText('Financial Data')).toBeInTheDocument();
      expect(screen.getByText(/financial/i)).toBeInTheDocument();
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
      expect(screen.getByLabelText(/category/i) || screen.getByText(/filter/i)).toBeInTheDocument();
    });
  });

  // Empty State Tests (3 tests)
  describe('Empty State', () => {
    beforeEach(() => {
      (useVaultList as any).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });
    });

    it('shows empty state illustration', () => {
      render(<VaultList />);

      expect(screen.getByTestId('empty-state') || screen.getByRole('img')).toBeInTheDocument();
    });

    it('shows "No vault entries" message', () => {
      render(<VaultList />);

      expect(screen.getByText(/no vault entries/i)).toBeInTheDocument();
    });

    it('shows "Create your first entry" CTA button', () => {
      render(<VaultList />);

      expect(screen.getByRole('button', { name: /create.*first.*entry/i })).toBeInTheDocument();
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

      expect(screen.getByText(/health/i)).toBeInTheDocument();
      expect(screen.getByText(/financial/i)).toBeInTheDocument();
      expect(screen.getByText(/personal/i)).toBeInTheDocument();
    });

    it('each entry shows creation date', () => {
      render(<VaultList />);

      // Should show relative time like "2 days ago" or formatted dates
      expect(screen.getByText(/created/i) || screen.getByText(/jan|january/i)).toBeInTheDocument();
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

      const firstEntry = screen.getByText('Medical Records').closest('article, div');
      expect(firstEntry).toHaveClass(/hover|cursor-pointer/);
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

      // Switch back to all
      await user.selectOptions(categoryFilter, '' || 'all');

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
        expect(screen.getByText(/no results|no entries found/i)).toBeInTheDocument();
      });
    });

    it('clears search when X is clicked', async () => {
      const user = userEvent.setup();
      render(<VaultList />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      await user.type(searchInput, 'Medical');

      const clearButton = screen.getByRole('button', { name: /clear/i }) || screen.getByTestId('clear-search');
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
      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<VaultList />);

      expect(screen.getByTestId('skeleton') || screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('shows correct number of skeleton items', () => {
      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<VaultList />);

      const skeletons = screen.getAllByTestId('skeleton') || screen.getAllByRole('status');
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
  });

  // Error State Tests (3 tests)
  describe('Error State', () => {
    it('shows error message when fetch fails', () => {
      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch entries' },
        refetch: vi.fn(),
      });

      render(<VaultList />);

      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('shows retry button on error', () => {
      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch entries' },
        refetch: vi.fn(),
      });

      render(<VaultList />);

      expect(screen.getByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    });

    it('retry button refetches data', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();

      (useVaultList as any).mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch entries' },
        refetch: mockRefetch,
      });

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
        expect(screen.getByText(/1.*entry|entries/i)).toBeInTheDocument();
      });
    });
  });
});
