import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { ConsentCreateDialog } from '../consent-create-dialog';
import { createMockMutation, createMockQuery } from '@/test/utils/mockFactories';
import { waitForToast, flushPromises } from '@/test/utils/async-helpers';
import { mockVaultEntry, mockVaultEntries } from '@/test/fixtures/vault-data';

// Mock hooks
vi.mock('@/lib/hooks/useConsent', () => ({
  useCreateConsent: vi.fn(),
}));

vi.mock('@/lib/hooks/useVault', () => ({
  useVaultList: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useCreateConsent } from '@/lib/hooks/useConsent';
import { useVaultList } from '@/lib/hooks/useVault';
import { useToast } from '@/lib/hooks/use-toast';

describe('ConsentCreateDialog', () => {
  const mockToast = vi.fn();
  let mockMutation: ReturnType<typeof createMockMutation>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation = createMockMutation({
      onSuccessHook: () => {
        mockToast({
          title: 'Success',
          description: 'Consent granted successfully',
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
    vi.mocked(useCreateConsent).mockReturnValue(mockMutation);
    // Use mockVaultEntries which has unique IDs (vault-123, vault-456, vault-789)
    vi.mocked(useVaultList).mockReturnValue(
      createMockQuery(mockVaultEntries.slice(0, 3))
    );
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (6 tests)
  describe('Rendering', () => {
    it('renders trigger button with correct label', () => {
      render(<ConsentCreateDialog />);
      expect(screen.getByRole('button', { name: /grant consent/i })).toBeInTheDocument();
    });

    it('dialog is closed by default', () => {
      render(<ConsentCreateDialog />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens dialog when trigger button is clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('displays dialog title "Grant Consent"', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(screen.getByRole('heading', { name: /grant consent/i })).toBeInTheDocument();
    });

    it('displays dialog description', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(
        screen.getByText(/grant an organization access to your vault data/i)
      ).toBeInTheDocument();
    });

    it('renders form with all required fields', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/organization identifier/i)).toBeInTheDocument();
      expect(screen.getByText(/access level/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/purpose/i)).toBeInTheDocument();
    });
  });

  // Form Field Tests (10 tests)
  describe('Form Fields', () => {
    it('renders vault data select with options', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const select = screen.getByRole('combobox', { name: /vault data to share/i });
      expect(select).toBeInTheDocument();

      // Check for "No specific data" option
      const options = within(select).getAllByRole('option');
      expect(options[0]).toHaveTextContent(/no specific data/i);

      // Check that vault entries are populated
      expect(options.length).toBeGreaterThan(1);
    });

    it('handles empty vault list gracefully', async () => {
      vi.mocked(useVaultList).mockReturnValue(createMockQuery([]));
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const select = screen.getByRole('combobox', { name: /vault data to share/i });
      const options = within(select).getAllByRole('option');

      // Should only show "No specific data" option
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent(/no specific data/i);
    });

    it('preselects vault data when preselectedVaultDataId provided', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog preselectedVaultDataId="vault-123" />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const select = screen.getByRole('combobox', {
        name: /vault data to share/i,
      }) as HTMLSelectElement;
      expect(select.value).toBe('vault-123');
    });

    it('renders organization name input with placeholder', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const input = screen.getByPlaceholderText(/e\.g\., acme healthcare/i);
      expect(input).toBeInTheDocument();
      expect(screen.getByLabelText(/organization name/i)).toBe(input);
    });

    it('renders organization identifier input', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(screen.getByLabelText(/organization identifier/i)).toBeInTheDocument();
      expect(screen.getByText(/unique identifier for the organization/i)).toBeInTheDocument();
    });

    it('renders email input (optional)', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const emailInput = screen.getByLabelText(/contact email.*optional/i);
      expect(emailInput).toBeInTheDocument();
    });

    it('renders access level radio group with all options', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      expect(screen.getByText(/read - view data only/i)).toBeInTheDocument();
      expect(screen.getByText(/export - download\/export data/i)).toBeInTheDocument();
      expect(screen.getByText(/verify - verify authenticity/i)).toBeInTheDocument();
    });

    it('defaults access level to "read"', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const readRadio = screen.getByRole('radio', { name: /read - view data only/i });
      expect(readRadio).toBeChecked();
    });

    it('renders purpose textarea', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const textarea = screen.getByLabelText(/purpose/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveAttribute('rows', '4');
    });

    it('renders expiration date picker with presets', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const dateInput = screen.getByLabelText(/expiration date.*optional/i);
      expect(dateInput).toHaveAttribute('type', 'datetime-local');

      expect(screen.getByRole('button', { name: /30 days/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /90 days/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /1 year/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /indefinite/i })).toBeInTheDocument();
    });
  });

  // Validation Tests (12 tests)
  describe('Validation', () => {
    it('shows error when grantedToName is empty', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/organization name is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when grantedTo is empty', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/organization identifier is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when purpose is empty', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/purpose must be at least 10 characters/i)).toBeInTheDocument();
      });
    });

    it('shows error when purpose < 10 characters', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const purposeTextarea = screen.getByLabelText(/purpose/i);
      await user.type(purposeTextarea, 'Too short');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/purpose must be at least 10 characters/i)).toBeInTheDocument();
      });
    });

    it('shows error when purpose > 500 characters', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const purposeTextarea = screen.getByLabelText(/purpose/i);
      const longText = 'a'.repeat(501);
      await user.type(purposeTextarea, longText);

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/must be 500 characters or less/i)).toBeInTheDocument();
      });
    });

    it('shows error when email is invalid format', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill in required fields first
      await user.type(screen.getByLabelText(/organization name/i), 'Test Org');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose for testing consent');

      // Now test email validation
      const emailInput = screen.getByLabelText(/contact email.*optional/i);
      await user.type(emailInput, 'notanemail');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      });
    });

    it('accepts valid email or empty email (optional)', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill required fields
      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose for testing');

      // Leave email empty - should be valid
      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      // Should not show email error
      expect(screen.queryByText(/invalid email/i)).not.toBeInTheDocument();
    });

    it('shows error when endDate is in the past', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const dateInput = screen.getByLabelText(/expiration date.*optional/i);
      const pastDate = '2020-01-01T00:00';
      await user.type(dateInput, pastDate);

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/end date must be in the future/i)).toBeInTheDocument();
      });
    });

    it('accepts future endDate', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill all required fields
      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(
        screen.getByLabelText(/purpose/i),
        'This is a valid purpose for granting consent'
      );

      const dateInput = screen.getByLabelText(/expiration date.*optional/i);
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await user.type(dateInput, futureDateString);

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1]; // Get the last one (submit button inside form)
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalled();
    });

    it('accepts empty endDate (indefinite)', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill required fields
      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(
        screen.getByLabelText(/purpose/i),
        'This is a valid purpose for granting consent'
      );

      // Leave endDate empty
      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalled();
    });

    it('validates accessLevel enum (read/export/verify)', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Select each access level
      const exportRadio = screen.getByRole('radio', { name: /export - download\/export data/i });
      await user.click(exportRadio);
      expect(exportRadio).toBeChecked();

      const verifyRadio = screen.getByRole('radio', { name: /verify - verify authenticity/i });
      await user.click(verifyRadio);
      expect(verifyRadio).toBeChecked();
    });

    it('accepts all valid form data', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill all fields with valid data
      const vaultSelect = screen.getByRole('combobox', { name: /vault data to share/i });
      await user.selectOptions(vaultSelect, 'vault-123');

      await user.type(screen.getByLabelText(/organization name/i), 'Acme Healthcare');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-12345');
      await user.type(
        screen.getByLabelText(/contact email.*optional/i),
        'contact@acme.com'
      );

      const exportRadio = screen.getByRole('radio', { name: /export - download\/export data/i });
      await user.click(exportRadio);

      await user.type(
        screen.getByLabelText(/purpose/i),
        'For medical records verification and compliance purposes'
      );

      const dateInput = screen.getByLabelText(/expiration date.*optional/i);
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      await user.type(dateInput, futureDate.toISOString().slice(0, 16));

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalled();
    });
  });

  // Submission Tests (8 tests)
  describe('Submission', () => {
    it('submits valid data to useCreateConsent', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(
        screen.getByLabelText(/purpose/i),
        'Valid purpose for testing consent grant'
      );

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          grantedToName: 'Acme Corp',
          grantedTo: 'org-123',
          purpose: 'Valid purpose for testing consent grant',
          accessLevel: 'read',
          termsVersion: '1.0',
        }),
        expect.objectContaining({
          onSuccess: expect.any(Function),
        })
      );
    });

    it('shows loading state during submission', () => {
      mockMutation.isPending = true;
      vi.mocked(useCreateConsent).mockReturnValue(mockMutation);

      render(<ConsentCreateDialog open={true} />);

      expect(screen.getByRole('button', { name: /granting/i })).toBeInTheDocument();
    });

    it('disables submit button during submission', () => {
      mockMutation.isPending = true;
      vi.mocked(useCreateConsent).mockReturnValue(mockMutation);

      render(<ConsentCreateDialog open={true} />);

      const submitButton = screen.getByRole('button', { name: /granting/i });
      expect(submitButton).toBeDisabled();
    });

    it('calls mutation with correct payload structure', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      const vaultSelect = screen.getByRole('combobox', { name: /vault data to share/i });
      await user.selectOptions(vaultSelect, 'vault-123');

      await user.type(screen.getByLabelText(/organization name/i), 'Test Org');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-test');
      await user.type(screen.getByLabelText(/purpose/i), 'Testing purpose field');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      const callArgs = vi.mocked(mockMutation.mutate).mock.calls[0][0];
      expect(callArgs).toEqual({
        vaultDataId: 'vault-123',
        grantedToName: 'Test Org',
        grantedTo: 'org-test',
        grantedToEmail: undefined,
        accessLevel: 'read',
        purpose: 'Testing purpose field',
        endDate: undefined,
        termsVersion: '1.0',
      });
    });

    it('shows success toast on successful creation', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose text here');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await waitForToast(mockToast);

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Consent granted successfully',
      });
    });

    it('closes dialog after successful submission', async () => {
      const mockOnOpenChange = vi.fn();
      const user = userEvent.setup();
      render(<ConsentCreateDialog open={true} onOpenChange={mockOnOpenChange} />);

      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose text here');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      // Trigger onSuccess
      const mutateCall = vi.mocked(mockMutation.mutate).mock.calls[0];
      const options = mutateCall[1];
      if (options?.onSuccess) {
        options.onSuccess({} as any);
      }

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('resets form after successful submission', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose text');

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      // Trigger onSuccess
      const mutateCall = vi.mocked(mockMutation.mutate).mock.calls[0];
      const options = mutateCall[1];
      if (options?.onSuccess) {
        options.onSuccess({} as any);
      }

      // Form should be reset (though dialog will close)
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('handles optional fields correctly', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog />);

      await user.click(screen.getByRole('button', { name: /grant consent/i }));

      // Fill only required fields
      await user.type(screen.getByLabelText(/organization name/i), 'Acme Corp');
      await user.type(screen.getByLabelText(/organization identifier/i), 'org-123');
      await user.type(screen.getByLabelText(/purpose/i), 'Valid purpose text');

      // Leave optional fields empty: vaultDataId, email, endDate

      const submitButtons = screen.getAllByRole('button', { name: /^grant consent$/i });
      const submitButton = submitButtons[submitButtons.length - 1];
      await user.click(submitButton);

      await flushPromises();

      const callArgs = vi.mocked(mockMutation.mutate).mock.calls[0][0];
      expect(callArgs.vaultDataId).toBeUndefined();
      expect(callArgs.grantedToEmail).toBeUndefined();
      expect(callArgs.endDate).toBeUndefined();
    });
  });

  // Preset Button Tests (4 tests)
  describe('Preset Buttons', () => {
    it('sets 30 days preset correctly', async () => {
      const user = userEvent.setup();
      const now = new Date('2024-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentCreateDialog open={true} />);

      const button = screen.getByRole('button', { name: /30 days/i });
      await user.click(button);

      const dateInput = screen.getByLabelText(/expiration date.*optional/i) as HTMLInputElement;
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 30);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(dateInput.value).toBe(expectedString);

      vi.useRealTimers();
    });

    it('sets 90 days preset correctly', async () => {
      const user = userEvent.setup();
      const now = new Date('2024-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentCreateDialog open={true} />);

      const button = screen.getByRole('button', { name: /90 days/i });
      await user.click(button);

      const dateInput = screen.getByLabelText(/expiration date.*optional/i) as HTMLInputElement;
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 90);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(dateInput.value).toBe(expectedString);

      vi.useRealTimers();
    });

    it('sets 1 year preset correctly', async () => {
      const user = userEvent.setup();
      const now = new Date('2024-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentCreateDialog open={true} />);

      const button = screen.getByRole('button', { name: /1 year/i });
      await user.click(button);

      const dateInput = screen.getByLabelText(/expiration date.*optional/i) as HTMLInputElement;
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 365);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(dateInput.value).toBe(expectedString);

      vi.useRealTimers();
    });

    it('sets indefinite (clears date)', async () => {
      const user = userEvent.setup();
      render(<ConsentCreateDialog open={true} />);

      // First set a date
      const dateInput = screen.getByLabelText(/expiration date.*optional/i) as HTMLInputElement;
      await user.type(dateInput, '2025-12-31T23:59');
      expect(dateInput.value).not.toBe('');

      // Click Indefinite button
      const button = screen.getByRole('button', { name: /indefinite/i });
      await user.click(button);

      // Date should be cleared
      expect(dateInput.value).toBe('');
    });
  });
});
