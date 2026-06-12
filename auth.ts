import {
  CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  REDIRECT_URI,
  SCOPES,
} from './constants';
import { DonationAlertsApi } from './api';
import { RegenerateConfig } from './config';
import { mergeDonationAlertsParams } from './params';
import { stopDonationAlertsTracking } from './tracking';

const buildAuthUrl = () => {
  const query = new URLSearchParams();
  query.set('client_id', CLIENT_ID);
  query.set('redirect_uri', REDIRECT_URI);
  query.set('response_type', 'code');
  query.set('scope', SCOPES.join(' '));
  return `${OAUTH_AUTHORIZE_URL}?${query.toString()}`;
};

events.On('donationalertsLogin', () => {
  api.openUrl(buildAuthUrl());
});

events.On('donationalertsLogout', async () => {
  stopDonationAlertsTracking();
  await mergeDonationAlertsParams({
    access_token: '',
    refresh_token: '',
    token_expires_at: 0,
  });
  RegenerateConfig();
});

network.endpoints.create('auth', 'GET', 'donationalertsAuthCallback');

events.On('donationalertsAuthCallback', async ({ query }) => {
  const error = typeof query.error === 'string' ? query.error : '';
  if (error) {
    return {
      redirect: ui.auth.generateFail(
        `DonationAlerts authorization failed: ${error}`
      ),
    };
  }

  const code = typeof query.code === 'string' ? query.code : '';
  if (!code) {
    return {
      redirect: ui.auth.generateFail('Missing authorization code'),
    };
  }

  const params = await api.config.getParams<{ api_server?: string }>();
  DonationAlertsApi.setApiServer(params.api_server);

  const exchanged = await DonationAlertsApi.exchangeAuthorizationCode(code);
  if (!exchanged.success || !exchanged.accessToken) {
    const message = exchanged.message || 'Token exchange failed';
    return {
      redirect: ui.auth.generateFail(message),
    };
  }

  const expiresAt =
    typeof exchanged.expiresIn === 'number'
      ? Date.now() + exchanged.expiresIn * 1000
      : Date.now() + 3600 * 1000;

  await mergeDonationAlertsParams({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken || '',
    token_expires_at: expiresAt,
  });

  RegenerateConfig();

  return {
    redirect: ui.auth.generateSuccess(
      'Authorization successful. You can close this window.'
    ),
  };
});
