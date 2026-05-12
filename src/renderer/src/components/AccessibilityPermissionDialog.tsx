import { useEffect, useState, type ReactElement } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useI18n } from "../lib/i18n";
import { IconButton } from "./ui/icon-button";
import { KitButton } from "./ui/kit-button";

interface AccessibilityPermissionDialogProps {
  open: boolean;
  onDismiss: () => void;
  onOpenGuide: () => Promise<void>;
}

export function AccessibilityPermissionDialog({
  onDismiss,
  onOpenGuide,
  open
}: AccessibilityPermissionDialogProps): ReactElement {
  const { t } = useI18n();
  const [isOpeningGuide, setIsOpeningGuide] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    setIsOpeningGuide(false);
  }, [open]);

  async function openGuide(): Promise<void> {
    if (isOpeningGuide) return;
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

  return (
    <RadixDialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onDismiss();
    }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="accessibility-permission-dialog-overlay" />
        <RadixDialog.Content className="accessibility-permission-dialog-content" aria-describedby="accessibility-permission-description">
          <header className="accessibility-permission-dialog-header">
            <RadixDialog.Title className="accessibility-permission-dialog-title">{t("accessibilityPermission.title")}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton
                className="accessibility-permission-dialog-close"
                filled={false}
                icon="x"
                size="sm"
                aria-label={t("accessibilityPermission.close")}
                disabled={isOpeningGuide}
              />
            </RadixDialog.Close>
          </header>

          <div className="accessibility-permission-dialog-body">
            <p id="accessibility-permission-description" className="accessibility-permission-dialog-copy">
              {t("accessibilityPermission.description")}
            </p>
          </div>

          <footer className="accessibility-permission-dialog-footer">
            {actionError ? <p className="sr-only" role="alert">{actionError}</p> : null}
            <div className="accessibility-permission-dialog-actions">
              <KitButton filled size="md" disabled={isOpeningGuide} onClick={() => void openGuide()}>
                {isOpeningGuide ? t("accessibilityPermission.openingGuide") : t("accessibilityPermission.openGuide")}
              </KitButton>
            </div>
          </footer>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
