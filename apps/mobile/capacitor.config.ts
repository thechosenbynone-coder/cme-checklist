import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cme.checklist',
  appName: 'CME Checklist',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
