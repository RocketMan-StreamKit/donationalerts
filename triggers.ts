const currencyOption = (code: string) => ({
  value: code,
  label: { en: code, ru: code, uk: code },
});

const DONATIONALERTS_CURRENCY_OPTIONS = [
  'BRL',
  'BYN',
  'EUR',
  'KZT',
  'PLN',
  'RUB',
  'TRY',
  'UAH',
  'USD',
  'UZS',
].map(currencyOption);

/** Overlay trigger options exposed in overlay settings UI. */
export const registerDonationAlertsOverlayTriggers = () => {
  return dashboard.registerTriggers([
    {
      type: 'donation',
      label: {
        en: 'Donation',
        ru: 'Донат',
        uk: 'Донат',
      },
      valueType: 'number',
      keyOptions: DONATIONALERTS_CURRENCY_OPTIONS,
      keyLabel: {
        en: 'Currency',
        ru: 'Валюта',
        uk: 'Валюта',
      },
      valueHint: {
        en: 'Donation amount',
        ru: 'Сумма доната',
        uk: 'Сума донату',
      },
    },
  ]);
};
