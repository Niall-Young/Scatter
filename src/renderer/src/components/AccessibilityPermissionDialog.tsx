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
  onOpenGuide: () => Promise<void>;
  onResetPermission: () => Promise<void>;
}

export function AccessibilityPermissionDialog({
  error,
  onDismiss,
  onOpenGuide,
  onResetPermission,
  open
}: AccessibilityPermissionDialogProps): ReactElement {
  const { t } = useI18n();
  const [isOpeningGuide, setIsOpeningGuide] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    setIsOpeningGuide(false);
    setIsResetting(false);
  }, [open]);

  async function openGuide(): Promise<void> {
    if (isOpeningGuide || isResetting) return;
    setIsOpeningGuide(true);
    setActionError(null);
    try {
      await onOpenGuide();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : t("accessibilityPermission.requestFailed"));
    } finally {
      setIsOpeningGuide(false);
    }
  }

  async function resetPermission(): Promise<void> {
    if (isOpeningGuide || isResetting) return;
    setIsResetting(true);
    setActionError(null);
    try {
      await onResetPermission();
    } catch (resetError) {
      setActionError(resetError instanceof Error ? resetError.message : t("accessibilityPermission.resetFailed"));
    } finally {
      setIsResetting(false);
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
                disabled={isOpeningGuide || isResetting}
              />
            </RadixDialog.Close>
          </header>

          <div className="accessibility-permission-dialog-body">
            <p id="accessibility-permission-description" className="accessibility-permission-dialog-copy">
              {t("accessibilityPermission.description")}
            </p>
            <p className="accessibility-permission-dialog-hint">{t("accessibilityPermission.hint")}</p>
            <p className="accessibility-permission-dialog-hint">{t("accessibilityPermission.resetHint")}</p>
          </div>

          <footer className="accessibility-permission-dialog-footer">
            {error || actionError ? <p className="accessibility-permission-dialog-error">{error || actionError}</p> : null}
            <div className="accessibility-permission-dialog-actions">
              <KitButton filled={false} size="md" disabled={isOpeningGuide || isResetting} onClick={onDismiss}>
                {t("accessibilityPermission.later")}
              </KitButton>
              <KitButton filled={false} size="md" disabled={isOpeningGuide || isResetting} onClick={() => void resetPermission()}>
                {isResetting ? t("accessibilityPermission.resetting") : t("accessibilityPermission.reset")}
              </KitButton>
              <KitButton filled size="md" disabled={isOpeningGuide || isResetting} onClick={() => void openGuide()}>
                {isOpeningGuide ? t("accessibilityPermission.openingGuide") : t("accessibilityPermission.openGuide")}
              </KitButton>
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
