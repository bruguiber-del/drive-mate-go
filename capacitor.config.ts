import type { CapacitorConfig } from '@capacitor/cli';

// appId es provisional — fácil de cambiar más adelante, solo importa de
// verdad para publicar en la App Store (tiene que coincidir con el
// identificador que se registre en el portal de Apple Developer).
const config: CapacitorConfig = {
  appId: 'app.vimatch.ios',
  appName: 'VIMATCH',
  webDir: 'dist',
};

export default config;
