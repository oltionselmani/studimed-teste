import { requireUser } from '@/lib/auth/session';
import {
  PROVIDERS,
  PROVIDER_IDS,
  apiKeyFromEnv,
  getApiKey,
  modelFor,
  providerFromEnv,
  providerId,
} from '@/lib/ai/client';
import { dataDir } from '@/lib/db/paths';
import { SettingsPage } from '@/components/SettingsPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await requireUser();
  const active = await providerId();

  const providers = await Promise.all(
    PROVIDER_IDS.map(async (id) => ({
      id,
      label: PROVIDERS[id].label,
      keyPlaceholder: PROVIDERS[id].keyPlaceholder,
      keyUrl: PROVIDERS[id].keyUrl,
      envVar: PROVIDERS[id].envVar,
      model: modelFor(id),
      keyFromEnv: apiKeyFromEnv(id),
      // Whether a key exists at all, from the environment or local settings.
      keyConfigured: Boolean(await getApiKey(id)),
    })),
  );

  return (
    <SettingsPage
      user={user}
      providers={providers}
      activeProvider={active}
      providerLocked={providerFromEnv() !== null}
      dataLocation={dataDir()}
    />
  );
}
