/** Föreslaget integrationskontrakt. Ingen körbar agent eller endpoint. */
export type StoreId =
  | 'lindex' | 'polarnopyret' | 'minirodini' | 'newbie'
  | 'tretorn' | 'asket' | 'arket' | 'cdlp';

export type CheckoutStatus =
  | 'created' | 'preparing' | 'needs_user'
  | 'ready_for_customer' | 'not_supported' | 'failed';

export interface Money {
  /** Heltal i ören för SEK. Jämför aldrig avrundad produkttext som slutpris. */
  minorUnits: number;
  currency: 'SEK';
}

export interface PrepareCheckoutRequest {
  storeId: StoreId;
  productRef: string;
  /** Exakt köpbar variant; backend/adapter måste validera butikstillhörighet. */
  variantRef: string;
  quantity: number;
  profileRef: string;
  expectedUnitPrice: Money;
  /** Kundens godkända övre gräns inklusive frakt; kontrollera på serversidan. */
  approvedTotalLimit: Money;
  idempotencyKey: string;
  /** Serverutfärdat tillstånd; kontrollera ägare, butik, fält och giltighet. */
  consentGrantRef: string;
}

/** Lämnas bara till den auktoriserade runnern. Får inte hamna i statusloggar. */
export interface CheckoutProfile {
  firstName: string;
  lastName: string;
  email: string;
  phoneE164: string;
  addressLine1: string;
  addressLine2?: string;
  careOf?: string;
  postalCode: string;
  city: string;
  countryCode: 'SE';
}

export type Handoff =
  | { kind: 'same_browser'; tabRef: string }
  | { kind: 'remote_session'; sessionRef: string }
  | {
      kind: 'partner_checkout';
      url: string;
      /** Bara när butikens dokumenterade överlämning faktiskt verifierats. */
      portabilityVerified: true;
    };

export interface PreparedCartSummary {
  productRef: string;
  variantRef: string;
  quantity: number;
  unitPrice: Money;
  shippingPrice: Money;
  total: Money;
}

export type CustomerActionReason =
  | 'profile_validation' | 'address_correction' | 'delivery_selection'
  | 'price_changed' | 'variant_unavailable' | 'authentication'
  | 'site_access_control' | 'unknown_page_state';

export type CheckoutResult =
  | {
      sessionId: string;
      status: 'ready_for_customer';
      cart: PreparedCartSummary;
      handoff: Handoff;
      /** Alltid falskt för assisterat köp i denna beta. */
      paymentExecutedByAgent: false;
    }
  | {
      sessionId: string;
      status: 'needs_user';
      reason: CustomerActionReason;
      /** Kort kundtext utan profilvärden eller tekniska hemligheter. */
      message: string;
    }
  | {
      sessionId: string;
      status: 'not_supported' | 'failed';
      code: string;
    };

/** Maskerad observation. Inte kundprofil, screenshot, HTML eller sessions-URL. */
export interface CheckoutEvent {
  sessionId: string;
  storeId: StoreId;
  adapterVersion: string;
  step:
    | 'product_verified' | 'cart_verified' | 'profile_filled'
    | 'profile_accepted' | 'delivery_verified' | 'payment_options_visible';
  outcome: 'passed' | 'needs_user' | 'failed';
  occurredAt: string;
}
