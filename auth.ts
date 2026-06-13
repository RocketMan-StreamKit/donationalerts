import {
  CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  REDIRECT_URI,
  resolveApiServerUrl,
  SCOPES,
} from './constants';
import { DonationAlertsApi } from './api';
import { RegenerateConfig } from './config';
import { authMessages, pickLang } from './locale';
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
    user_name: '',
    user_id: 0,
  });
  RegenerateConfig();
});

network.endpoints.create('auth', 'GET', 'donationalertsAuthCallback');

events.On('donationalertsAuthCallback', async ({ query }) => {
  const error = typeof query.error === 'string' ? query.error : '';
  if (error) {
    return {
      redirect: ui.auth.generateFail(pickLang(authMessages.authFailed(error))),
    };
  }

  const code = typeof query.code === 'string' ? query.code : '';
  if (!code) {
    return {
      redirect: ui.auth.generateFail(pickLang(authMessages.missingCode)),
    };
  }

  const params = await api.config.getParams<{ api_server?: string }>();
  DonationAlertsApi.setApiServer(resolveApiServerUrl(params.api_server));

  const exchanged = await DonationAlertsApi.exchangeAuthorizationCode(code);
  if (!exchanged.success || !exchanged.accessToken) {
    const message =
      exchanged.message || pickLang(authMessages.tokenExchangeFailed);
    return {
      redirect: ui.auth.generateFail(message),
    };
  }

  const expiresAt =
    typeof exchanged.expiresIn === 'number'
      ? Date.now() + exchanged.expiresIn * 1000
      : Date.now() + 3600 * 1000;

  DonationAlertsApi.accessToken = exchanged.accessToken;
  DonationAlertsApi.refreshToken = exchanged.refreshToken || null;

  await mergeDonationAlertsParams({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken || '',
    token_expires_at: expiresAt,
  });

  const user = await DonationAlertsApi.getUserOAuth(true);
  if (user) {
    await mergeDonationAlertsParams({
      user_name: user.name,
      user_id: user.id,
    });
  }

  RegenerateConfig();

  return {
    redirect: ui.auth.generateSuccess(pickLang(authMessages.success)),
  };
});
