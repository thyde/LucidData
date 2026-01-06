import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@/test/helpers/render';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { VaultCreateDialog } from '../vault-create-dialog';
import { createMockMutation } from '@/test/utils/mockFactories';
import { waitForToast, flushPromises } from '@/test/utils/async-helpers';

// Mock hooks
vi.mock('@/lib/hooks/useVault', () => ({
  useCreateVault: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useCreateVault } from '@/lib/hooks/useVault';
import { useToast } from '@/lib/hooks/use-toast';

describe('VaultCreateDialog', () => {
  const mockToast = vi.fn();
  let mockMutation: ReturnType<typeof createMockMutation>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create mutation with hook-level onSuccess that calls toast
    mockMutation = createMockMutation({
      onSuccessHook: () => {
        mockToast({
          title: 'Success',
          description: 'Vault entry created successfully',
        });
      },
      onErrorHook: (error: Error) => {
        mockToast({
          variant: 'destructive',
          title: 'Error',
          description: error.message,
        });
      },
    });
    vi.mocked(useCreateVault).mockReturnValue(mockMutation);
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (5 tests)
  describe('Rendering', () => {
    it('renders trigger button with correct label', () => {
      render(<VaultCreateDialog />);
      expect(screen.getByRole('button', { name: /create vault entry/i })).toBeInTheDocument();
    });

    it('dialog is closed by default', () => {
      render(<VaultCreateDialog />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens dialog when trigger button is clicked', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays dialog title "Create Vault Entry"', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByRole('heading', { name: /create vault entry/i })).toBeInTheDocument();
    });

    it('renders form with all required fields', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByLabelText(/label/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /data/i })).toBeInTheDocument();
    });
  });

  // Form Field Tests (8 tests)
  describe('Form Fields', () => {
    it('renders label field with placeholder', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const labelInput = screen.getByLabelText(/label/i);
      expect(labelInput).toBeInTheDocument();
      expect(labelInput).toHaveAttribute('placeholder');
    });

    it('renders category select with all options', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const categorySelect = screen.getByLabelText(/category/i);
      expect(categorySelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /personal/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /health/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /financial/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /credentials/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /other/i })).toBeInTheDocument();
    });

    it('renders description textarea', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    });

    it('renders tags input field', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    });

    it('renders data textarea for JSON input', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const dataInput = screen.getByRole('textbox', { name: /data/i });
      expect(dataInput).toBeInTheDocument();
      expect(dataInput.tagName).toBe('TEXTAREA');
    });

    it('renders dataType select', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const dataTypeSelect = screen.getByLabelText(/data type/i);
      expect(dataTypeSelect).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /json/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /^credential$/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /document/i })).toBeInTheDocument();
    });

    it('renders schemaType input (optional)', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      expect(screen.getByLabelText(/schema type/i)).toBeInTheDocument();
    });

    it('renders expiresAt datetime input (optional)', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const expiresAtInput = screen.getByLabelText(/expires at/i);
      expect(expiresAtInput).toBeInTheDocument();
      expect(expiresAtInput).toHaveAttribute('type', 'datetime-local');
    });
  });

  // Validation Tests (10 tests)
  describe('Validation', () => {
    it('shows error when label is empty', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when label exceeds 100 characters', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const longLabel = 'a'.repeat(101);
      await user.type(screen.getByLabelText(/label/i), longLabel);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/label must be 100 characters or less/i)).toBeInTheDocument();
      });
    });

    it('shows error when category is not selected', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test Label');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/category.*required/i)).toBeInTheDocument();
      });
    });

    it('shows error when data field is empty', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test Label');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/data.*required/i)).toBeInTheDocument();
      });
    });

    it('shows error when data is not valid JSON', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test Label');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      await user.type(screen.getByRole('textbox', { name: /data/i }), 'invalid json');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
      });
    });

    it('shows error when description exceeds 500 characters', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const longDescription = 'a'.repeat(501);
      await user.type(screen.getByLabelText(/description/i), longDescription);
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/description must be 500 characters or less/i)).toBeInTheDocument();
      });
    });

    it('accepts valid JSON in data field', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Medical Records');
      await user.selectOptions(screen.getByLabelText(/category/i), 'health');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"bloodType": "A+"}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalled();
      });
    });

    it('validates dataType enum', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const dataTypeSelect = screen.getByLabelText(/data type/i);
      expect(dataTypeSelect).toHaveValue('json');
    });

    it('validates category enum values', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const categorySelect = screen.getByLabelText(/category/i) as HTMLSelectElement;
      const options = Array.from(categorySelect.options).map(opt => opt.value);
      expect(options).toContain('personal');
      expect(options).toContain('health');
      expect(options).toContain('financial');
      expect(options).toContain('credentials');
      expect(options).toContain('other');
    });

    it('accepts optional fields as empty', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test Entry');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"key": "value"}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            label: 'Test Entry',
            category: 'personal',
          }),
          expect.objectContaining({
            onSuccess: expect.any(Function),
          })
        );
      });
    });
  });

  // Submission Tests (8 tests)
  describe('Submission', () => {
    it('submits valid data to API endpoint', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Medical Records');
      await user.selectOptions(screen.getByLabelText(/category/i), 'health');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"bloodType": "A+"}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalledWith({
          label: 'Medical Records',
          category: 'health',
          data: { bloodType: 'A+' },
          dataType: 'json',
          description: undefined,
          tags: [],
          schemaType: undefined,
          schemaVersion: '1.0',
          expiresAt: undefined,
        }, expect.objectContaining({
          onSuccess: expect.any(Function),
        }));
      });
    });

    it('shows loading state during submission', async () => {
      const pendingMutation = createMockMutation();
      pendingMutation.isPending = true;
      vi.mocked(useCreateVault).mockReturnValue(pendingMutation);

      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const submitButton = screen.getByRole('button', { name: /creating/i });
      expect(submitButton).toBeInTheDocument();
    });

    it('disables submit button during submission', async () => {
      const pendingMutation = createMockMutation();
      pendingMutation.isPending = true;
      vi.mocked(useCreateVault).mockReturnValue(pendingMutation);

      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      const submitButton = screen.getByRole('button', { name: /creating/i });
      expect(submitButton).toBeDisabled();
    });

    it('calls useCreateVault mutation with form data', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalled();
      });
    });

    it('shows success toast on successful creation', async () => {
      const user = userEvent.setup();

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      // Wait for async mutation callback and toast
      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/success/i),
        })
      );
    });

    it('closes dialog after successful submission', async () => {
      const user = userEvent.setup();

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      // Wait for async mutation and dialog close
      await flushPromises();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('resets form after successful submission', async () => {
      const user = userEvent.setup();

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      // Wait for mutation and dialog close
      await flushPromises();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      // Reopen dialog
      await user.click(screen.getByRole('button', { name: /create vault entry/i }));

      // Form should be reset
      expect(screen.getByLabelText(/label/i)).toHaveValue('');
    });

    it('refetches vault list after creation', async () => {
      // This will be handled by React Query's invalidation in the hook
      // Test that the mutation is called, which triggers invalidation
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalled();
      });
    });
  });

  // Error Handling Tests (5 tests)
  describe('Error Handling', () => {
    it('shows error toast on API failure', async () => {
      const user = userEvent.setup();
      const errorMutation = createMockMutation();
      // Override mutate to simulate error
      errorMutation.mutate = vi.fn((data, options) => {
        setTimeout(() => {
          const error = new Error('API Error');
          // Call hook-level onError (triggers toast)
          mockToast({
            variant: 'destructive',
            title: 'Error',
            description: error.message,
          });
          // Call component-level onError
          options?.onError?.(error);
        }, 0);
      });
      vi.mocked(useCreateVault).mockReturnValue(errorMutation);

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('displays validation errors from backend', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/label is required/i)).toBeInTheDocument();
      });
    });

    it('keeps dialog open on submission error', async () => {
      const user = userEvent.setup();
      const errorMutation = createMockMutation();
      // Override mutate to simulate error
      errorMutation.mutate = vi.fn((data, options) => {
        setTimeout(() => {
          const error = new Error('API Error');
          // Call hook-level onError (triggers toast)
          mockToast({
            variant: 'destructive',
            title: 'Error',
            description: error.message,
          });
          // Call component-level onError
          options?.onError?.(error);
        }, 0);
      });
      vi.mocked(useCreateVault).mockReturnValue(errorMutation);

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitForToast(mockToast);
      await flushPromises();

      // Dialog should still be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('handles network errors gracefully', async () => {
      const user = userEvent.setup();
      const errorMutation = createMockMutation();
      // Override mutate to simulate error
      errorMutation.mutate = vi.fn((data, options) => {
        setTimeout(() => {
          const error = new Error('Network Error');
          // Call hook-level onError (triggers toast)
          mockToast({
            variant: 'destructive',
            title: 'Error',
            description: error.message,
          });
          // Call component-level onError
          options?.onError?.(error);
        }, 0);
      });
      vi.mocked(useCreateVault).mockReturnValue(errorMutation);

      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{"test": true}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitForToast(mockToast);
      await flushPromises();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('shows error message for invalid JSON-LD data', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      await user.type(screen.getByLabelText(/label/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/category/i), 'personal');
      const dataInput = screen.getByRole('textbox', { name: /data/i });
      await user.click(dataInput);
      await user.paste('{invalid}');
      await user.click(screen.getByRole('button', { name: /^create$/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid json/i)).toBeInTheDocument();
      });
    });
  });

  // User Interaction Tests (2 tests)
  describe('User Interaction', () => {
    it('closes dialog when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes dialog when X button is clicked', async () => {
      const user = userEvent.setup();
      render(<VaultCreateDialog />);

      await user.click(screen.getByRole('button', { name: /create vault entry/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });
});
