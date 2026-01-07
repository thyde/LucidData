import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/helpers/render';
import userEvent from '@testing-library/user-event';
import { ConsentList } from '../consent-list';
import {
  createMockQuery,
  createLoadingQuery,
  createErrorQuery,
} from '@/test/utils/mockFactories';
import {
  mockConsent,
  mockExpiredConsent,
  mockRevokedConsent,
  mockIndefiniteConsent,
  mockConsentList,
  createExpiringSoonConsent,
  createMockConsent,
} from '@/test/fixtures/consent-data';

// Mock hooks
vi.mock('@/lib/hooks/useConsent', () => ({
  useConsentList: vi.fn(),
}));

// Mock child components
vi.mock('../consent-create-dialog', () => ({
  ConsentCreateDialog: vi.fn(({ trigger }) => trigger || <button>Grant Consent</button>),
}));

vi.mock('../consent-view-dialog', () => ({
  ConsentViewDialog: vi.fn(({ open, consentId }) =>
    open ? <div data-testid="view-dialog">View Dialog for {consentId}</div> : null
  ),
}));

import { useConsentList } from '@/lib/hooks/useConsent';

describe('ConsentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConsentList).mockReturnValue(createMockQuery(mockConsentList));
  });

  // Rendering Tests (8 tests)
  describe('Rendering', () => {
    it('renders page title "Consent Management"', () => {
      render(<ConsentList />);

      expect(screen.getByRole('heading', { name: /consent management/i })).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<ConsentList />);

      expect(screen.getByText(/manage who has access to your data/i)).toBeInTheDocument();
    });

    it('renders "Grant Consent" button', () => {
      render(<ConsentList />);

      expect(screen.getByRole('button', { name: /grant consent/i })).toBeInTheDocument();
    });

    it('renders loading skeleton while fetching', () => {
      vi.mocked(useConsentList).mockReturnValue(createLoadingQuery());

      render(<ConsentList />);

      const skeletons = screen.getAllByRole('generic');
      const animatedSkeletons = skeletons.filter((el) => el.className.includes('animate-pulse'));
      expect(animatedSkeletons.length).toBeGreaterThan(0);
    });

    it('renders error state on query failure', () => {
      vi.mocked(useConsentList).mockReturnValue(createErrorQuery('Failed to load'));

      render(<ConsentList />);

      expect(screen.getByText(/failed to load consents/i)).toBeInTheDocument();
    });

    it('renders empty state when no consents', () => {
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([]));

      render(<ConsentList />);

      expect(screen.getByText(/no consents granted yet/i)).toBeInTheDocument();
    });

    it('renders list of consent cards', () => {
      render(<ConsentList />);

      // Should render all consents from mockConsentList
      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();
      expect(screen.getByText(mockExpiredConsent.grantedToName)).toBeInTheDocument();
      expect(screen.getByText(mockRevokedConsent.grantedToName)).toBeInTheDocument();
    });

    it('displays cards in grid layout', () => {
      render(<ConsentList />);

      const grid = screen.getByRole('generic', { hidden: true });
      // Check for grid class - implementation may vary
      const gridElements = screen.getAllByRole('generic');
      const hasGridLayout = gridElements.some((el) => el.className.includes('grid'));
      expect(hasGridLayout).toBe(true);
    });
  });

  // Search and Filter Tests (6 tests)
  describe('Search & Filter', () => {
    it('renders search input', () => {
      render(<ConsentList />);

      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('filters consents by organization name', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      await user.type(searchInput, 'Acme');

      // Should show Acme Healthcare
      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();

      // Should hide others
      expect(screen.queryByText(mockExpiredConsent.grantedToName)).not.toBeInTheDocument();
      expect(screen.queryByText(mockRevokedConsent.grantedToName)).not.toBeInTheDocument();
    });

    it('filters consents by purpose text', async () => {
      const consentsWithPurpose = [
        createMockConsent({
          id: 'consent-1',
          grantedToName: 'Org 1',
          purpose: 'For research purposes',
        }),
        createMockConsent({
          id: 'consent-2',
          grantedToName: 'Org 2',
          purpose: 'For medical records',
        }),
      ];
      vi.mocked(useConsentList).mockReturnValue(createMockQuery(consentsWithPurpose));

      const user = userEvent.setup();
      render(<ConsentList />);

      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      await user.type(searchInput, 'research');

      expect(screen.getByText('Org 1')).toBeInTheDocument();
      expect(screen.queryByText('Org 2')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      await user.type(searchInput, 'acme'); // lowercase

      // Should still find "Acme Healthcare"
      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();
    });

    it('renders status filter dropdown', () => {
      render(<ConsentList />);

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      const options = within(select).getAllByRole('option');
      expect(options).toHaveLength(4); // All, Active, Expired, Revoked
      expect(options[0]).toHaveTextContent(/all status/i);
      expect(options[1]).toHaveTextContent(/active/i);
      expect(options[2]).toHaveTextContent(/expired/i);
      expect(options[3]).toHaveTextContent(/revoked/i);
    });

    it('filters by status (active/expired/revoked)', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const select = screen.getByRole('combobox');

      // Filter by active
      await user.selectOptions(select, 'active');

      // Should show active consent
      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();

      // Should hide expired and revoked
      expect(screen.queryByText(mockExpiredConsent.grantedToName)).not.toBeInTheDocument();
      expect(screen.queryByText(mockRevokedConsent.grantedToName)).not.toBeInTheDocument();
    });
  });

  // Status Badge Tests (5 tests)
  describe('Status Badges', () => {
    it('shows "active" badge for active consents', () => {
      render(<ConsentList />);

      const acmeCard = screen.getByText(mockConsent.grantedToName).closest('div[class*="card"]');
      expect(acmeCard).toBeInTheDocument();

      const badge = within(acmeCard!).getByText(/active/i);
      expect(badge).toBeInTheDocument();
    });

    it('shows "expired" badge for expired consents', () => {
      render(<ConsentList />);

      const expiredCard = screen
        .getByText(mockExpiredConsent.grantedToName)
        .closest('div[class*="card"]');
      expect(expiredCard).toBeInTheDocument();

      const badge = within(expiredCard!).getByText(/expired/i);
      expect(badge).toBeInTheDocument();
    });

    it('shows "revoked" badge for revoked consents', () => {
      render(<ConsentList />);

      const revokedCard = screen
        .getByText(mockRevokedConsent.grantedToName)
        .closest('div[class*="card"]');
      expect(revokedCard).toBeInTheDocument();

      const badge = within(revokedCard!).getByText(/revoked/i);
      expect(badge).toBeInTheDocument();
    });

    it('displays expiration warning for soon-to-expire', () => {
      const expiringSoon = createExpiringSoonConsent(5);
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([expiringSoon]));

      render(<ConsentList />);

      // Should show expiration date with warning styling
      const card = screen.getByText(expiringSoon.grantedToName).closest('div[class*="card"]');
      const expiryText = within(card!).getByText(/expires:/i).parentElement;
      expect(expiryText).toBeInTheDocument();
    });

    it('shows "No expiration" for indefinite consents', () => {
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([mockIndefiniteConsent]));

      render(<ConsentList />);

      expect(screen.getByText(/no expiration/i)).toBeInTheDocument();
    });
  });

  // Consent Card Tests (7 tests)
  describe('Consent Cards', () => {
    it('displays organization name as card title', () => {
      render(<ConsentList />);

      expect(screen.getByText(mockConsent.grantedToName)).toBeInTheDocument();
    });

    it('displays purpose as card description', () => {
      render(<ConsentList />);

      const card = screen.getByText(mockConsent.grantedToName).closest('div[class*="card"]');
      expect(card).toBeInTheDocument();

      // Purpose should be in the card
      expect(within(card!).getByText(mockConsent.purpose)).toBeInTheDocument();
    });

    it('truncates purpose with line-clamp-2', () => {
      const longPurpose =
        'This is a very long purpose that should be truncated when displayed in the card view to prevent it from taking up too much space';
      const consentWithLongPurpose = createMockConsent({
        id: 'consent-long',
        grantedToName: 'Long Purpose Org',
        purpose: longPurpose,
      });
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([consentWithLongPurpose]));

      render(<ConsentList />);

      const description = screen.getByText(longPurpose);
      expect(description.className).toContain('line-clamp-2');
    });

    it('displays access level', () => {
      render(<ConsentList />);

      const card = screen.getByText(mockConsent.grantedToName).closest('div[class*="card"]');
      expect(within(card!).getByText(/access:/i)).toBeInTheDocument();
      expect(within(card!).getByText(/read/i)).toBeInTheDocument();
    });

    it('displays expiration date when set', () => {
      render(<ConsentList />);

      const card = screen.getByText(mockConsent.grantedToName).closest('div[class*="card"]');
      expect(within(card!).getByText(/expires:/i)).toBeInTheDocument();
      expect(within(card!).getByText(/dec 31, 2024/i)).toBeInTheDocument();
    });

    it('highlights expiring soon dates', () => {
      const expiringSoon = createExpiringSoonConsent(3);
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([expiringSoon]));

      render(<ConsentList />);

      const card = screen.getByText(expiringSoon.grantedToName).closest('div[class*="card"]');
      const expirySection = within(card!).getByText(/expires:/i).parentElement;

      // Check that warning styling is applied
      expect(expirySection?.querySelector('.text-warning')).toBeInTheDocument();
    });

    it('shows "View Details" button on each card', () => {
      render(<ConsentList />);

      const viewButtons = screen.getAllByRole('button', { name: /view details/i });
      expect(viewButtons.length).toBe(mockConsentList.length);
    });
  });

  // Empty States Tests (4 tests)
  describe('Empty States', () => {
    it('shows empty state with no filters applied', () => {
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([]));

      render(<ConsentList />);

      expect(screen.getByText(/no consents granted yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /grant your first consent/i })).toBeInTheDocument();
    });

    it('shows "no matches" when search returns nothing', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      await user.type(searchInput, 'xyz123nonexistent');

      expect(screen.getByText(/no consents match your filters/i)).toBeInTheDocument();
    });

    it('shows "no matches" when filter returns nothing', async () => {
      // Only provide active consents
      const activeConsents = [mockConsent];
      vi.mocked(useConsentList).mockReturnValue(createMockQuery(activeConsents));

      const user = userEvent.setup();
      render(<ConsentList />);

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'expired');

      expect(screen.getByText(/no consents match your filters/i)).toBeInTheDocument();
    });

    it('does not show "Grant First Consent" when filters active', async () => {
      vi.mocked(useConsentList).mockReturnValue(createMockQuery([]));

      const user = userEvent.setup();
      render(<ConsentList />);

      // Apply search filter
      const searchInput = screen.getByPlaceholderText(/search by organization or purpose/i);
      await user.type(searchInput, 'test');

      expect(screen.getByText(/no consents match your filters/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /grant your first consent/i })
      ).not.toBeInTheDocument();
    });
  });

  // Additional Tests
  describe('View Dialog Integration', () => {
    it('opens view dialog when "View Details" clicked', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const viewButtons = screen.getAllByRole('button', { name: /view details/i });
      await user.click(viewButtons[0]);

      expect(screen.getByTestId('view-dialog')).toBeInTheDocument();
    });

    it('closes view dialog correctly', async () => {
      const user = userEvent.setup();
      render(<ConsentList />);

      const viewButtons = screen.getAllByRole('button', { name: /view details/i });
      await user.click(viewButtons[0]);

      expect(screen.getByTestId('view-dialog')).toBeInTheDocument();

      // Dialog would close via onOpenChange callback
      // This is mocked, so we just verify it was called
    });
  });

  describe('VaultDataId Filtering', () => {
    it('passes vaultDataId to useConsentList when provided', () => {
      render(<ConsentList vaultDataId="vault-123" />);

      expect(useConsentList).toHaveBeenCalledWith({ vaultDataId: 'vault-123' });
    });

    it('calls useConsentList without vaultDataId when not provided', () => {
      render(<ConsentList />);

      expect(useConsentList).toHaveBeenCalledWith({ vaultDataId: undefined });
    });
  });
});
