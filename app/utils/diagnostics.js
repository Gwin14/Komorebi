import * as Sentry from "@sentry/react-native";
import { BETA_ENABLED } from "./beta";

let requestedEnabled = false;
let active = false;
let configurationQueue = Promise.resolve();

// Read the saved preference before initializing either the JS or native SDK.
// Serialize close/init so rapid toggles cannot leave native reporting enabled.
export function configureDiagnostics(enabled) {
  requestedEnabled = enabled;
  if (!enabled) {
    const client = Sentry.getClient();
    if (client) client.getOptions().enabled = false;
  }
  configurationQueue = configurationQueue.then(async () => {
    if (active && !requestedEnabled) {
      await Sentry.close();
      active = false;
    }
    if (!active && requestedEnabled) {
      const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ||
        (__DEV__ ? "development" : BETA_ENABLED ? "preview" : "production");
      Sentry.init({
        dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ||
          "https://cd139b926fdfcff7d0904702b844bc77@o4512165584764928.ingest.us.sentry.io/4512165639487488",
        environment,
        // Build type only affects performance sampling, never error reporting.
        enabled: true,
        sampleRate: 1,
        tracesSampleRate: environment === "production" ? 0.2 : 1,
        sendDefaultPii: false,
        beforeSend: (event) => requestedEnabled ? event : null,
        beforeSendTransaction: (event) => requestedEnabled ? event : null,
        beforeBreadcrumb: (breadcrumb) => requestedEnabled ? breadcrumb : null,
      });
      active = true;
    } else if (active && requestedEnabled) {
      const client = Sentry.getClient();
      if (client) client.getOptions().enabled = true;
    }
  }).catch((error) => {
    console.warn("Não foi possível atualizar os diagnósticos", error);
  });
  return configurationQueue;
}
