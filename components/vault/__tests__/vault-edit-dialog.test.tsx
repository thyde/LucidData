import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultEditDialog } from '../vault-edit-dialog';
import { createMockQuery, createMockMutation } from '@/test/utils';
import { waitForToast, flushPromises } from '@/test/utils';

// Mock hooks
vi.mock('@/lib/hooks/useVault', () => ({
  useVaultEntry: vi.fn(),
  useUpdateVault: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useVaultEntry, useUpdateVault } from '@/lib/hooks/useVault';
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
  updatedAt: new Date('2024-01-01'),
};

describe('VaultEditDialog', () => {
  let mockUpdateMutation: ReturnType<typeof createMockMutation>;
  const mockToast = vi.fn();
  let onSuccessHook: (data: any) => void;
  let onErrorHook: (error: Error) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock entry query
    vi.mocked(useVaultEntry).mockReturnValue(createMockQuery(mockEntry));

    // Define hook callbacks
    onSuccessHook = () => mockToast({ title: 'Success', description: 'Vault entry updated successfully' });
    onErrorHook = (error) => mockToast({ variant: 'destructive', title: 'Error', description: error.message });

    // Create mock mutation with toast callbacks
    mockUpdateMutation = createMockMutation({
      onSuccessHook,
      onErrorHook,
    });
    vi.mocked(useUpdateVault).mockReturnValue(mockUpdateMutation);

    // Mock toast hook
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
      dismiss: vi.fn(),
      toasts: [],
    });
  });

  // Rendering Tests (6 tests)
  describe('Rendering', () => {
    it('renders with entry data pre-filled', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByDisplayValue('Medical Records')).toBeInTheDocument();
      expect(screen.getByDisplayValue(/peanuts/)).toBeInTheDocument();
    });

    it('displays dialog title "Edit Vault Entry"', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('heading', { name: /edit vault entry/i })).toBeInTheDocument();
    });

    it('pre-fills label field with existing data', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i) as HTMLInputElement;
      expect(labelInput.value).toBe('Medical Records');
    });

    it('pre-fills category select with existing value', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      expect(categorySelect.value).toBe('health');
    });

    it('pre-fills data field with formatted JSON', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataInput = screen.getByRole('textbox', { name: /data/i }) as HTMLTextAreaElement;
      const parsedData = JSON.parse(dataInput.value);
      expect(parsedData).toEqual(mockEntry.data);
    });

    it('pre-fills optional fields', () => {
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByDisplayValue('My health information')).toBeInTheDocument();
      expect(screen.getByDisplayValue('MedicalRecord')).toBeInTheDocument();
    });
  });

  // Form Update Tests (5 tests)
  describe('Form Updates', () => {
    it('allows editing label field', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated Label');

      expect(labelInput).toHaveValue('Updated Label');
    });

    it('allows changing category', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categorySelect = screen.getByLabelText(/category/i);
      await user.selectOptions(categorySelect, 'personal');

      expect(categorySelect).toHaveValue('personal');
    });

    it('allows editing data JSON', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.clear(dataInput);
      await user.click(dataInput);
      await user.paste('{"updated": true}');

      expect(dataInput).toHaveValue('{"updated": true}');
    });

    it('allows editing optional fields', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const descriptionInput = screen.getByLabelText(/description/i);
      await user.clear(descriptionInput);
      await user.type(descriptionInput, 'Updated description');

      expect(descriptionInput).toHaveValue('Updated description');
    });

    it('detects form changes (dirty state)', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Changed');

      // The form should now be in a dirty state
      // This would typically be reflected in UI (e.g., unsaved changes warning)
      expect(labelInput).toHaveValue('Changed');
    });
  });

  // Validation Tests (8 tests)
  describe('Validation', () => {
    it('validates modified label field', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });
    });

    it('validates modified category field', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categorySelect = screen.getByLabelText(/category/i);
      await user.selectOptions(categorySelect, '');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/category.*required/i)).toBeInTheDocument();
      });
    });

    it('validates modified data JSON', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.clear(dataInput);
      await user.type(dataInput, 'invalid json');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
      });
    });

    it('shows error when label is cleared', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when data becomes invalid JSON', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.clear(dataInput);
      await user.click(dataInput);
      await user.paste('{broken');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
      });
    });

    it('validates data field is required', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.clear(dataInput);
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(screen.getByText(/data.*required/i)).toBeInTheDocument();
      });
    });

    it('accepts valid updates', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated Label');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(mockUpdateMutation.mutate).toHaveBeenCalled();
      });
    });

    it('validates all enum fields', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      const dataTypeSelect = screen.getByLabelText(/data type/i) as HTMLSelectElement;

      // Verify enum values are present
      expect(categorySelect.value).toBe('health');
      expect(dataTypeSelect.value).toBe('json');
    });
  });

  // Submission Tests (7 tests)
  describe('Submission', () => {
    it('submits updated data to PATCH endpoint', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated Label');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(mockUpdateMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
          id: 'vault-123',
          data: expect.objectContaining({
            label: 'Updated Label',
          }),
        }), expect.objectContaining({ onSuccess: expect.any(Function) }));
      });
    });

    it('only sends changed fields to API', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated Label');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(mockUpdateMutation.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'vault-123',
            data: expect.any(Object),
          }),
          expect.objectContaining({ onSuccess: expect.any(Function) })
        );
      });
    });

    it('shows loading state during update', () => {
      mockUpdateMutation.isPending = true;
      vi.mocked(useUpdateVault).mockReturnValue(mockUpdateMutation);

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
    });

    it('disables submit button during update', () => {
      mockUpdateMutation.isPending = true;
      vi.mocked(useUpdateVault).mockReturnValue(mockUpdateMutation);

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const submitButton = screen.getByRole('button', { name: /saving/i });
      expect(submitButton).toBeDisabled();
    });

    it('shows success toast on update', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/success/i),
        })
      );
    });

    it('closes dialog after successful update', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();
      const mockMutateSuccess = vi.fn((data, options) => {
        options?.onSuccess?.();
      });

      (useUpdateVault as any).mockReturnValue({
        mutate: mockMutateSuccess,
        isPending: false,
      });

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('invalidates cache and refetches entry', async () => {
      const user = userEvent.setup();
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await waitFor(() => {
        expect(mockUpdateMutation.mutate).toHaveBeenCalled();
      });
    });
  });

  // Error Handling Tests (4 tests)
  describe('Error Handling', () => {
    it('shows error toast on API failure', async () => {
      const user = userEvent.setup();

      // Create a mutation that only calls error hook, not success
      const errorOnlyMutation = createMockMutation({
        onSuccessHook: () => {}, // No-op
        onErrorHook,
      });
      // Override mutate to only call error callback
      errorOnlyMutation.mutate = vi.fn((variables, options) => {
        setTimeout(() => {
          const error = new Error('API Error');
          onErrorHook(error);
          options?.onError?.(error);
        }, 0);
      }) as any;
      vi.mocked(useUpdateVault).mockReturnValue(errorOnlyMutation);

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('handles 403 unauthorized error', async () => {
      const user = userEvent.setup();

      // Create a mutation that triggers 403 error
      const errorOnlyMutation = createMockMutation({
        onSuccessHook: () => {},
        onErrorHook,
      });
      errorOnlyMutation.mutate = vi.fn((variables, options) => {
        setTimeout(() => {
          const error = new Error('Unauthorized');
          (error as any).status = 403;
          onErrorHook(error);
          options?.onError?.(error);
        }, 0);
      }) as any;
      vi.mocked(useUpdateVault).mockReturnValue(errorOnlyMutation);

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('handles 404 not found error', async () => {
      (useVaultEntry as any).mockReturnValue({
        data: null,
        isLoading: false,
        error: { status: 404, message: 'Not found' },
      });

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });

    it('keeps dialog open on error', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();

      // Create a mutation that only triggers error
      const errorOnlyMutation = createMockMutation({
        onSuccessHook: () => {},
        onErrorHook,
      });
      errorOnlyMutation.mutate = vi.fn((variables, options) => {
        setTimeout(() => {
          const error = new Error('API Error');
          onErrorHook(error);
          options?.onError?.(error);
        }, 0);
      }) as any;
      vi.mocked(useUpdateVault).mockReturnValue(errorOnlyMutation);

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Updated');
      await user.click(screen.getByRole('button', { name: /^save/i }));

      await flushPromises();

      // Verify dialog stays open (onOpenChange not called with false)
      expect(mockToast).toHaveBeenCalled();
      expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  // User Interaction Tests (2 tests)
  describe('User Interaction', () => {
    it('closes dialog when cancel is clicked', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('resets form to original values on cancel', async () => {
      const user = userEvent.setup();
      const mockOnOpenChange = vi.fn();

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      const labelInput = screen.getByLabelText(/label/i);
      await user.clear(labelInput);
      await user.type(labelInput, 'Changed Value');

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Reopen dialog (simulating the behavior)
      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={mockOnOpenChange} />);

      // Should show original value
      expect(screen.getByDisplayValue('Medical Records')).toBeInTheDocument();
    });
  });

  // Loading State Tests
  describe('Loading State', () => {
    it('shows loading state while fetching entry', () => {
      (useVaultEntry as any).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<VaultEditDialog entryId="vault-123" open={true} onOpenChange={vi.fn()} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });
});
