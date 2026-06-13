import { DonationAlertsApi } from './api';
import { buildAuthServerSelectOptions, DEFAULT_API_SERVER } from './constants';
import {
  buildLogoutLabel,
  formatAccountLabel,
  logoutFallback,
} from './locale';
import { mergeDonationAlertsParams } from './params';
import {
  startDonationAlertsTracking,
  stopDonationAlertsTracking,
} from './tracking';

const clearDonationAlertsAuth = () => {
  stopDonationAlertsTracking();
  return mergeDonationAlertsParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
    user_name: '',
    user_id: 0,
  }).then(() => {
    DonationAlertsApi.accessToken = null;
    DonationAlertsApi.refreshToken = null;
    DonationAlertsApi.clearUserOAuthCache();
    RegenerateConfig();
  });
};

export const RegenerateConfig = () => {
  api.config.getParams().then(async params => {
    const access_token = params.access_token || '';
    const refresh_token = params.refresh_token || '';
    const api_server = params.api_server || DEFAULT_API_SERVER;
    const token_expires_at =
      typeof params.token_expires_at === 'number' ? params.token_expires_at : 0;
    let user_name =
      typeof params.user_name === 'string' ? params.user_name : '';
    let user_id = typeof params.user_id === 'number' ? params.user_id : 0;

    DonationAlertsApi.setApiServer(api_server);
    DonationAlertsApi.accessToken = access_token || null;
    DonationAlertsApi.refreshToken = refresh_token || null;

    if (DonationAlertsApi.accessToken) {
      const ok = await DonationAlertsApi.ensureAccessToken(token_expires_at);
      if (!ok) {
        await clearDonationAlertsAuth();
        return;
      }

      const user = await DonationAlertsApi.getUserOAuth(true);
      if (!user) {
        await clearDonationAlertsAuth();
        return;
      }

      if (user.name !== user_name || user.id !== user_id) {
        user_name = user.name;
        user_id = user.id;
        await mergeDonationAlertsParams({ user_name, user_id });
      }

      void startDonationAlertsTracking(user);
    } else {
      stopDonationAlertsTracking();
    }

    const fields: Parameters<typeof GenerateConfig>[0] = [
      {
        key: 'api_server',
        type: 'select',
        default: DEFAULT_API_SERVER,
        options: buildAuthServerSelectOptions(isDeveloperMode),
        editor: {
          label: {
            en: 'API Server',
            ru: 'API сервер',
            uk: 'API сервер',
          },
          description: {
            en: 'Auth server URL (domain + port)',
            ru: 'URL сервера авторизации (домен + порт)',
            uk: 'URL сервера авторизації (домен + порт)',
          },
        },
      },
      {
        key: 'access_token',
        type: 'text',
        default: '',
      },
      {
        key: 'refresh_token',
        type: 'text',
        default: '',
      },
      {
        key: 'token_expires_at',
        type: 'number',
        default: 0,
      },
    ];

    if (access_token) {
      const account = formatAccountLabel(user_name, user_id);
      fields.push({
        type: 'button',
        key: 'logout',
        event: 'donationalertsLogout',
        editor: {
          label: account ? buildLogoutLabel(account) : logoutFallback,
        },
      });
    } else {
      fields.push({
        type: 'button',
        key: 'login',
        event: 'donationalertsLogin',
        editor: {
          label: {
            en: 'Login via DonationAlerts',
            ru: 'Войти через DonationAlerts',
            uk: 'Увійти через DonationAlerts',
          },
        },
      });
    }

    GenerateConfig(fields);
  });
};
