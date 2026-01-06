import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultViewDialog } from '../vault-view-dialog';

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
  const mockDeleteMutate = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useVaultEntry as any).mockReturnValue({
      data: mockEntry,
      isLoading: false,
      error: null,
    });
    (useDeleteVault as any).mockReturnValue({
      mutate: mockDeleteMutate,
      isPending: false,
    });
    (useToast as any).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (9 tests)
  describe('Rendering', () => {
    it('renders with entry data loaded', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText('Medical Records')).toBeInTheDocument();
      expect(screen.getByText('My health information')).toBeInTheDocument();
    });

    it('displays dialog title with entry label', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('heading', { name: /medical records/i })).toBeInTheDocument();
    });

    it('shows loading state while fetching entry', () => {
      (useVaultEntry as any).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('displays label field (read-only)', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/label/i)).toBeInTheDocument();
      expect(screen.getByText('Medical Records')).toBeInTheDocument();
    });

    it('displays category badge with color coding', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categoryBadge = screen.getByText(/health/i);
      expect(categoryBadge).toBeInTheDocument();
      expect(categoryBadge).toHaveClass(/badge/i);
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

      const categorySection = screen.getByText(/category/i).closest('div');
      expect(categorySection).toBeInTheDocument();
      expect(screen.getByText(/health/i)).toBeInTheDocument();
    });

    it('displays expiration date if set', () => {
      (useVaultEntry as any).mockReturnValue({
        data: { ...mockEntry, expiresAt: new Date('2025-12-31') },
        isLoading: false,
        error: null,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/expires/i)).toBeInTheDocument();
    });

    it('shows "no expiration" if expiresAt is null', () => {
      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/no expiration|never expires/i)).toBeInTheDocument();
    });

    it('highlights expired entries', () => {
      (useVaultEntry as any).mockReturnValue({
        data: mockExpiredEntry,
        isLoading: false,
        error: null,
      });

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
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it('Close button closes the dialog', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Delete Confirmation Tests (6 tests)
  describe('Delete Confirmation', () => {
    it('shows confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('confirmation dialog displays entry label', async () => {
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      expect(screen.getByText(/medical records/i)).toBeInTheDocument();
    });

    it('confirmation has "Cancel" and "Delete" buttons', async () => {
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));

      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    });

    it('canceling delete closes confirmation dialog', async () => {
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('confirming delete calls useDeleteVault mutation', async () => {
      const user = userEvent.setup();

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1]); // Confirmation button

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalledWith('vault-123');
      });
    });

    it('shows success toast after deletion', async () => {
      const user = userEvent.setup();
      const mockDeleteSuccess = vi.fn((id, options) => {
        options?.onSuccess?.();
      });

      (useDeleteVault as any).mockReturnValue({
        mutate: mockDeleteSuccess,
        isPending: false,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1]);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/success|deleted/i),
          })
        );
      });
    });
  });

  // Error Handling Tests (2 tests)
  describe('Error Handling', () => {
    it('shows error state if entry fetch fails', () => {
      (useVaultEntry as any).mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: 'Failed to fetch entry' },
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
    });

    it('shows error toast if delete fails', async () => {
      const user = userEvent.setup();
      const mockDeleteError = vi.fn((id, options) => {
        options?.onError?.(new Error('Delete failed'));
      });

      (useDeleteVault as any).mockReturnValue({
        mutate: mockDeleteError,
        isPending: false,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1]);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'destructive',
          })
        );
      });
    });
  });

  // Additional Tests
  describe('Additional Features', () => {
    it('shows loading state during delete', () => {
      (useDeleteVault as any).mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: true,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const deleteButton = screen.getByRole('button', { name: /delet/i });
      expect(deleteButton).toBeDisabled();
    });

    it('closes dialog after successful deletion', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();
      const mockDeleteSuccess = vi.fn((id, options) => {
        options?.onSuccess?.();
      });

      (useDeleteVault as any).mockReturnValue({
        mutate: mockDeleteSuccess,
        isPending: false,
      });

      render(<VaultViewDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      await user.click(screen.getByRole('button', { name: /delete/i }));
      await user.click(screen.getAllByRole('button', { name: /^delete$/i })[1]);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
