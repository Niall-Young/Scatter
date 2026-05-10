import { useEffect, useState, type ReactElement } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useI18n } from "../lib/i18n";
import { Icon } from "./ui/icon";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";

interface AccessibilityPermissionDialogProps {
  error: string | null;
  open: boolean;
  onDismiss: () => void;
  onOpenSettings: () => Promise<void>;
  onRequest: () => Promise<void>;
}

export function AccessibilityPermissionDialog({
  error,
  onDismiss,
  onOpenSettings,
  onRequest,
  open
}: AccessibilityPermissionDialogProps): ReactElement {
  const { t } = useI18n();
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    setIsOpeningSettings(false);
    setIsRequesting(false);
  }, [open]);

  async function request(): Promise<void> {
    if (isRequesting || isOpeningSettings) return;
    setIsRequesting(true);
    setActionError(null);
    try {
      await onRequest();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : t("accessibilityPermission.requestFailed"));
    } finally {
      setIsRequesting(false);
    }
  }

  async function openSettings(): Promise<void> {
    if (isRequesting || isOpeningSettings) return;
    setIsOpeningSettings(true);
    setActionError(null);
    try {
      await onOpenSettings();
    } catch (settingsError) {
      setActionError(settingsError instanceof Error ? settingsError.message : t("accessibilityPermission.openSettingsFailed"));
    } finally {
      setIsOpeningSettings(false);
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onDismiss();
    }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="accessibility-permission-dialog-overlay" />
        <RadixDialog.Content className="accessibility-permission-dialog-content" aria-describedby="accessibility-permission-description">
          <header className="accessibility-permission-dialog-header">
            <div className="accessibility-permission-dialog-icon" aria-hidden="true">
              <Icon name="app-permission" size={20} />
            </div>
            <RadixDialog.Title className="accessibility-permission-dialog-title">{t("accessibilityPermission.title")}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton
                className="accessibility-permission-dialog-close"
                filled={false}
                icon="x"
                size="sm"
                aria-label={t("accessibilityPermission.close")}
                disabled={isRequesting || isOpeningSettings}
              />
            </RadixDialog.Close>
          </header>

          <div className="accessibility-permission-dialog-body">
            <p id="accessibility-permission-description" className="accessibility-permission-dialog-copy">
              {t("accessibilityPermission.description")}
            </p>
            <p className="accessibility-permission-dialog-hint">{t("accessibilityPermission.hint")}</p>
          </div>

          <footer className="accessibility-permission-dialog-footer">
            {error || actionError ? <p className="accessibility-permission-dialog-error">{error || actionError}</p> : null}
            <div className="accessibility-permission-dialog-actions">
              <KitButton filled={false} size="md" disabled={isRequesting || isOpeningSettings} onClick={onDismiss}>
                {t("accessibilityPermission.later")}
              </KitButton>
              <KitButton filled={false} size="md" disabled={isRequesting || isOpeningSettings} onClick={() => void openSettings()}>
                {isOpeningSettings ? t("accessibilityPermission.openingSettings") : t("accessibilityPermission.openSettings")}
              </KitButton>
              <KitButton filled size="md" disabled={isRequesting || isOpeningSettings} onClick={() => void request()}>
                {isRequesting ? t("accessibilityPermission.requesting") : t("accessibilityPermission.request")}
              </KitButton>
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
