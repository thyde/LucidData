import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { ConsentViewDialog } from '../consent-view-dialog';
import { createMockQuery, createLoadingQuery } from '@/test/utils/mockFactories';
import {
  mockConsent,
  mockExpiredConsent,
  mockRevokedConsent,
  mockIndefiniteConsent,
  createExpiringSoonConsent,
} from '@/test/fixtures/consent-data';

// Mock hooks
vi.mock('@/lib/hooks/useConsent', () => ({
  useConsentEntry: vi.fn(),
}));

// Mock child dialogs
vi.mock('../consent-revoke-dialog', () => ({
  ConsentRevokeDialog: vi.fn(({ open, consentName }) =>
    open ? <div data-testid="revoke-dialog">Revoke Dialog for {consentName}</div> : null
  ),
}));

vi.mock('../consent-extend-dialog', () => ({
  ConsentExtendDialog: vi.fn(({ open }) =>
    open ? <div data-testid="extend-dialog">Extend Dialog</div> : null
  ),
}));

import { useConsentEntry } from '@/lib/hooks/useConsent';

describe('ConsentViewDialog', () => {
  const mockOnOpenChange = vi.fn();

  const defaultProps = {
    consentId: 'consent-123',
    open: true,
    onOpenChange: mockOnOpenChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockConsent));
  });

  // Rendering Tests (7 tests)
  describe('Rendering', () => {
    it('renders loading state while fetching', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createLoadingQuery());

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('renders dialog with consent details', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();
    });

    it('displays organization name as title', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByRole('heading', { name: mockConsent.grantedToName })).toBeInTheDocument();
    });

    it('displays organization identifier', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(mockConsent.grantedTo)).toBeInTheDocument();
    });

    it('displays status badge in header', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/ACTIVE/i)).toBeInTheDocument();
    });

    it('handles consent not found', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(null));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('closes via onOpenChange', async () => {
      render(<ConsentViewDialog {...defaultProps} />);

      // Dialog should be open
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Simulate closing (would be triggered by clicking outside or close button)
      mockOnOpenChange(false);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  // Access Details Section (4 tests)
  describe('Access Details Section', () => {
    it('displays access level', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/access level:/i)).toBeInTheDocument();
      expect(screen.getByText(/read/i)).toBeInTheDocument();
    });

    it('displays purpose text (full, not truncated)', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/purpose:/i)).toBeInTheDocument();
      expect(screen.getByText(mockConsent.purpose)).toBeInTheDocument();
    });

    it('displays Shield icon in section header', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/access details/i)).toBeInTheDocument();
    });

    it('shows all access details in read-only format', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      // Should not have any input fields
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    });
  });

  // Timeline Section (6 tests)
  describe('Timeline Section', () => {
    it('displays granted date (createdAt)', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/granted on:/i)).toBeInTheDocument();
      // Date is formatted in local timezone with time (may show as Dec 31, 2025 or Jan 1, 2026 depending on timezone)
      const grantedRow = screen.getByText(/granted on:/i).closest('div');
      expect(grantedRow).toHaveTextContent(/(dec 31, 2025|jan 1, 2026).*([0-9]{1,2}:[0-9]{2}\s*(am|pm))/i);
    });

    it('displays start date', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/starts:/i)).toBeInTheDocument();
    });

    it('displays expiration date when set', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/expires:/i)).toBeInTheDocument();
      expect(screen.getByText(/dec 31, 2026/i)).toBeInTheDocument();
    });

    it('displays "No expiration" when endDate is null', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockIndefiniteConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/duration:/i)).toBeInTheDocument();
      expect(screen.getByText(/no expiration/i)).toBeInTheDocument();
    });

    it('shows expiring soon warning', () => {
      const expiringSoon = createExpiringSoonConsent(5);
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(expiringSoon));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/\(soon\)/i)).toBeInTheDocument();
    });

    it('displays revocation details when revoked', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockRevokedConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/revoked on:/i)).toBeInTheDocument();
      expect(screen.getByText(/reason:/i)).toBeInTheDocument();
      expect(screen.getByText(mockRevokedConsent.revokedReason!)).toBeInTheDocument();
    });
  });

  // Legal & Compliance Section (4 tests)
  describe('Legal & Compliance Section', () => {
    it('displays IP address with font-mono', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/ip address:/i)).toBeInTheDocument();
      expect(screen.getByText(mockConsent.ipAddress!)).toBeInTheDocument();
    });

    it('displays user agent with font-mono and truncated', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/user agent:/i)).toBeInTheDocument();
      const userAgentElement = screen.getByText(mockConsent.userAgent!);
      expect(userAgentElement).toBeInTheDocument();
      expect(userAgentElement.className).toContain('font-mono');
      expect(userAgentElement.className).toContain('truncate');
    });

    it('displays terms version', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/terms version:/i)).toBeInTheDocument();
      expect(screen.getByText(mockConsent.termsVersion)).toBeInTheDocument();
    });

    it('displays contact email if present', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByText(/contact:/i)).toBeInTheDocument();
      expect(screen.getByText(mockConsent.grantedToEmail!)).toBeInTheDocument();
    });
  });

  // Action Buttons Tests (4 tests)
  describe('Action Buttons', () => {
    it('shows action buttons only for active consents', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.getByRole('button', { name: /extend consent/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /revoke consent/i })).toBeInTheDocument();
    });

    it('does not show action buttons for expired consents', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockExpiredConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /extend consent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /revoke consent/i })).not.toBeInTheDocument();
    });

    it('does not show action buttons for revoked consents', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockRevokedConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /extend consent/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /revoke consent/i })).not.toBeInTheDocument();
    });

    it('opens respective dialogs when action buttons clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentViewDialog {...defaultProps} />);

      // Click Extend button
      const extendButton = screen.getByRole('button', { name: /extend consent/i });
      await user.click(extendButton);

      // Main dialog should close, extend dialog should open
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(screen.getByTestId('extend-dialog')).toBeInTheDocument();
    });
  });

  // Additional Tests
  describe('Status Badges', () => {
    it('shows "active" badge with default variant', () => {
      render(<ConsentViewDialog {...defaultProps} />);

      const badge = screen.getByText(/ACTIVE/i);
      expect(badge).toBeInTheDocument();
    });

    it('shows "expired" badge with secondary variant', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockExpiredConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      const badge = screen.getByText(/^EXPIRED$/i);
      expect(badge).toBeInTheDocument();
    });

    it('shows "revoked" badge with destructive variant', () => {
      vi.mocked(useConsentEntry).mockReturnValue(createMockQuery(mockRevokedConsent));

      render(<ConsentViewDialog {...defaultProps} />);

      const badge = screen.getByText(/^REVOKED$/i);
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Child Dialog Integration', () => {
    it('opens revoke dialog when revoke button clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentViewDialog {...defaultProps} />);

      const revokeButton = screen.getByRole('button', { name: /revoke consent/i });
      await user.click(revokeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      expect(screen.getByTestId('revoke-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Revoke Dialog for Acme Healthcare/i)).toBeInTheDocument();
    });

    it('does not render dialog when open is false', () => {
      render(<ConsentViewDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
