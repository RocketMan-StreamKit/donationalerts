export const PLATFORM = 'donationalerts';

export const CLIENT_ID = '19277';

export const DEFAULT_API_SERVER = 'https://rocketman-streams.com:443';
export const AUTH_SERVER_RU_URL = 'https://ru.rocketman-streams.com:443';
export const AUTH_SERVER_LOCAL_URL = 'https://local.rocketman-streams.com:443';

/**
 * Resolves auth server URL from stored params and application runtime flags.
 * Developer mode uses the user-selected value from addon settings.
 * Production mode picks domain from proxy setting without exposing a selector.
 * @param paramsApiServer - Stored `api_server` value from addon params.
 * @returns Auth server base URL.
 * @example
 * resolveApiServerUrl(params.api_server);
 */
export const resolveApiServerUrl = (paramsApiServer?: string): string => {
  if (isDeveloperMode) {
    return paramsApiServer || DEFAULT_API_SERVER;
  }

  return isProxyMode ? AUTH_SERVER_RU_URL : DEFAULT_API_SERVER;
};

export const buildAuthServerSelectOptions = (includeLocalhost: boolean) => {
  const urlLabel = (url: string) => ({
    en: url,
    ru: url,
    uk: url,
  });

  const options = [
    { value: DEFAULT_API_SERVER, label: urlLabel(DEFAULT_API_SERVER) },
    { value: AUTH_SERVER_RU_URL, label: urlLabel(AUTH_SERVER_RU_URL) },
  ];

  if (includeLocalhost) {
    options.push({
      value: AUTH_SERVER_LOCAL_URL,
      label: urlLabel(AUTH_SERVER_LOCAL_URL),
    });
  }

  return options;
};

export const REDIRECT_URI = 'http://localhost:3000/addon/donationalerts/auth';

export const OAUTH_AUTHORIZE_URL =
  'https://www.donationalerts.com/oauth/authorize';

export const API_BASE = 'https://www.donationalerts.com/api/v1';

export const CENTRIFUGO_WS_URL =
  'wss://centrifugo.donationalerts.com/connection/websocket';

export const SCOPES = [
  'oauth-donation-index',
  'oauth-user-show',
  'oauth-donation-subscribe',
] as const;
