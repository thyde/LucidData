import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { ConsentExtendDialog } from '../consent-extend-dialog';
import { createMockMutation } from '@/test/utils/mockFactories';
import { flushPromises } from '@/test/utils/async-helpers';

// Mock hooks
vi.mock('@/lib/hooks/useConsent', () => ({
  useExtendConsent: vi.fn(),
}));

vi.mock('@/lib/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { useExtendConsent } from '@/lib/hooks/useConsent';
import { useToast } from '@/lib/hooks/use-toast';

describe('ConsentExtendDialog', () => {
  const mockToast = vi.fn();
  let mockMutation: ReturnType<typeof createMockMutation>;
  const mockOnOpenChange = vi.fn();

  const defaultProps = {
    consentId: 'consent-123',
    currentEndDate: new Date('2026-02-01T00:00:00.000Z'),
    open: true,
    onOpenChange: mockOnOpenChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutation = createMockMutation({
      onSuccessHook: () => {
        mockToast({
          title: 'Success',
          description: 'Consent extended successfully',
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
    vi.mocked(useExtendConsent).mockReturnValue(mockMutation);
    vi.mocked(useToast).mockReturnValue({
      toast: mockToast,
    });
  });

  // Rendering Tests (5 tests)
  describe('Rendering', () => {
    it('renders dialog title "Extend Consent"', () => {
      render(<ConsentExtendDialog {...defaultProps} />);

      expect(screen.getByRole('heading', { name: /extend consent/i })).toBeInTheDocument();
    });

    it('displays dialog description', () => {
      render(<ConsentExtendDialog {...defaultProps} />);

      expect(screen.getByText(/set a new expiration date for this consent/i)).toBeInTheDocument();
    });

    it('displays current expiration date when set', () => {
      render(<ConsentExtendDialog {...defaultProps} />);

      expect(screen.getByText(/current expiration:/i)).toBeInTheDocument();
      // Date is formatted in local timezone (may show as Jan 31 or Feb 1 depending on timezone)
      const dateElement = screen.getByText(/current expiration:/i).parentElement;
      expect(dateElement).toHaveTextContent(/(Jan 31, 2026|Feb 1, 2026)/i);
    });

    it('renders new expiration date input', () => {
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'datetime-local');
    });

    it('renders preset extension buttons', () => {
      render(<ConsentExtendDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /\+30 days/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+90 days/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /\+1 year/i })).toBeInTheDocument();
    });
  });

  // Validation Tests (7 tests)
  describe('Validation', () => {
    it('shows error when new date is in the past', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      const pastDate = new Date('2023-01-01T00:00:00.000Z');
      const pastDateString = pastDate.toISOString().slice(0, 16);
      await user.type(input, pastDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/new date must be after current expiration and in the future/i)
        ).toBeInTheDocument();
      });
    });

    it('shows error when new date equals current expiration', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      // Set to a time just before/at the current end date (UTC: 2026-02-01T00:00:00.000Z)
      // In local timezone (PST), this would be 2026-01-31 16:00, which is before the UTC date
      // Use the exact UTC time in local format to ensure it's less than or equal
      const currentDate = new Date(defaultProps.currentEndDate!);
      const currentDateString = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      await user.type(input, currentDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/new date must be after current expiration and in the future/i)
        ).toBeInTheDocument();
      });
    });

    it('shows error when new date is before current expiration', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      // Set to before current end date
      const earlierDateString = '2026-01-15T00:00';
      await user.type(input, earlierDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/new date must be after current expiration and in the future/i)
        ).toBeInTheDocument();
      });
    });

    it('accepts date after current expiration', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      // Set to future date after current expiration (current is 2026-02-01, so use 2026-03-01)
      const futureDate = new Date('2026-03-01T00:00:00.000Z');
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await user.clear(input);
      await user.type(input, futureDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalled();
      });
    });

    it('handles null currentEndDate (indefinite consent)', () => {
      render(<ConsentExtendDialog {...defaultProps} currentEndDate={null} />);

      // Should not show current expiration
      expect(screen.queryByText(/current expiration:/i)).not.toBeInTheDocument();
    });

    it('accepts valid future date for indefinite consent', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} currentEndDate={null} />);

      const input = screen.getByLabelText(/new expiration date/i);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await user.type(input, futureDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await flushPromises();

      expect(mockMutation.mutate).toHaveBeenCalled();
    });

    it('validates date must be after now AND after currentEndDate', async () => {
      const user = userEvent.setup();
      // Set current end date to far future
      const futureEndDate = new Date();
      futureEndDate.setFullYear(futureEndDate.getFullYear() + 2);

      render(
        <ConsentExtendDialog {...defaultProps} currentEndDate={futureEndDate} />
      );

      const input = screen.getByLabelText(/new expiration date/i);
      // Try to set date that's in future but before current end date
      const middleDate = new Date();
      middleDate.setFullYear(middleDate.getFullYear() + 1);
      const middleDateString = middleDate.toISOString().slice(0, 16);
      await user.type(input, middleDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/new date must be after current expiration and in the future/i)
        ).toBeInTheDocument();
      });
    });
  });

  // Preset Button Tests (3 tests)
  describe('Preset Buttons with Current End Date', () => {
    it('+30 days button calculates from currentEndDate', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const button = screen.getByRole('button', { name: /\+30 days/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      // Calculate expected date: 2026-02-01 + 30 days = 2026-03-02
      const expectedDate = new Date('2026-02-01T00:00:00.000Z');
      expectedDate.setDate(expectedDate.getDate() + 30);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);
    });

    it('+90 days button calculates from currentEndDate', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const button = screen.getByRole('button', { name: /\+90 days/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      // Calculate expected date: 2026-02-01 + 90 days
      const expectedDate = new Date('2026-02-01T00:00:00.000Z');
      expectedDate.setDate(expectedDate.getDate() + 90);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);
    });

    it('+1 year button calculates from currentEndDate', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const button = screen.getByRole('button', { name: /\+1 year/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      // Calculate expected date: 2026-02-01 + 365 days
      const expectedDate = new Date('2026-02-01T00:00:00.000Z');
      expectedDate.setDate(expectedDate.getDate() + 365);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);
    });
  });

  // Preset Buttons with Null CurrentEndDate (3 tests)
  describe('Preset Buttons with Null CurrentEndDate', () => {
    it('preset buttons use now() when currentEndDate is null - +30 days', async () => {
      const user = userEvent.setup();
      const now = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentExtendDialog {...defaultProps} currentEndDate={null} />);

      const button = screen.getByRole('button', { name: /\+30 days/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      // Should calculate from now
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 30);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);

      vi.useRealTimers();
    });

    it('+90 days from now when indefinite', async () => {
      const user = userEvent.setup();
      const now = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentExtendDialog {...defaultProps} currentEndDate={null} />);

      const button = screen.getByRole('button', { name: /\+90 days/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 90);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);

      vi.useRealTimers();
    });

    it('+1 year from now when indefinite', async () => {
      const user = userEvent.setup();
      const now = new Date('2026-06-01T12:00:00.000Z');
      vi.setSystemTime(now);

      render(<ConsentExtendDialog {...defaultProps} currentEndDate={null} />);

      const button = screen.getByRole('button', { name: /\+1 year/i });
      await user.click(button);

      const input = screen.getByLabelText(/new expiration date/i) as HTMLInputElement;

      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 365);
      const expectedString = expectedDate.toISOString().slice(0, 16);

      expect(input.value).toBe(expectedString);

      vi.useRealTimers();
    });
  });

  // Submission Tests (2 tests)
  describe('Submission', () => {
    it('submits with correct payload {id, data: {endDate}}', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      const futureDate = new Date('2026-03-01T00:00:00.000Z');
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await user.clear(input);
      await user.type(input, futureDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalledWith(
          {
            id: 'consent-123',
            data: { endDate: expect.any(Date) },
          },
          expect.objectContaining({
            onSuccess: expect.any(Function),
          })
        );
      });

      // Verify the date object is correct
      const callArgs = vi.mocked(mockMutation.mutate).mock.calls[0][0];
      expect(callArgs.data.endDate.toISOString()).toContain('2026-03-01');
    });

    it('closes dialog after successful extension', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const input = screen.getByLabelText(/new expiration date/i);
      const futureDate = new Date('2026-03-01T00:00:00.000Z');
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await user.clear(input);
      await user.type(input, futureDateString);

      const submitButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMutation.mutate).toHaveBeenCalled();
      });

      // Trigger onSuccess callback
      const mutateCall = vi.mocked(mockMutation.mutate).mock.calls[0];
      const options = mutateCall[1];
      if (options?.onSuccess) {
        options.onSuccess({} as any);
      }

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Additional Tests
  describe('Additional Functionality', () => {
    it('shows loading state "Extending..."', () => {
      mockMutation.isPending = true;
      vi.mocked(useExtendConsent).mockReturnValue(mockMutation);

      render(<ConsentExtendDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /extending/i })).toBeInTheDocument();
    });

    it('disables submit button during submission', () => {
      mockMutation.isPending = true;
      vi.mocked(useExtendConsent).mockReturnValue(mockMutation);

      render(<ConsentExtendDialog {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /extending/i });
      expect(submitButton).toBeDisabled();
    });

    it('closes dialog when cancel button clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentExtendDialog {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('does not render when open is false', () => {
      render(<ConsentExtendDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
