type LangKey = 'en' | 'ru' | 'uk';

export type LocalizedText = Record<LangKey, string>;

/**
 * Picks a string for the current app UI locale.
 * @param text Per-locale strings (`en` is required).
 * @returns Localized string with `en` fallback.
 * @example
 * pickLang({ en: 'Logout', ru: 'Выйти', uk: 'Вийти' });
 */
export const pickLang = (text: Partial<LocalizedText> & { en: string }) =>
  text[LANG.current] || text.en;

/**
 * Builds logout button labels that include the signed-in account.
 * @param account Username or numeric user id.
 */
export const buildLogoutLabel = (account: string): LocalizedText => ({
  en: `Logout (${account})`,
  ru: `Выйти (${account})`,
  uk: `Вийти (${account})`,
});

export const logoutFallback: LocalizedText = {
  en: 'Logout',
  ru: 'Выйти',
  uk: 'Вийти',
};

/**
 * Resolves the account label shown on the logout button.
 * @param name OAuth profile name when available.
 * @param id OAuth user id used as fallback.
 */
export const formatAccountLabel = (name?: string, id?: number) => {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (typeof id === 'number' && id > 0) {
    return String(id);
  }
  return '';
};

export const authMessages = {
  authFailed: (error: string): LocalizedText => ({
    en: `DonationAlerts authorization failed: ${error}`,
    ru: `Ошибка авторизации DonationAlerts: ${error}`,
    uk: `Помилка авторизації DonationAlerts: ${error}`,
  }),
  missingCode: {
    en: 'Missing authorization code',
    ru: 'Отсутствует код авторизации',
    uk: 'Відсутній код авторизації',
  },
  tokenExchangeFailed: {
    en: 'Token exchange failed',
    ru: 'Не удалось обменять токен',
    uk: 'Не вдалося обміняти токен',
  },
  success: {
    en: 'Authorization successful. You can close this window.',
    ru: 'Авторизация успешна. Можно закрыть это окно.',
    uk: 'Авторизацію успішно завершено. Можна закрити це вікно.',
  },
};
