import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultViewDialog } from '../vault-view-dialog';
import { createMockQuery, createMockMutation } from '@/test/utils';
import { waitForToast, flushPromises } from '@/test/utils';

// Mock hooks
vi.mock('@/lib/hooks/useVault', () => ({
  useVaultEntry: vi.fn(),
  useDeleteVault: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useVaultEntry, useDeleteVault } from '@/lib/hooks/useVault';
import { useToast } from '@/lib/hooks/use-toast';

const mockEntry = {
  id: 'vault-123',
  userId: 'user-123',
  label: 'Medical Records',
  description: 'My health information',
  category: 'health' as const,
  dataType: 'json' as const,
  data: { bloodType: 'A+', allergies: ['peanuts'] },
  tags: ['medical', 'important'],
  schemaType: 'MedicalRecord',
  schemaVersion: '1.0',
  expiresAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

const mockExpiredEntry = {
  ...mockEntry,
  id: 'vault-expired',
  expiresAt: new Date('2023-12-31'),
};

describe('VaultViewDialog', () => {
  let mockDeleteMutation: ReturnType<typeof createMockMutation>;
  const mockToast = vi.fn();
  let onSuccessHook: () => void;
  let onErrorHook: (error: Error) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock useVaultEntry with default success state
    vi.mocked(useVaultEntry).mockReturnValue(createMockQuery(mockEntry));

    // Setup hook-level callbacks for delete mutation
    onSuccessHook = () => mockToast({
      title: 'Success',
      description: 'Vault entry deleted successfully'
    });
    onErrorHook = (error) => mockToast({
      variant: 'destructive',
      title: 'Error',
      description: error.message
    });

    // Mock useDeleteVault with hook-level callbacks
    mockDeleteMutation = createMockMutation({
      onSuccessHook,
      onErrorHook,
    });
    vi.mocked(useDeleteVault).mockReturnValue(mockDeleteMutation);

    // Mock useToast
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
    } as any);
  });

  // Rendering Tests (9 tests)
  describe('Rendering', () => {
    it('renders with entry data loaded', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('heading', { name: 'Medical Records' })).toBeInTheDocument();
      expect(screen.getByText('My health information')).toBeInTheDocument();
    });

    it('displays dialog title with entry label', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('heading', { name: /medical records/i })).toBeInTheDocument();
    });

    it('shows loading state while fetching entry', () => {
      vi.mocked(useVaultEntry).mockReturnValue(
        createMockQuery(null, {
          isLoading: true,
          isSuccess: false,
        })
      );

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays label field (read-only)', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      // Check the label heading
      expect(screen.getByText(/^label$/i)).toBeInTheDocument();
      // Check the value (use getAllByText since heading also contains this text)
      expect(screen.getAllByText('Medical Records').length).toBeGreaterThan(0);
    });

    it('displays category badge with color coding', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      // Get all health text elements and verify at least one exists as a badge
      const healthBadges = screen.getAllByText(/^health$/i);
      expect(healthBadges.length).toBeGreaterThan(0);
      // Check it's a div (Badge component renders as div by default)
      expect(healthBadges[0].tagName).toBe('DIV');
      // Check it has badge-like classes (rounded, padding, etc.)
      expect(healthBadges[0].className).toContain('rounded');
    });

    it('displays formatted data JSON', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/bloodType/i)).toBeInTheDocument();
      expect(screen.getByText(/A\+/)).toBeInTheDocument();
      expect(screen.getByText(/peanuts/i)).toBeInTheDocument();
    });

    it('displays tags as badges', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('medical')).toBeInTheDocument();
      expect(screen.getByText('important')).toBeInTheDocument();
    });

    it('displays creation and update timestamps', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/created/i)).toBeInTheDocument();
      expect(screen.getByText(/updated/i)).toBeInTheDocument();
    });

    it('displays optional fields if present', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('My health information')).toBeInTheDocument();
      expect(screen.getByText('MedicalRecord')).toBeInTheDocument();
    });
  });

  // Data Display Tests (6 tests)
  describe('Data Display', () => {
    it('formats JSON data with proper indentation', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataDisplay = screen.getByText(/bloodType/i).closest('pre, code, div');
      expect(dataDisplay).toBeInTheDocument();
    });

    it('displays encrypted metadata', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/data type/i)).toBeInTheDocument();
      expect(screen.getByText(/json/i)).toBeInTheDocument();
    });

    it('shows category with correct icon', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categorySection = screen.getByText(/^category$/i).closest('div');
      expect(categorySection).toBeInTheDocument();
      const healthBadges = screen.getAllByText(/^health$/i);
      expect(healthBadges.length).toBeGreaterThan(0);
    });

    it('displays expiration date if set', () => {
      vi.mocked(useVaultEntry).mockReturnValue(
        createMockQuery({ ...mockEntry, expiresAt: new Date('2025-12-31') })
      );

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/expires/i)).toBeInTheDocument();
    });

    it('shows "no expiration" if expiresAt is null', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/no expiration|never expires/i)).toBeInTheDocument();
    });

    it('highlights expired entries', () => {
      vi.mocked(useVaultEntry).mockReturnValue(createMockQuery(mockExpiredEntry));

      render(<VaultViewDialog entryId="vault-expired" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/expired/i)).toBeInTheDocument();
    });
  });

  // Action Button Tests (5 tests)
  describe('Action Buttons', () => {
    it('renders Edit button', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });

    it('renders Delete button', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('Edit button opens VaultEditDialog', async () => {
      const user = userEvent.setup();
      const mockOnEditClick = vi.fn();

      render(
        <VaultViewDialog
          entryId="vault-123"
          open={true}
          onOpenChange={vi.fn()}
          onEditClick={mockOnEditClick}
        />
      );

      await user.click(screen.getByRole('button', { name: /edit/i }));

      expect(mockOnEditClick).toHaveBeenCalled();
    });

    it('Delete button shows confirmation dialog', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('Close button closes the dialog', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockOnOpenChange = vi.fn();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      // Get all close buttons and click the first one (in the footer)
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      await user.click(closeButtons[0]);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Delete Confirmation Tests (6 tests)
  describe('Delete Confirmation', () => {
    it('shows confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to appear
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    });

    it('confirmation dialog displays entry label', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open and check its content
      const alertDialog = await screen.findByRole('alertdialog');
      expect(within(alertDialog).getByText(/medical records/i)).toBeInTheDocument();
    });

    it('confirmation has "Cancel" and "Delete" buttons', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open
      const alertDialog = await screen.findByRole('alertdialog');

      expect(within(alertDialog).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
      expect(within(alertDialog).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    it('canceling delete closes confirmation dialog', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('confirming delete calls useDeleteVault mutation', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open
      const alertDialog = await screen.findByRole('alertdialog');

      // Click the Delete button within the AlertDialog
      const deleteBtn = within(alertDialog).getByRole('button', { name: /^delete$/i });
      await user.click(deleteBtn);

      // Wait for mutation to be called
      await flushPromises();

      expect(mockDeleteMutation.mutate).toHaveBeenCalledWith(
        'vault-123',
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
    });

    it('shows success toast after deletion', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open
      const alertDialog = await screen.findByRole('alertdialog');

      // Click the Delete button within the AlertDialog
      const deleteBtn = within(alertDialog).getByRole('button', { name: /^delete$/i });
      await user.click(deleteBtn);

      // Wait for toast to be called with success message
      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/success/i),
        })
      );
    });
  });

  // Error Handling Tests (2 tests)
  describe('Error Handling', () => {
    it('shows error state if entry fetch fails', () => {
      vi.mocked(useVaultEntry).mockReturnValue(
        createMockQuery(null, {
          isError: true,
          isSuccess: false,
          error: new Error('Failed to fetch entry'),
        })
      );

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('shows error toast if delete fails', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      // Create error-only mutation that doesn't call success hook
      const errorOnlyMutation = createMockMutation({
        onSuccessHook: () => {}, // No-op to prevent success toast
        onErrorHook,
      });
      // Override mutate to only call error callback
      errorOnlyMutation.mutate = vi.fn((variables, options) => {
        setTimeout(() => {
          const error = new Error('Delete failed');
          onErrorHook(error);
          options?.onError?.(error);
        }, 0);
      }) as any;
      vi.mocked(useDeleteVault).mockReturnValue(errorOnlyMutation);

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open
      const alertDialog = await screen.findByRole('alertdialog');

      // Click the Delete button within the AlertDialog
      const deleteBtn = within(alertDialog).getByRole('button', { name: /^delete$/i });
      await user.click(deleteBtn);

      // Wait for error toast
      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });
  });

  // Additional Tests
  describe('Additional Features', () => {
    it('shows loading state during delete', () => {
      const pendingMutation = createMockMutation({
        onSuccessHook,
        onErrorHook,
      });
      pendingMutation.isPending = true;
      vi.mocked(useDeleteVault).mockReturnValue(pendingMutation);

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const deleteButton = screen.getByRole('button', { name: /delet/i });
      expect(deleteButton).toBeDisabled();
    });

    it('closes dialog after successful deletion', async () => {
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const mockOnOpenChange = vi.fn();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for AlertDialog to open
      const alertDialog = await screen.findByRole('alertdialog');

      // Click the Delete button within the AlertDialog
      const deleteBtn = within(alertDialog).getByRole('button', { name: /^delete$/i });
      await user.click(deleteBtn);

      // Wait for mutation to complete
      await waitForToast(mockToast);
      await flushPromises();

      // Dialog should close after successful deletion
      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
