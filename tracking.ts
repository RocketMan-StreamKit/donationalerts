import { DonationAlertsApi, type DonationAlertsUser } from './api';
import { DonationAlertsCentrifugoClient } from './centrifugo-client';
import { notifyConnectionStatus } from './status-notify';

let starting = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let centrifugoClient: DonationAlertsCentrifugoClient | null = null;

const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export const startDonationAlertsTracking = async (user: DonationAlertsUser) => {
  if (starting || !DonationAlertsApi.accessToken) {
    return;
  }

  starting = true;
  stopDonationAlertsTracking();
  status.Update({ current: 'connecting' });

  try {
    centrifugoClient = new DonationAlertsCentrifugoClient(user.id);
    await centrifugoClient.start();

    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        void (async () => {
          if (!DonationAlertsApi.accessToken) {
            return;
          }
          const params = await api.config.getParams<{
            token_expires_at?: number;
          }>();
          await DonationAlertsApi.ensureAccessToken(params.token_expires_at);
        })();
      }, REFRESH_CHECK_INTERVAL_MS);
    }

    status.Update({
      current: 'online',
      message: { en: 'DonationAlerts' },
    });
    notifyConnectionStatus('online');

    console.log(
      `[DonationAlerts] Tracking started for user ${user.id} (${user.name})`
    );
  } catch (error) {
    console.error('DonationAlerts tracking failed to start:', error);
    status.Update({ current: 'error' });
    notifyConnectionStatus('error');
    stopDonationAlertsTracking({ notify: false });
  } finally {
    starting = false;
  }
};

export const stopDonationAlertsTracking = (options?: { notify?: boolean }) => {
  centrifugoClient?.stop();
  centrifugoClient = null;
  DonationAlertsApi.clearUserOAuthCache();
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  status.Update({ current: 'offline' });
  if (options?.notify !== false) {
    notifyConnectionStatus('offline');
  }
};
