import { useEffect, useMemo, useState, type ReactElement } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  defaultAppSettings,
  type AppSettings,
  type AppUpdateState,
  type AssistantProvider,
  type LanguagePreference,
  type ThemePreference
} from "../../../shared/types";
import { useI18n } from "../lib/i18n";
import type { Translate } from "../lib/translations";
import { DropdownMenu, DropdownMenuItem } from "./ui/dropdown-menu";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";
import { SelectTrigger } from "./ui/select";
import { Switch } from "./ui/switch";

export type SettingsValues = AppSettings;

interface SettingsDialogProps extends SettingsValues {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
  onPreview: (values: SettingsValues) => void;
  onSave: (values: SettingsValues) => Promise<void>;
  showTranslucentBackground?: boolean;
  updateState: AppUpdateState;
}

interface SettingsOption<TValue extends string> {
  label: string;
  value: TValue;
}

function SettingsSelect<TValue extends string>({
  ariaLabel,
  onChange,
  options,
  value
}: {
  ariaLabel: string;
  onChange: (value: TValue) => void;
  options: Array<SettingsOption<TValue>>;
  value: TValue;
}): ReactElement {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>
        <SelectTrigger className="settings-dialog-select" filled label={selected.label} size="sm" aria-label={ariaLabel} />
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content className="settings-dialog-select-popover" sideOffset={6} align="end">
          <DropdownMenu className="settings-dialog-select-menu" role="menu">
            {options.map((option) => (
              <RadixDropdownMenu.Item key={option.value} asChild>
                <DropdownMenuItem
                  label={option.label}
                  selected={option.value === value}
                  role="menuitemradio"
                  aria-checked={option.value === value}
                  onClick={() => onChange(option.value)}
                />
              </RadixDropdownMenu.Item>
            ))}
          </DropdownMenu>
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}

function updateStatusText(updateState: AppUpdateState, t: Translate): string {
  if (!updateState.isPackaged && updateState.status !== "error") return t("settings.update.developmentMode");
  if (updateState.canInstall) return t("settings.update.status.downloaded");
  if (updateState.status === "idle") return t("settings.update.status.idle");
  if (updateState.status === "checking") return t("settings.update.status.checking");
  if (updateState.status === "downloading") {
    const progress = Math.round(updateState.progressPercent ?? 0);
    return t("settings.update.status.downloading", { progress });
  }
  if (updateState.status === "downloaded") return t("settings.update.status.downloaded");
  if (updateState.status === "not-available") return t("settings.update.status.notAvailable");
  if (updateState.errorCode === "development-mode") return t("settings.update.developmentMode");
  return updateState.errorMessage || t("settings.update.status.error");
}

function updateActionLabel(updateState: AppUpdateState, t: Translate): string {
  if (updateState.canInstall) return t("settings.update.install");
  if (updateState.status === "checking") return t("settings.update.checking");
  if (updateState.status === "downloading") return t("settings.update.downloading");
  return t("settings.update.check");
}

export function SettingsDialog({
  assistantProvider,
  assistantProviderOnboardingCompleted,
  language,
  onCheckForUpdates,
  onInstallUpdate,
  onOpenChange,
  onPreview,
  onSave,
  open,
  showTranslucentBackground = true,
  themePreference,
  translucentBackground,
  updateState
}: SettingsDialogProps): ReactElement {
  const { t } = useI18n();
  const [draftThemePreference, setDraftThemePreference] = useState(themePreference);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [draftTranslucentBackground, setDraftTranslucentBackground] = useState(translucentBackground);
  const [draftAssistantProvider, setDraftAssistantProvider] = useState(assistantProvider);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const themeOptions: Array<SettingsOption<ThemePreference>> = [
    { label: t("settings.theme.system"), value: "system" },
    { label: t("settings.theme.light"), value: "light" },
    { label: t("settings.theme.dark"), value: "dark" }
  ];
  const languageOptions: Array<SettingsOption<LanguagePreference>> = [
    { label: t("settings.language.zh"), value: "zh" },
    { label: t("settings.language.en"), value: "en" }
  ];
  const assistantProviderOptions: Array<SettingsOption<AssistantProvider>> = [
    { label: t("settings.assistantProvider.codex"), value: "codex" },
    { label: t("settings.assistantProvider.claudeCli"), value: "claude-cli" }
  ];

  useEffect(() => {
    setDraftThemePreference(themePreference);
    setDraftLanguage(language);
    setDraftTranslucentBackground(translucentBackground);
    setDraftAssistantProvider(assistantProvider);
    setSaveError(null);
  }, [assistantProvider, language, themePreference, translucentBackground]);

  const saveValues = useMemo(
    () => ({
      themePreference: draftThemePreference,
      language: draftLanguage,
      translucentBackground: draftTranslucentBackground,
      assistantProvider: draftAssistantProvider,
      assistantProviderOnboardingCompleted
    }),
    [assistantProviderOnboardingCompleted, draftAssistantProvider, draftLanguage, draftThemePreference, draftTranslucentBackground]
  );

  useEffect(() => {
    if (!open) return;
    onPreview(saveValues);
  }, [onPreview, open, saveValues]);

  async function save(): Promise<void> {
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(saveValues);
      onOpenChange(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("settings.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  const updateActionDisabled = !updateState.canInstall && (updateState.status === "checking" || updateState.status === "downloading");
  const updateAction = updateState.canInstall ? onInstallUpdate : onCheckForUpdates;
  const latestVersion = updateState.downloadedVersion || updateState.availableVersion;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="settings-dialog-overlay" />
        <RadixDialog.Content className="settings-dialog-content" aria-describedby={undefined}>
          <header className="settings-dialog-header">
            <RadixDialog.Title className="settings-dialog-title">{t("settings.title")}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton className="settings-dialog-close" filled={false} icon="x" size="sm" aria-label={t("settings.close")} />
            </RadixDialog.Close>
          </header>

          <div className="settings-dialog-body">
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">{t("settings.theme")}</span>
              <SettingsSelect ariaLabel={t("settings.theme")} options={themeOptions} value={draftThemePreference} onChange={setDraftThemePreference} />
            </div>
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">{t("settings.language")}</span>
              <SettingsSelect ariaLabel={t("settings.language")} options={languageOptions} value={draftLanguage} onChange={setDraftLanguage} />
            </div>
            <div className="settings-dialog-row">
              <span className="settings-dialog-row-label">{t("settings.assistantProvider")}</span>
              <SettingsSelect
                ariaLabel={t("settings.assistantProvider")}
                options={assistantProviderOptions}
                value={draftAssistantProvider}
                onChange={setDraftAssistantProvider}
              />
            </div>
            {showTranslucentBackground ? (
              <div className="settings-dialog-row">
                <span className="settings-dialog-row-label">{t("settings.translucentBackground")}</span>
                <Switch checked={draftTranslucentBackground} onCheckedChange={setDraftTranslucentBackground} />
              </div>
            ) : null}
            <section className="settings-dialog-update" aria-label={t("settings.update.title")}>
              <div className="settings-dialog-update-copy">
                <p className="settings-dialog-update-title">{t("settings.update.title")}</p>
                <p className="settings-dialog-update-status">{updateStatusText(updateState, t)}</p>
                <p className="settings-dialog-update-version">{t("settings.update.currentVersion", { version: updateState.currentVersion })}</p>
                {latestVersion ? (
                  <p className="settings-dialog-update-version">{t("settings.update.latestVersion", { version: latestVersion })}</p>
                ) : null}
              </div>
              <KitButton
                className="settings-dialog-update-action"
                filled={updateState.canInstall}
                size="md"
                disabled={updateActionDisabled}
                onClick={() => void updateAction()}
              >
                {updateActionLabel(updateState, t)}
              </KitButton>
            </section>
          </div>

          <footer className="settings-dialog-footer">
            {saveError ? <p className="settings-dialog-error">{saveError}</p> : null}
            <div className="settings-dialog-actions">
              <KitButton
                filled={false}
                size="md"
                disabled={isSaving}
                onClick={() => {
                  setDraftThemePreference(defaultAppSettings.themePreference);
                  setDraftLanguage(defaultAppSettings.language);
                  setDraftTranslucentBackground(defaultAppSettings.translucentBackground);
                  setDraftAssistantProvider(defaultAppSettings.assistantProvider);
                }}
              >
                {t("settings.restoreDefaults")}
              </KitButton>
              <KitButton
                filled
                size="md"
                disabled={isSaving}
                onClick={() => void save()}
              >
                {isSaving ? t("settings.saving") : t("settings.save")}
              </KitButton>
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
