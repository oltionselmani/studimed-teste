'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useI18n } from '@/lib/i18n/provider';
import { deleteAccountAction, updateProfileAction, type FormState } from '@/lib/actions/auth';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Notice,
  cx,
  inputClass,
} from '@/components/ui/primitives';
import { ThemeToggle } from '@/components/AppShell';
import type { User } from '@/lib/types';

function SaveButton() {
  const { pending } = useFormStatus();
  const { d } = useI18n();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? d.common.saving : d.common.save}
    </Button>
  );
}

export function SettingsPage({
  user,
  apiKeyFromEnv,
  apiKeyConfigured,
  model,
  dataLocation,
}: {
  user: User;
  apiKeyFromEnv: boolean;
  apiKeyConfigured: boolean;
  model: string;
  dataLocation: string;
}) {
  const { d } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, {});
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 lg:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{d.settings.title}</h1>

      <form action={action} className="mt-7 space-y-5">
        <Card>
          <CardHeader title={d.settings.profile} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={d.auth.name} htmlFor="name">
              <input id="name" name="name" className={inputClass} defaultValue={user.name} />
            </Field>
            <Field label={d.auth.email}>
              <input className={cx(inputClass, 'opacity-60')} value={user.email} readOnly />
            </Field>
            <Field label={d.auth.university} htmlFor="university">
              <input
                id="university"
                name="university"
                className={inputClass}
                defaultValue={user.university}
              />
            </Field>
            <Field label={d.auth.program} htmlFor="program">
              <input id="program" name="program" className={inputClass} defaultValue={user.program} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={d.settings.appearance} />
          <div className="space-y-5 p-5">
            <Field label={d.settings.interfaceLanguage} htmlFor="locale">
              <select id="locale" name="locale" className={inputClass} defaultValue={user.locale}>
                <option value="en">{d.common.english}</option>
                <option value="sq">{d.common.albanian}</option>
              </select>
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-medium">{d.settings.theme}</span>
              <ThemeToggle />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">{d.settings.tone}</legend>
              <div className="space-y-2">
                {(['direct', 'blunt'] as const).map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-[var(--bg-hover)]"
                  >
                    <input
                      type="radio"
                      name="tone"
                      value={value}
                      defaultChecked={user.tone === value}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium">
                        {value === 'direct' ? d.settings.toneDirect : d.settings.toneBlunt}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {value === 'direct' ? d.settings.toneDirectHelp : d.settings.toneBluntHelp}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                name="notifications"
                defaultChecked={Boolean(user.notifications_enabled)}
                className="mt-1"
              />
              <span className="text-sm">{d.settings.notificationsEnabled}</span>
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title={d.settings.ai} />
          <div className="space-y-5 p-5">
            {apiKeyFromEnv ? (
              <Notice tone="success">{d.settings.apiKeyEnvSet}</Notice>
            ) : apiKeyConfigured ? null : (
              <Notice tone="warn">{d.settings.apiKeyMissing}</Notice>
            )}

            {!apiKeyFromEnv ? (
              <Field
                label={d.settings.apiKey}
                hint={
                  <>
                    {d.settings.apiKeyHelp}
                    <span className="mt-1 block">{d.settings.apiKeyShared}</span>
                  </>
                }
                htmlFor="apiKey"
              >
                <input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  className={inputClass}
                  placeholder={apiKeyConfigured ? '••••••••••••••••' : 'sk-ant-…'}
                  autoComplete="off"
                />
              </Field>
            ) : null}

            <Field label={d.settings.model}>
              <input className={cx(inputClass, 'opacity-60 font-mono')} value={model} readOnly />
            </Field>
          </div>
        </Card>

        {state.ok ? <Notice tone="success">{d.common.saved}</Notice> : null}

        <div className="flex justify-end">
          <SaveButton />
        </div>
      </form>

      <Card className="mt-5">
        <CardHeader title={d.settings.data} subtitle={d.settings.dataHelp} />
        <div className="p-5">
          <Field label={d.settings.dataLocation}>
            <input className={cx(inputClass, 'font-mono text-xs opacity-60')} value={dataLocation} readOnly />
          </Field>
        </div>
      </Card>

      <Card className="mt-5 border-[var(--bad)]">
        <CardHeader title={d.settings.dangerZone} />
        <div className="p-5">
          {confirmDelete ? (
            <div className="space-y-3">
              <Notice tone="danger">{d.exam.deleteConfirm}</Notice>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                  {d.common.cancel}
                </Button>
                <form action={deleteAccountAction}>
                  <Button type="submit" variant="danger">
                    {d.settings.deleteAccount}
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {d.settings.deleteAccount}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
