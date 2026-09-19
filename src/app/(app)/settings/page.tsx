import { requireUser } from '@/lib/auth/session';
import { apiKeyFromEnv, getApiKey, modelId } from '@/lib/ai/client';
import { dataDir } from '@/lib/db/paths';
import { SettingsPage } from '@/components/SettingsPage';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await requireUser();
  const key = await getApiKey();

  return (
    <SettingsPage
      user={user}
      apiKeyFromEnv={apiKeyFromEnv()}
      apiKeyConfigured={Boolean(key)}
      model={modelId()}
      dataLocation={dataDir()}
    />
  );
}
