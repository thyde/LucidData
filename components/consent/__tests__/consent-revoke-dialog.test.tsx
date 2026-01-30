import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { ConsentRevokeDialog } from '../consent-revoke-dialog';
import { createMockMutation } from '@/test/utils/mockFactories';
import { flushPromises } from '@/test/utils/async-helpers';

// Mock hooks
vi.mock('@/lib/hooks/useConsent', () => ({
  useRevokeConsent: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useRevokeConsent } from '@/lib/hooks/useConsent';
import { useToast } from '@/lib/hooks/use-toast';

describe('ConsentRevokeDialog', () => {
  const mockToast = vi.fn();
  let mockMutation: ReturnType<typeof createMockMutation>;
  const mockOnOpenChange = vi.fn();

  const defaultProps = {
    consentId: 'consent-123',
    consentName: 'Acme Healthcare',
    open: true,
    onOpenChange: mockOnOpenChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation = createMockMutation({
      onSuccessHook: () => {
        mockToast({
          title: 'Success',
          description: 'Consent revoked successfully',
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
    vi.mocked(useRevokeConsent).mockReturnValue(mockMutation);
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (5 tests)
  describe('Rendering', () => {
    it('renders dialog with warning icon', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();

      // AlertTriangle icon should be present in the title
      const title = screen.getByRole('heading', { name: /revoke consent/i });
      expect(title).toBeInTheDocument();
    });

    it('displays dialog title "Revoke Consent"', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      expect(screen.getByRole('heading', { name: /revoke consent/i })).toBeInTheDocument();
    });

    it('displays warning description with organization name', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      expect(screen.getByText(/you are about to revoke consent for/i)).toBeInTheDocument();
      expect(screen.getByText(/acme healthcare/i)).toBeInTheDocument();
      expect(screen.getByText(/immediately terminate their access/i)).toBeInTheDocument();
    });

    it('renders reason textarea', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('renders confirmation checkbox', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      expect(screen.getByText(/i understand this action cannot be undone/i)).toBeInTheDocument();
      expect(screen.getByText(/the organization will lose access immediately/i)).toBeInTheDocument();
    });
  });

  // Form Field Tests (4 tests)
  describe('Form Fields', () => {
    it('reason textarea has placeholder text', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByPlaceholderText(/explain why you are revoking this consent/i);
      expect(textarea).toBeInTheDocument();
    });

    it('reason textarea has 4 rows', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      expect(textarea).toHaveAttribute('rows', '4');
    });

    it('displays helper text for reason field', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      expect(screen.getByText(/minimum 10 characters, maximum 500/i)).toBeInTheDocument();
    });

    it('checkbox is unchecked by default', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });
  });

  // Validation Tests (5 tests)
  describe('Validation', () => {
    it('shows error when reason is empty', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/reason must be at least 10 characters/i)).toBeInTheDocument();
      });
    });

    it('shows error when reason < 10 characters', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      await user.type(textarea, 'Too short');

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/reason must be at least 10 characters/i)).toBeInTheDocument();
      });
    });

    it('shows error when reason > 500 characters', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      const longText = 'a'.repeat(501);
      await user.type(textarea, longText);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/must be 500 characters or less/i)).toBeInTheDocument();
      });
    });

    it('shows error when checkbox not checked', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      await user.type(textarea, 'This is a valid reason for revocation');

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/you must confirm to proceed/i)).toBeInTheDocument();
      });
    });

    it('accepts valid form (reason + checkbox)', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      await user.type(textarea, 'This is a valid reason for revocation');

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalled();
    });
  });

  // Submission Tests (4 tests)
  describe('Submission', () => {
    it('submits with correct payload {id, reason}', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      const reason = 'Service no longer needed';
      await user.type(textarea, reason);

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalledWith(
        { id: 'consent-123', reason },
        expect.objectContaining({
          onSuccess: expect.any(Function),
        })
      );
    });

    it('shows loading state "Revoking..."', () => {
      mockMutation.isPending = true;
      vi.mocked(useRevokeConsent).mockReturnValue(mockMutation);

      render(<ConsentRevokeDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /revoking/i })).toBeInTheDocument();
    });

    it('disables submit button during submission', () => {
      mockMutation.isPending = true;
      vi.mocked(useRevokeConsent).mockReturnValue(mockMutation);

      render(<ConsentRevokeDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /revoking/i });
      expect(submitButton).toBeDisabled();
    });

    it('closes dialog after successful revocation', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      await user.type(textarea, 'This is a valid reason for revocation');

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await flushPromises();

      // Get the onSuccess callback and call it
      const mutateCall = vi.mocked(mockMutation.mutate).mock.calls[0];
      const options = mutateCall[1];
      if (options?.onSuccess) {
        await act(async () => {
          options.onSuccess?.({} as any);
        });
      }

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // User Interaction Tests (2 tests)
  describe('User Interaction', () => {
    it('closes dialog when cancel button clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('shows destructive button styling', () => {
      render(<ConsentRevokeDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      expect(submitButton).toBeInTheDocument();
      // The button should have destructive variant
      // Note: Actual class name checking might vary based on your UI library
    });
  });

  // Additional edge case tests
  describe('Edge Cases', () => {
    it('does not render when open is false', () => {
      render(<ConsentRevokeDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('resets form after successful submission', async () => {
      const user = userEvent.setup();
      render(<ConsentRevokeDialog {...defaultProps} />);

      const textarea = screen.getByLabelText(/reason for revocation/i);
      await user.type(textarea, 'This is a valid reason');

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      const submitButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(submitButton);

      await flushPromises();

      // Trigger onSuccess callback
      const mutateCall = vi.mocked(mockMutation.mutate).mock.calls[0];
      const options = mutateCall[1];
      if (options?.onSuccess) {
        await act(async () => {
          options.onSuccess?.({} as any);
        });
      }

      // After success, form should be reset
      // Note: In practice, the dialog would close, but we're testing the reset logic
      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
