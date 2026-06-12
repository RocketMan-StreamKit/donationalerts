import './auth';
import { RegenerateConfig } from './config';
import { PLATFORM } from './constants';
import { registerDonationAlertsOverlayTriggers } from './triggers';

void dashboard.registerPlatform({
  id: PLATFORM,
  name: {
    en: 'DonationAlerts',
    ru: 'DonationAlerts',
    uk: 'DonationAlerts',
  },
});

void registerDonationAlertsOverlayTriggers();

status.OnClick(() => {
  api.restart();
});

RegenerateConfig();
